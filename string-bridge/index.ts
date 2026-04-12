/**
 * String notification bridge for OpenClaw.
 *
 * Receives webhook POSTs from the String MCP server when messages arrive,
 * and triggers agent turns via `openclaw agent --message`.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFile, execFileSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

let registered = false;

// Resolve openclaw binary — check common paths, fall back to PATH
function findOpenclaw(): string {
  const candidates = [
    resolve(process.env.HOME ?? "/root", ".local/bin/openclaw"),
    resolve(process.env.HOME ?? "/root", ".openclaw/bin/openclaw"),
    "/usr/local/bin/openclaw",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "openclaw"; // rely on PATH
}

let openclawBin: string | null = null;
let turnInProgress = false;

export default definePluginEntry({
  id: "string-bridge",
  name: "String Notification Bridge",
  description: "Receives inbound String messages and triggers agent turns in OpenClaw",

  register(api) {
    if (registered) return;
    registered = true;

    if (!openclawBin) openclawBin = findOpenclaw();

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

        // Trigger agent turn — execFile avoids shell injection, skip if turn already in progress
        if (turnInProgress) {
          console.error(`[string-bridge] turn in progress, queuing notification`);
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

    console.error(`[string-bridge] notification route registered at /plugins/string/notify (bin: ${openclawBin})`);
  },
});
