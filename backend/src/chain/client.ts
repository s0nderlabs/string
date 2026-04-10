import {
  createPublicClient,
  http,
  defineChain,
  type PublicClient,
} from "viem";
import type { Env } from "../types";

export const hashkeyTestnet = defineChain({
  id: 133,
  name: "HashKey Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
});

let _publicClient: PublicClient | null = null;

export function getPublicClient(env: Env): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: hashkeyTestnet,
      transport: http(env.RPC_URL),
    }) as PublicClient;
  }
  return _publicClient;
}
