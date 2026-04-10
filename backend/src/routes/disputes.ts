import { Hono } from "hono";
import type { AppContext } from "../types";
import { verifyMessageCommitment } from "../services/poseidon";

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

  // Verify each message via Poseidon hash
  const details: Array<{ commitment: string; verified: boolean; reason?: string }> = [];
  let allVerified = true;

  for (const msg of messages) {
    if (!msg.plaintext || !msg.commitment) {
      details.push({
        commitment: msg.commitment || "missing",
        verified: false,
        reason: "Missing plaintext or commitment",
      });
      allVerified = false;
      continue;
    }

    // Recompute Poseidon hash and compare
    const { matches: hashMatches, decimalCommitment } = verifyMessageCommitment(msg.plaintext, msg.commitment);
    if (!hashMatches) {
      details.push({
        commitment: msg.commitment,
        verified: false,
        reason: "Poseidon hash mismatch — plaintext was tampered",
      });
      allVerified = false;
      continue;
    }

    // Confirm the commitment exists in relayed messages table
    // Try both formats: the claimed commitment and the decimal "0x" format
    const dbMsg = await env.DB.prepare(
      "SELECT id FROM messages WHERE commitment = ?1 OR commitment = ?2 LIMIT 1"
    ).bind(msg.commitment, "0x" + decimalCommitment).first();

    if (!dbMsg) {
      details.push({
        commitment: msg.commitment,
        verified: false,
        reason: "Commitment not found in relayed messages",
      });
      allVerified = false;
      continue;
    }

    details.push({ commitment: msg.commitment, verified: true });
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO dispute_evidence (job_id, submitter, messages, verified, submitted_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(jobId, sub, JSON.stringify(messages), allVerified ? 1 : 0, now)
    .run();

  return c.json({
    jobId,
    submitter: sub,
    accepted: true,
    verified: allVerified,
    details,
  });
});

app.get("/disputes/:id/evidence", async (c) => {
  const jobId = Number(c.req.param("id"));
  const env = c.env;
  const caller = c.req.header("x-agent-address")?.toLowerCase();

  // Verify job exists
  const job = await env.DB.prepare(
    "SELECT * FROM jobs WHERE id = ?1"
  ).bind(jobId).first();

  if (!job) return c.json({ error: "Job not found" }, 404);

  // Gate: only buyer, provider, or judge can read evidence
  const allowed = [
    (job as any).buyer,
    (job as any).provider,
    env.JUDGE_ADDRESS?.toLowerCase(),
  ];
  if (!caller || !allowed.includes(caller)) {
    return c.json({ error: "Not authorized to view this evidence" }, 403);
  }

  const result = await env.DB.prepare(
    "SELECT * FROM dispute_evidence WHERE job_id = ?1 ORDER BY submitted_at ASC"
  ).bind(jobId).all();

  return c.json({ evidence: result.results });
});

export default app;
