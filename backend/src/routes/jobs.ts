import { Hono } from "hono";
import { encodeFunctionData, verifyTypedData } from "viem";
import type { AppContext } from "../types";
import { submitContractTx, ESCROW_ABI } from "../chain/contracts";

const app = new Hono<AppContext>();

app.post("/jobs/create", async (c) => {
  const body = await c.req.json();
  const {
    buyer, provider, amount, description, descriptionHash, nonce, buyerSig,
    validAfter, validBefore, paymentNonce, v, r, s,
  } = body;

  if (!buyer || !provider || !amount || !buyerSig) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const env = c.env;
  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "createAndFund",
    args: [
      buyer as `0x${string}`,
      provider as `0x${string}`,
      BigInt(amount),
      descriptionHash as `0x${string}`,
      nonce as `0x${string}`,
      buyerSig as `0x${string}`,
      BigInt(validAfter),
      BigInt(validBefore),
      paymentNonce as `0x${string}`,
      v,
      r as `0x${string}`,
      s as `0x${string}`,
    ],
  });

  try {
    const { hash, receipt } = await submitContractTx(
      env,
      env.ESCROW_ADDRESS as `0x${string}`,
      data,
      500_000n
    );

    // Parse jobId from JobCreated event (first indexed topic after event sig = jobId)
    let jobId = 0;
    for (const log of receipt.logs || []) {
      if (log.address?.toLowerCase() === env.ESCROW_ADDRESS.toLowerCase()) {
        jobId = Number(BigInt(log.topics[1]));
        break;
      }
    }

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO jobs (id, buyer, provider, amount, description, description_hash, status, tx_hash, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'funded', ?7, ?8)`
    )
      .bind(jobId, buyer.toLowerCase(), provider.toLowerCase(), amount, description || '', descriptionHash, hash, now)
      .run();

    return c.json({ jobId, txHash: hash });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/jobs/:id/done", async (c) => {
  const jobId = Number(c.req.param("id"));
  const { providerSig } = await c.req.json();
  if (!providerSig) return c.json({ error: "Missing providerSig" }, 400);
  const env = c.env;

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "markDone",
    args: [BigInt(jobId), providerSig as `0x${string}`],
  });

  try {
    const { hash } = await submitContractTx(env, env.ESCROW_ADDRESS as `0x${string}`, data, 200_000n);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE jobs SET status = 'done', done_at = ?1 WHERE id = ?2").bind(now, jobId).run();
    return c.json({ txHash: hash });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/jobs/:id/accept", async (c) => {
  const jobId = Number(c.req.param("id"));
  const { buyerSig } = await c.req.json();
  if (!buyerSig) return c.json({ error: "Missing buyerSig" }, 400);
  const env = c.env;

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "acceptResult",
    args: [BigInt(jobId), buyerSig as `0x${string}`],
  });

  try {
    const { hash } = await submitContractTx(env, env.ESCROW_ADDRESS as `0x${string}`, data, 200_000n);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE jobs SET status = 'settled', settled_at = ?1 WHERE id = ?2").bind(now, jobId).run();
    return c.json({ txHash: hash });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/jobs/:id/dispute", async (c) => {
  const jobId = Number(c.req.param("id"));
  const { buyerSig } = await c.req.json();
  if (!buyerSig) return c.json({ error: "Missing buyerSig" }, 400);
  const env = c.env;

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "dispute",
    args: [BigInt(jobId), buyerSig as `0x${string}`],
  });

  try {
    const { hash } = await submitContractTx(env, env.ESCROW_ADDRESS as `0x${string}`, data, 200_000n);
    await env.DB.prepare("UPDATE jobs SET status = 'disputed' WHERE id = ?1").bind(jobId).run();
    return c.json({ txHash: hash });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/jobs/:id/resolve", async (c) => {
  const env = c.env;
  const jobId = Number(c.req.param("id"));
  const { buyerAmount, providerAmount, judgeSig } = await c.req.json();

  if (buyerAmount === undefined || providerAmount === undefined || !judgeSig) {
    return c.json({ error: "Missing buyerAmount, providerAmount, or judgeSig" }, 400);
  }

  // Verify EIP-712 signature from judge
  const valid = await verifyTypedData({
    address: env.JUDGE_ADDRESS as `0x${string}`,
    domain: {
      name: "StringEscrow",
      version: "1",
      chainId: Number(env.CHAIN_ID),
      verifyingContract: env.ESCROW_ADDRESS as `0x${string}`,
    },
    types: {
      ResolveDispute: [
        { name: "jobId", type: "uint256" },
        { name: "buyerAmount", type: "uint256" },
        { name: "providerAmount", type: "uint256" },
      ],
    },
    primaryType: "ResolveDispute",
    message: {
      jobId: BigInt(jobId),
      buyerAmount: BigInt(buyerAmount),
      providerAmount: BigInt(providerAmount),
    },
    signature: judgeSig as `0x${string}`,
  });

  if (!valid) {
    return c.json({ error: "Invalid judge signature" }, 403);
  }

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "resolveDispute",
    args: [BigInt(jobId), BigInt(buyerAmount), BigInt(providerAmount)],
  });

  try {
    const { hash } = await submitContractTx(env, env.ESCROW_ADDRESS as `0x${string}`, data, 300_000n);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE jobs SET status = 'settled', settled_at = ?1 WHERE id = ?2").bind(now, jobId).run();
    return c.json({ txHash: hash });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/jobs/:id/claim", async (c) => {
  const jobId = Number(c.req.param("id"));
  const env = c.env;

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "claimTimeout",
    args: [BigInt(jobId)],
  });

  try {
    const { hash } = await submitContractTx(env, env.ESCROW_ADDRESS as `0x${string}`, data, 200_000n);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE jobs SET status = 'settled', settled_at = ?1 WHERE id = ?2").bind(now, jobId).run();
    return c.json({ txHash: hash });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/jobs/:id/refund", async (c) => {
  const jobId = Number(c.req.param("id"));
  const env = c.env;

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "forceClose",
    args: [BigInt(jobId)],
  });

  try {
    const { hash } = await submitContractTx(env, env.ESCROW_ADDRESS as `0x${string}`, data, 200_000n);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE jobs SET status = 'settled', settled_at = ?1 WHERE id = ?2").bind(now, jobId).run();
    return c.json({ txHash: hash });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/jobs/:id", async (c) => {
  const jobId = Number(c.req.param("id"));
  const result = await c.env.DB.prepare(
    "SELECT * FROM jobs WHERE id = ?1"
  ).bind(jobId).first();

  if (!result) return c.json({ error: "Job not found" }, 404);
  return c.json({ job: result });
});

app.get("/jobs", async (c) => {
  const address = c.req.query("address")?.toLowerCase();
  if (!address) return c.json({ error: "address parameter required" }, 400);

  const result = await c.env.DB.prepare(
    "SELECT * FROM jobs WHERE buyer = ?1 OR provider = ?1 ORDER BY created_at DESC LIMIT 50"
  )
    .bind(address)
    .all();

  return c.json({ jobs: result.results });
});

export default app;
