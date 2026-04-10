import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Env } from "../types";

export const hashkeyTestnet = defineChain({
  id: 133,
  name: "HashKey Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
});

let _publicClient: PublicClient | null = null;
let _walletClient: WalletClient | null = null;

export function getPublicClient(env: Env): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: hashkeyTestnet,
      transport: http(env.RPC_URL),
    }) as PublicClient;
  }
  return _publicClient;
}

export function getWalletClient(env: Env): WalletClient {
  if (!_walletClient) {
    const account = privateKeyToAccount(
      env.HOT_WALLET_PRIVATE_KEY as `0x${string}`
    );
    _walletClient = createWalletClient({
      account,
      chain: hashkeyTestnet,
      transport: http(env.RPC_URL),
    });
  }
  return _walletClient;
}
