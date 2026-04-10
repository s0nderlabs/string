import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";

export class TxQueueDO extends DurableObject<Env> {
  private nonce: number | null = null;
  private chain: any = null;
  private walletClient: any = null;
  private publicClient: any = null;

  private getClients() {
    if (!this.chain) {
      this.chain = defineChain({
        id: Number(this.env.CHAIN_ID),
        name: "HashKey Testnet",
        nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
        rpcUrls: { default: { http: [this.env.RPC_URL] } },
      });
    }
    if (!this.publicClient) {
      this.publicClient = createPublicClient({
        chain: this.chain,
        transport: http(this.env.RPC_URL),
      });
    }
    if (!this.walletClient) {
      this.walletClient = createWalletClient({
        account: privateKeyToAccount(this.env.HOT_WALLET_PRIVATE_KEY as `0x${string}`),
        chain: this.chain,
        transport: http(this.env.RPC_URL),
      });
    }
    return { pub: this.publicClient, wallet: this.walletClient };
  }

  override async fetch(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      to: string;
      data: string;
      gas: string;
    };

    try {
      const { pub, wallet } = this.getClients();

      // Get nonce from chain if not cached
      if (this.nonce === null) {
        this.nonce = await pub.getTransactionCount({
          address: wallet.account.address,
        });
      }

      const hash = await wallet.sendTransaction({
        to: body.to as `0x${string}`,
        data: body.data as `0x${string}`,
        gas: BigInt(body.gas),
        nonce: this.nonce,
      });

      this.nonce!++;

      const receipt = await pub.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        this.nonce = null; // reset on revert
        return Response.json({ error: `TX reverted: ${hash}` }, { status: 500 });
      }

      return Response.json({
        hash,
        receipt: {
          status: receipt.status,
          logs: receipt.logs.map((l: any) => ({
            address: l.address,
            topics: l.topics,
            data: l.data,
          })),
        },
      });
    } catch (err: any) {
      this.nonce = null; // reset on error so next tx gets fresh nonce
      return Response.json({ error: err.message }, { status: 500 });
    }
  }
}
