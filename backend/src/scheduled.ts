import { encodeFunctionData } from "viem";
import type { Env } from "./types";
import { submitContractTx, ESCROW_ABI } from "./chain/contracts";

export async function scheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // 1. Done jobs past 24h acceptance period → claimTimeout
  const expiredDone = await env.DB.prepare(
    "SELECT id FROM jobs WHERE status = 'done' AND done_at > 0 AND done_at + 86400 < ?1 LIMIT 10"
  )
    .bind(now)
    .all<{ id: number }>();

  for (const row of expiredDone.results) {
    try {
      const data = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "claimTimeout",
        args: [BigInt(row.id)],
      });
      const { hash } = await submitContractTx(
        env,
        env.ESCROW_ADDRESS as `0x${string}`,
        data,
        200_000n
      );
      await env.DB.prepare(
        "UPDATE jobs SET status = 'settled', settled_at = ?1 WHERE id = ?2"
      )
        .bind(now, row.id)
        .run();
      console.log(`[cron] claimTimeout jobId=${row.id} tx=${hash}`);
    } catch (e) {
      console.error(`[cron] claimTimeout failed jobId=${row.id}:`, e);
    }
  }

  // 2. Any non-settled jobs past 7d → forceClose
  const staleJobs = await env.DB.prepare(
    "SELECT id FROM jobs WHERE status != 'settled' AND created_at + 604800 < ?1 LIMIT 10"
  )
    .bind(now)
    .all<{ id: number }>();

  for (const row of staleJobs.results) {
    try {
      const data = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "forceClose",
        args: [BigInt(row.id)],
      });
      const { hash } = await submitContractTx(
        env,
        env.ESCROW_ADDRESS as `0x${string}`,
        data,
        200_000n
      );
      await env.DB.prepare(
        "UPDATE jobs SET status = 'settled', settled_at = ?1 WHERE id = ?2"
      )
        .bind(now, row.id)
        .run();
      console.log(`[cron] forceClose jobId=${row.id} tx=${hash}`);
    } catch (e) {
      console.error(`[cron] forceClose failed jobId=${row.id}:`, e);
    }
  }
}
