"""String protocol plugin for Hermes — thin MCP shim.

Spawns the existing Bun MCP server as a subprocess, proxies all 18 tools
to Hermes via ctx.register_tool(), and converts notifications/claude/channel
into ctx.inject_message() calls for agent wake-up.
"""

from __future__ import annotations

import atexit
import json
import logging
import os
import shutil
import subprocess
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Part A: Thread-safe MCP stdio client
# ---------------------------------------------------------------------------

class McpStdioClient:
    """JSON-RPC 2.0 client over a subprocess's stdin/stdout."""

    def __init__(self, proc: subprocess.Popen):
        self._proc = proc
        self._lock = threading.Lock()
        self._next_id = 1
        # pending: {id: (Event, [result_or_exception])}
        self._pending: dict[int, tuple[threading.Event, list]] = {}
        self._notification_cb = None
        self._alive = True
        self._reader = threading.Thread(target=self._read_loop, daemon=True, name="string-mcp-reader")
        self._reader.start()

    @property
    def alive(self) -> bool:
        return self._alive and self._proc.poll() is None

    def request(self, method: str, params: dict | None = None, timeout: float = 120) -> dict:
        if not self.alive:
            raise RuntimeError("MCP subprocess is not running")

        with self._lock:
            req_id = self._next_id
            self._next_id += 1
            event = threading.Event()
            self._pending[req_id] = (event, [None])

        msg: dict = {"jsonrpc": "2.0", "id": req_id, "method": method}
        if params is not None:
            msg["params"] = params

        line = json.dumps(msg) + "\n"
        try:
            self._proc.stdin.write(line.encode())
            self._proc.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            with self._lock:
                self._pending.pop(req_id, None)
            raise RuntimeError(f"Failed to write to MCP subprocess: {exc}") from exc

        if not event.wait(timeout):
            with self._lock:
                self._pending.pop(req_id, None)
            raise TimeoutError(f"MCP request '{method}' timed out after {timeout}s")

        with self._lock:
            _, slot = self._pending.pop(req_id, (None, [None]))

        result = slot[0]
        if isinstance(result, Exception):
            raise result
        return result

    def _read_loop(self):
        try:
            for raw_line in iter(self._proc.stdout.readline, b""):
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if "id" in msg and msg["id"] is not None:
                    req_id = msg["id"]
                    with self._lock:
                        pending = self._pending.get(req_id)
                    if pending:
                        event, slot = pending
                        if "error" in msg:
                            err = msg["error"]
                            slot[0] = RuntimeError(err.get("message", str(err)))
                        else:
                            slot[0] = msg.get("result", {})
                        event.set()
                elif "method" in msg and msg.get("id") is None:
                    if self._notification_cb:
                        try:
                            self._notification_cb(msg["method"], msg.get("params", {}))
                        except Exception as exc:
                            logger.debug("Notification callback error: %s", exc)
        except Exception as exc:
            logger.warning("MCP reader loop exited: %s", exc)
        finally:
            self._alive = False
            # Wake up any pending requests — snapshot first to avoid deadlock
            with self._lock:
                pending_copy = list(self._pending.values())
                self._pending.clear()
            for event, slot in pending_copy:
                slot[0] = RuntimeError("MCP subprocess exited")
                event.set()

    def notify(self, method: str, params: dict | None = None):
        """Send a JSON-RPC notification (no response expected)."""
        msg: dict = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        line = json.dumps(msg) + "\n"
        try:
            self._proc.stdin.write(line.encode())
            self._proc.stdin.flush()
        except (BrokenPipeError, OSError):
            pass

    def on_notification(self, cb):
        self._notification_cb = cb


# ---------------------------------------------------------------------------
# Part B & C & D: Plugin entry point
# ---------------------------------------------------------------------------

_client: McpStdioClient | None = None
_proc: subprocess.Popen | None = None


def _drain_stderr(proc: subprocess.Popen):
    """Read and log stderr from the MCP subprocess."""
    try:
        for raw in iter(proc.stderr.readline, b""):
            line = raw.decode("utf-8", errors="replace").rstrip()
            if line:
                logger.debug("[string] %s", line)
    except Exception:
        pass


def _make_handler(client: McpStdioClient, mcp_name: str):
    """Create an async tool handler that forwards calls to the MCP subprocess."""
    def handler(params: dict, **_kwargs) -> str:
        result = client.request("tools/call", {
            "name": mcp_name,
            "arguments": params or {},
        })
        content = result.get("content", [])
        texts = [c["text"] for c in content if c.get("type") == "text"]
        return "\n".join(texts) if texts else json.dumps(result)
    return handler


def _install_gateway_hook():
    """Auto-install the gateway:startup hook for autonomous chain polling."""
    hook_src = Path(__file__).parent / "hermes-hooks" / "string-bridge"
    hook_dst = Path.home() / ".hermes" / "hooks" / "string-bridge"
    try:
        if hook_dst.exists():
            return  # already installed
        if not hook_src.is_dir():
            return  # hook source not in repo
        import shutil as _shutil
        _shutil.copytree(str(hook_src), str(hook_dst))
        logger.info("Installed string-bridge gateway hook to %s", hook_dst)
    except Exception as exc:
        logger.debug("Could not install gateway hook: %s", exc)


