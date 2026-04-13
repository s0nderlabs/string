import { Hono } from "hono";
import type { AppContext } from "../types";

const app = new Hono<AppContext>();

app.get("/stats", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const onlineThreshold = now - 300;

  const [agentRow, jobRow, msgRow] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE last_seen > ?1) AS online
      FROM agents WHERE active = 1
    `).bind(onlineThreshold).first(),
    c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'funded') AS funded,
        COUNT(*) FILTER (WHERE status = 'done') AS done,
        COUNT(*) FILTER (WHERE status = 'disputed') AS disputed,
        COUNT(*) FILTER (WHERE status = 'settled') AS settled,
        COALESCE(SUM(CAST(amount AS INTEGER)) FILTER (WHERE status = 'settled'), 0) AS volume
      FROM jobs
    `).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM messages`).first(),
  ]);

  if (!agentRow || !jobRow || !msgRow) return c.json({ error: "Failed to fetch stats" }, 500);

  return c.json({
    agents: { total: agentRow.total, online: agentRow.online },
    jobs: {
      total: jobRow.total,
      funded: jobRow.funded,
      done: jobRow.done,
      disputed: jobRow.disputed,
      settled: jobRow.settled,
    },
    volume: String(jobRow.volume),
    messages: msgRow.total,
  });
});

export default app;
