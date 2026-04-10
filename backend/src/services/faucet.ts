import { encodeFunctionData } from "viem";
import { submitContractTx } from "../chain/contracts";
import { USDC_ABI } from "../chain/contracts";
import type { Env } from "../types";

export async function faucetDrip(
  env: Env,
  recipient: string
): Promise<string> {
  const data = encodeFunctionData({
    abi: USDC_ABI,
    functionName: "transfer",
    args: [recipient as `0x${string}`, BigInt(env.FAUCET_AMOUNT)],
  });
  const { hash } = await submitContractTx(
    env,
    env.USDC_ADDRESS as `0x${string}`,
    data,
    100_000n
  );
  return hash;
}