def _setup_gateway_webhook():
    """Auto-configure Hermes webhook platform + subscription for gateway-mode wake-up."""
    hermes_home = Path.home() / ".hermes"

    # 1. Ensure webhook platform is enabled in config.yaml
    try:
        import yaml  # hermes ships with pyyaml
        config_path = hermes_home / "config.yaml"
        if config_path.exists():
            config = yaml.safe_load(config_path.read_text()) or {}
            platforms = config.get("platforms", {})
            if "webhook" not in platforms:
                platforms["webhook"] = {"enabled": True, "extra": {"host": "0.0.0.0", "port": 8644}}
                config["platforms"] = platforms
                config_path.write_text(yaml.dump(config, default_flow_style=False))
                logger.info("Auto-enabled webhook platform in config.yaml (port 8644)")
    except Exception as exc:
        logger.debug("Could not auto-configure webhook platform: %s", exc)

    # 2. Ensure webhook subscription exists
    subs_path = hermes_home / "webhook_subscriptions.json"
    try:
        if subs_path.exists():
            subs = json.loads(subs_path.read_text())
        else:
            subs = {}
        if "string" not in subs:
            subs["string"] = {
                "secret": "INSECURE_NO_AUTH",
                "prompt": "You received a message on String:\n\n{content}",
            }
            subs_path.write_text(json.dumps(subs, indent=2))
            logger.debug("Created webhook subscription for String gateway fallback")
    except Exception as exc:
        logger.warning("Failed to setup webhook subscription: %s", exc)


def _post_webhook(content: str):
    """POST notification to Hermes webhook adapter (gateway-mode fallback)."""
    import urllib.request
    payload = json.dumps({"content": content}).encode()
    req = urllib.request.Request(
        "http://localhost:8644/webhooks/string",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as exc:
        logger.debug("Webhook POST failed (non-fatal): %s", exc)


def register(ctx):
    """Hermes plugin entry point — spawn MCP subprocess and register tools."""
    global _client, _proc

    # --- Check bun is available ---
    if not shutil.which("bun"):
        raise RuntimeError(
            "bun is required for the String plugin. Install from https://bun.sh"
        )

    # --- Resolve plugin directory ---
    plugin_dir = os.environ.get(
        "STRING_PLUGIN_DIR",
        str(Path(__file__).parent / "plugin"),
    )
    if not Path(plugin_dir).is_dir():
        raise RuntimeError(f"String plugin directory not found: {plugin_dir}")

    # --- Spawn MCP subprocess with per-harness state dir ---
    # Skip if already running (prevents double-spawn from hook + plugin in gateway mode)
    if _proc is not None and _proc.poll() is None:
        logger.info("String MCP subprocess already running (pid %d), skipping", _proc.pid)
        return
    # Skip if the gateway hook is running the poller (check for the hook's subprocess)
    if os.environ.get("STRING_HOOK_ACTIVE") == "1":
        logger.info("String gateway hook active, skipping plugin subprocess spawn")
        return

    hermes_state_dir = str(Path.home() / ".hermes" / "channels" / "string")
    env = {**os.environ, "STRING_STATE_DIR": hermes_state_dir}

    _proc = subprocess.Popen(
        ["bun", "run", "--cwd", plugin_dir, "--shell=bun", "--silent", "start"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
        env=env,
    )
    threading.Thread(target=_drain_stderr, args=(_proc,), daemon=True, name="string-stderr").start()

    # --- Create MCP client and initialize ---
    _client = McpStdioClient(_proc)

    init_result = _client.request("initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "hermes-string-shim", "version": "0.1.0"},
    }, timeout=30)
    logger.debug("MCP initialized: %s", init_result.get("serverInfo", {}))

    # Send initialized notification (MCP protocol requirement)
    _client.notify("notifications/initialized")

    # --- Discover and register tools ---
    tools_result = _client.request("tools/list")
    tools = tools_result.get("tools", [])
    logger.info("String plugin: discovered %d tools", len(tools))

    for tool in tools:
        mcp_name = tool["name"]
        prefixed = f"string_{mcp_name}"
        schema = {
            "name": prefixed,
            "description": tool.get("description", ""),
            "parameters": tool.get("inputSchema", {"type": "object", "properties": {}}),
        }
        ctx.register_tool(
            name=prefixed,
            toolset="string",
            schema=schema,
            handler=_make_handler(_client, mcp_name),
            is_async=False,
            description=tool.get("description", ""),
        )

    # --- Notification handler for wake-up ---
    _install_gateway_hook()
    _setup_gateway_webhook()

    def _on_notification(method: str, params: dict):
        if method != "notifications/claude/channel":
            return
        content = params.get("content", "")
        meta = params.get("meta", {})
        agent_id = meta.get("agent_id", "unknown")
        user = meta.get("user", "unknown")
        ts = meta.get("ts", "")

        formatted = (
            f'<channel source="string" agent_id="{agent_id}" user="{user}" ts="{ts}">\n'
            f"{content}\n"
            f"</channel>"
        )

        injected = ctx.inject_message(formatted, role="user")
        if not injected:
            _post_webhook(formatted)

    _client.on_notification(_on_notification)

    # --- Cleanup on exit ---
    def _cleanup():
        if _proc and _proc.poll() is None:
            _proc.terminate()
            try:
                _proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                _proc.kill()

    atexit.register(_cleanup)
    logger.info("String plugin registered (%d tools, wake-up enabled)", len(tools))
