"""
String gateway bridge hook — starts the MCP subprocess at gateway boot
so the chain poller runs and incoming messages trigger webhook POSTs.
"""

import json
import logging
import os
import subprocess
import threading
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

_proc = None
_running = False


def _drain(stream, label):
    try:
        for line in iter(stream.readline, b""):
            text = line.decode("utf-8", errors="replace").rstrip()
            if text:
                logger.debug("[string] %s", text)
    except Exception:
        pass


def _read_stdout(proc):
    """Read MCP subprocess stdout for notifications, POST to webhook."""
    global _running
    try:
        for raw_line in iter(proc.stdout.readline, b""):
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue

            if msg.get("method") == "notifications/claude/channel" and msg.get("id") is None:
                params = msg.get("params", {})
                content = params.get("content", "")
                meta = params.get("meta", {})
                formatted = (
                    f'<channel source="string" agent_id="{meta.get("agent_id", "unknown")}" '
                    f'user="{meta.get("user", "unknown")}" ts="{meta.get("ts", "")}">\n'
                    f"{content}\n</channel>"
                )
                # POST to Hermes webhook adapter
                try:
                    payload = json.dumps({"content": formatted}).encode()
                    req = urllib.request.Request(
                        "http://localhost:8644/webhooks/string",
                        data=payload,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    urllib.request.urlopen(req, timeout=5)
                    logger.info("[string-bridge] forwarded notification to webhook")
                except Exception as exc:
                    logger.debug("[string-bridge] webhook POST failed: %s", exc)
    except Exception:
        pass
    finally:
        _running = False


async def handle(event_type, context):
    """Called on gateway:startup — spawn the MCP subprocess."""
    global _proc, _running

    if _running:
        return

    plugin_dir = str(Path.home() / ".hermes" / "plugins" / "string" / "plugin")
    if not Path(plugin_dir).is_dir():
        logger.warning("[string-bridge] plugin directory not found: %s", plugin_dir)
        return

    import shutil
    if not shutil.which("bun"):
        logger.warning("[string-bridge] bun not found in PATH")
        return

    # Signal to the plugin's register() to skip subprocess spawn (hook handles it)
    os.environ["STRING_HOOK_ACTIVE"] = "1"

    state_dir = str(Path.home() / ".hermes" / "channels" / "string")
    env = {**os.environ, "STRING_STATE_DIR": state_dir, "STRING_HOOK_ACTIVE": "1"}

    _proc = subprocess.Popen(
        ["bun", "run", "--cwd", plugin_dir, "--shell=bun", "--silent", "start"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
        env=env,
    )
    _running = True

    # Drain stderr
    threading.Thread(target=_drain, args=(_proc.stderr, "stderr"), daemon=True).start()

    # Send MCP initialize
    init_msg = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "hermes-string-gateway-hook", "version": "0.1.0"},
        },
    }) + "\n"
    _proc.stdin.write(init_msg.encode())
    _proc.stdin.flush()

    # Send initialized notification
    notif = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
    _proc.stdin.write(notif.encode())
    _proc.stdin.flush()

    # Start reading stdout for notifications in background
    threading.Thread(target=_read_stdout, args=(_proc,), daemon=True).start()

    logger.info("[string-bridge] MCP subprocess started, chain polling active")
