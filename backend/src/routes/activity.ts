import { Hono } from "hono";
import type { AppContext } from "../types";

const app = new Hono<AppContext>();

app.get("/activity", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || "50"), 1000);

  const result = await c.env.DB.prepare(`
    SELECT * FROM (
      SELECT 'message' as type, sender, recipient, NULL as job_id, NULL as buyer, NULL as provider, NULL as amount, NULL as agent, NULL as name, tx_hash, commitment, NULL as status, NULL as done_at, NULL as settled_at, NULL as description_hash, timestamp as ts
      FROM messages ORDER BY timestamp DESC LIMIT ?1
      UNION ALL
      SELECT 'job_created' as type, NULL, NULL, id as job_id, buyer, provider, amount, NULL, NULL, tx_hash, NULL, status, done_at, settled_at, description_hash, created_at as ts
      FROM jobs ORDER BY created_at DESC LIMIT ?1
      UNION ALL
      SELECT 'job_settled' as type, NULL, NULL, id as job_id, buyer, provider, amount, NULL, NULL, tx_hash, NULL, status, done_at, settled_at, description_hash, settled_at as ts
      FROM jobs WHERE status = 'settled' AND settled_at > 0 ORDER BY settled_at DESC LIMIT ?1
      UNION ALL
      SELECT 'registration' as type, NULL, NULL, NULL, NULL, NULL, NULL, address as agent, name, NULL, NULL, NULL, NULL, NULL, NULL, registered_at as ts
      FROM agents WHERE active = 1 ORDER BY registered_at DESC LIMIT ?1
    )
    ORDER BY ts DESC
    LIMIT ?1
  `)
    .bind(limit)
    .all();

  const events = result.results.map((row: any) => {
    const base: any = { type: row.type, ts: row.ts };
    if (row.tx_hash) base.txHash = row.tx_hash;

    switch (row.type) {
      case "message":
        base.sender = row.sender;
        base.recipient = row.recipient;
        if (row.commitment) base.commitment = row.commitment;
        break;
      case "job_created":
      case "job_settled":
        base.jobId = row.job_id;
        base.buyer = row.buyer;
        base.provider = row.provider;
        base.amount = row.amount;
        if (row.status) base.status = row.status;
        if (row.done_at) base.doneAt = row.done_at;
        if (row.settled_at) base.settledAt = row.settled_at;
        if (row.description_hash) base.descriptionHash = row.description_hash;
        break;
      case "registration":
        base.agent = row.agent;
        base.name = row.name;
        break;
    }
    return base;
  });

  return c.json({ events });
});

export default app;
