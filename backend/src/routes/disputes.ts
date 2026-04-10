import { Hono } from "hono";
import type { AppContext } from "../types";

const app = new Hono<AppContext>();

app.post("/disputes/:id/evidence", async (c) => {
  const jobId = Number(c.req.param("id"));
  const { submitter, messages } = await c.req.json();
  const env = c.env;

  if (!submitter || !messages || !Array.isArray(messages)) {
    return c.json({ error: "Missing submitter or messages" }, 400);
  }

  // Verify job exists and is disputed
  const job = await env.DB.prepare(
    "SELECT * FROM jobs WHERE id = ?1"
  ).bind(jobId).first();

  if (!job) return c.json({ error: "Job not found" }, 404);
  if ((job as any).status !== "disputed") {
    return c.json({ error: "Job is not in disputed state" }, 400);
  }

  // Verify submitter is buyer or provider
  const sub = submitter.toLowerCase();
  if (sub !== (job as any).buyer && sub !== (job as any).provider) {
    return c.json({ error: "Submitter is not a party to this job" }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO dispute_evidence (job_id, submitter, messages, verified, submitted_at)
     VALUES (?1, ?2, ?3, 0, ?4)`
  )
    .bind(jobId, sub, JSON.stringify(messages), now)
    .run();

  return c.json({ jobId, submitter: sub, accepted: true });
});

export default app;
