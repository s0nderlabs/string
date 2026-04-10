import { Hono } from "hono";
import { encodeFunctionData } from "viem";
import type { AppContext } from "../types";
import { submitContractTx, ZKRELAY_ABI } from "../chain/contracts";

const app = new Hono<AppContext>();

app.post("/messages/relay", async (c) => {
  const body = await c.req.json();
  const { proof, pubSignals, encryptedMessage, sender, recipient } = body;

  if (!proof || !pubSignals || !encryptedMessage || !sender || !recipient) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const env = c.env;
  const pA = proof.pA.map((x: string) => BigInt(x));
  const pB = proof.pB.map((row: string[]) => row.map((x: string) => BigInt(x)));
  const pC = proof.pC.map((x: string) => BigInt(x));
  const signals = pubSignals.map((x: string) => BigInt(x));

  const data = encodeFunctionData({
    abi: ZKRELAY_ABI,
    functionName: "relayMessage",
    args: [pA, pB, pC, signals, encryptedMessage as `0x${string}`, sender as `0x${string}`],
  });

  try {
    const { hash, receipt } = await submitContractTx(
      env,
      env.ZKRELAY_ADDRESS as `0x${string}`,
      data,
      600_000n
    );

    const commitment = `0x${pubSignals[0]}`;
    const now = Math.floor(Date.now() / 1000);

    // messageId is the return value of relayMessage — but it's not in event logs.
    // Use the D1 autoincrement id instead for our indexing.
    const messageId = 0; // Will be overwritten by D1 autoincrement

    await env.DB.prepare(
      `INSERT INTO messages (sender, recipient, commitment, encrypted_message, tx_hash, message_id, timestamp)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
      .bind(
        sender.toLowerCase(),
        recipient.toLowerCase(),
        commitment,
        encryptedMessage,
        hash,
        messageId,
        now
      )
      .run();

    return c.json({ messageId, txHash: hash, commitment });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get("/messages", async (c) => {
  const address = c.req.query("address")?.toLowerCase();
  const since = c.req.query("since") || "0";

  if (!address) return c.json({ error: "address parameter required" }, 400);

  const result = await c.env.DB.prepare(
    `SELECT * FROM messages
     WHERE (recipient = ?1 OR sender = ?1) AND timestamp > ?2
     ORDER BY timestamp ASC LIMIT 100`
  )
    .bind(address, Number(since))
    .all();

  return c.json({ messages: result.results });
});

export default app;
