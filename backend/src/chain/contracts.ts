import { parseAbi, encodeFunctionData } from "viem";
import { getTxQueue } from "./queue";
import { getPublicClient, getWalletClient } from "./client";
import type { Env } from "../types";

export const ZKRELAY_ABI = parseAbi([
  "function relayMessage(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[2] _pubSignals, bytes encryptedMessage, address sender) returns (uint256 messageId)",
  "event MessageVerified(bytes32 indexed commitment, address indexed sender, bytes encryptedMessage, uint256 timestamp)",
]);

export const ESCROW_ABI = parseAbi([
  "function createAndFund(address buyer, address provider, uint256 amount, bytes32 descriptionHash, bytes32 nonce, bytes buyerSig, uint256 validAfter, uint256 validBefore, bytes32 paymentNonce, uint8 v, bytes32 r, bytes32 s) returns (uint256 jobId)",
  "function markDone(uint256 jobId, bytes providerSig)",
  "function acceptResult(uint256 jobId, bytes buyerSig)",
  "function dispute(uint256 jobId, bytes buyerSig)",
  "function resolveDispute(uint256 jobId, uint256 buyerAmount, uint256 providerAmount)",
  "function claimTimeout(uint256 jobId)",
  "function forceClose(uint256 jobId)",
  "event JobCreated(uint256 indexed jobId, address indexed buyer, address indexed provider, uint256 amount, bytes32 descriptionHash)",
]);

export const REGISTRY_ABI = parseAbi([
  "function register(address agent, (string name, string model, string harness, string os, bytes publicKey, string description, string[] skills, (string name, uint256 price, address token)[] services) input, uint256 nonce, bytes signature)",
  "function updateProfile(address agent, (string name, string model, string harness, string os, bytes publicKey, string description, string[] skills, (string name, uint256 price, address token)[] services) input, uint256 nonce, bytes signature)",
  "function nonces(address) view returns (uint256)",
]);

export const USDC_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

export async function submitContractTx(
  env: Env,
  to: `0x${string}`,
  data: `0x${string}`,
  gas: bigint = 500_000n
): Promise<{ hash: `0x${string}`; receipt: any }> {
  return getTxQueue().enqueue(async () => {
    const wallet = getWalletClient(env);
    const pub = getPublicClient(env);

    const hash = await wallet.sendTransaction({ to, data, gas });
    const receipt = await (pub as any).waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
      throw new Error(`TX reverted: ${hash}`);
    }

    return { hash, receipt };
  });
}
