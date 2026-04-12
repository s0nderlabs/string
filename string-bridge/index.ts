/**
 * String notification bridge for OpenClaw.
 *
 * 1. Spawns the String MCP subprocess at gateway startup for chain polling
 * 2. Registers an HTTP route that receives webhook POSTs from the poller
 * 3. Triggers agent turns via `openclaw agent --message`
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { spawn, execFile, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { resolve, join } from "path";

let registered = false;

function findOpenclaw(): string {
  const candidates = [
    resolve(process.env.HOME ?? "/root", ".local/bin/openclaw"),
    resolve(process.env.HOME ?? "/root", ".openclaw/bin/openclaw"),
    "/usr/local/bin/openclaw",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "openclaw";
}

let openclawBin: string | null = null;
let turnInProgress = false;
let pollerProc: ChildProcess | null = null;

function startChainPoller() {
  // Find the String plugin directory (installed as sibling bundle)
  const pluginDir = resolve(
    process.env.HOME ?? "/root",
    ".openclaw/extensions/string/plugin"
  );
  if (!existsSync(pluginDir)) {
    console.error(`[string-bridge] plugin directory not found: ${pluginDir}`);
    return;
  }

  const stateDir = join(process.env.HOME ?? "/root", ".openclaw/channels/string");

  pollerProc = spawn(
    "bun",
    ["run", "--cwd", pluginDir, "--shell=bun", "--silent", "start"],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        STRING_STATE_DIR: stateDir,
        STRING_WEBHOOK_URL: "http://127.0.0.1:18789/plugins/string/notify",
      },
    }
  );

  pollerProc.stderr?.on("data", (c: Buffer) => {
    const l = c.toString("utf-8").trim();
    if (l) console.error(`[string] ${l}`);
  });

  pollerProc.on("exit", (code) => {
    console.error(`[string-bridge] poller exited with code ${code}`);
    pollerProc = null;
  });

  // MCP initialize handshake
  const init = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "openclaw-string-bridge", version: "0.1.0" } },
  }) + "\n";
  pollerProc.stdin!.write(init);

  const notif = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n";
  setTimeout(() => pollerProc?.stdin?.write(notif), 1000);

  console.error(`[string-bridge] chain poller started from ${pluginDir}`);
}

export default definePluginEntry({
  id: "string-bridge",
  name: "String Notification Bridge",
  description: "Receives inbound String messages and triggers agent turns in OpenClaw",

  register(api) {
    if (registered) return;
    registered = true;

    if (!openclawBin) openclawBin = findOpenclaw();

    // Start the chain poller subprocess
    startChainPoller();

    api.registerHttpRoute({
      path: "/plugins/string/notify",
      auth: "plugin",
      async handler(req, res) {
        let body: any;
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return true;
        }

        const content = body.content ?? "";
        const meta = body.meta ?? {};
        const formatted = `<channel source="string" agent_id="${meta.agent_id ?? "unknown"}" user="${meta.user ?? "unknown"}" ts="${meta.ts ?? ""}">\n${content}\n</channel>`;

        console.error(`[string-bridge] incoming: ${content.slice(0, 80)}...`);

        if (turnInProgress) {
          console.error(`[string-bridge] turn in progress, skipping`);
        } else {
          turnInProgress = true;
          execFile(
            openclawBin!,
            ["agent", "--message", formatted, "--session-id", "main"],
            { timeout: 60_000 },
            (err) => {
              turnInProgress = false;
              if (err) console.error(`[string-bridge] agent turn failed: ${err.message}`);
              else console.error(`[string-bridge] agent turn triggered`);
            }
          );
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return true;
      },
    });

    console.error(`[string-bridge] ready (bin: ${openclawBin})`);
  },
});
