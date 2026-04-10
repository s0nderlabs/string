import { Hono } from "hono";
import { encodeFunctionData } from "viem";
import type { AppContext } from "../types";
import { submitContractTx, REGISTRY_ABI } from "../chain/contracts";
import { faucetDrip } from "../services/faucet";

const app = new Hono<AppContext>();

app.post("/agents/register", async (c) => {
  const body = await c.req.json();
  const { agent, input, nonce, signature } = body;

  if (!agent || !input || signature === undefined) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const env = c.env;
  const data = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "register",
    args: [agent, input, BigInt(nonce), signature],
  });

  try {
    const { hash } = await submitContractTx(
      env,
      env.REGISTRY_ADDRESS as `0x${string}`,
      data,
      500_000n
    );

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO agents (address, name, model, harness, os, public_key, description, skills, services, active, last_seen, registered_at, updated_at, tx_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?10, ?10, ?11)`
    )
      .bind(
        agent.toLowerCase(),
        input.name,
        input.model,
        input.harness,
        input.os,
        input.publicKey,
        input.description || "",
        JSON.stringify(input.skills || []),
        JSON.stringify(input.services || []),
        now,
        hash
      )
      .run();

    // Faucet drip (non-blocking, best effort)
    const ctx = c.executionCtx as any;
    ctx?.waitUntil?.(
      faucetDrip(env, agent).catch((err: any) =>
        console.error("[faucet] Drip failed:", err)
      )
    );

    return c.json({ txHash: hash, agent });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/agents/update", async (c) => {
  const body = await c.req.json();
  const { agent, input, nonce, signature } = body;

  if (!agent || !input || signature === undefined) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const env = c.env;
  const data = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "updateProfile",
    args: [agent, input, BigInt(nonce), signature],
  });

  try {
    const { hash } = await submitContractTx(
      env,
      env.REGISTRY_ADDRESS as `0x${string}`,
      data,
      500_000n
    );

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE agents SET name=?1, model=?2, harness=?3, os=?4, public_key=?5, description=?6, skills=?7, services=?8, updated_at=?9, tx_hash=?10
       WHERE address=?11`
    )
      .bind(
        input.name,
        input.model,
        input.harness,
        input.os,
        input.publicKey,
        input.description || "",
        JSON.stringify(input.skills || []),
        JSON.stringify(input.services || []),
        now,
        hash,
        agent.toLowerCase()
      )
      .run();

    return c.json({ txHash: hash });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/agents", async (c) => {
  const env = c.env;
  const model = c.req.query("model");
  const os = c.req.query("os");
  const skill = c.req.query("skill");
  const online = c.req.query("online");

  let sql = "SELECT * FROM agents WHERE active = 1";
  const params: any[] = [];
  let idx = 1;

  if (model) {
    sql += ` AND model LIKE ?${idx}`;
    params.push(`%${model}%`);
    idx++;
  }
  if (os) {
    sql += ` AND os = ?${idx}`;
    params.push(os);
    idx++;
  }
  if (skill) {
    sql += ` AND skills LIKE ?${idx}`;
    params.push(`%${skill}%`);
    idx++;
  }

  const now = Math.floor(Date.now() / 1000);
  if (online === "true") {
    sql += ` AND last_seen > ?${idx}`;
    params.push(now - 30);
    idx++;
  }

  sql += " ORDER BY last_seen DESC LIMIT 100";

  const result = await env.DB.prepare(sql)
    .bind(...params)
    .all();

  const agents = result.results.map((a: any) => ({
    ...a,
    skills: JSON.parse(a.skills || "[]"),
    services: JSON.parse(a.services || "[]"),
    online: a.last_seen > now - 30,
  }));

  return c.json({ agents });
});

app.get("/agents/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  const result = await c.env.DB.prepare(
    "SELECT * FROM agents WHERE address = ?1"
  )
    .bind(address)
    .first();

  if (!result) return c.json({ error: "Agent not found" }, 404);

  return c.json({
    ...result,
    skills: JSON.parse((result as any).skills || "[]"),
    services: JSON.parse((result as any).services || "[]"),
    online: (result as any).last_seen > now - 30,
  });
});

export default app;
