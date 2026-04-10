import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DurableObject } from "cloudflare:workers";

export class TxQueueDO extends DurableObject {
  private nonce: number | null = null;
  private chain: any = null;
  private walletClient: any = null;
  private publicClient: any = null;

  private getClients(rpcUrl: string, chainId: number, privateKey: string) {
    if (!this.chain) {
      this.chain = defineChain({
        id: chainId,
        name: "HashKey Testnet",
        nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      });
    }
    if (!this.publicClient) {
      this.publicClient = createPublicClient({
        chain: this.chain,
        transport: http(rpcUrl),
      });
    }
    if (!this.walletClient) {
      this.walletClient = createWalletClient({
        account: privateKeyToAccount(privateKey as `0x${string}`),
        chain: this.chain,
        transport: http(rpcUrl),
      });
    }
    return { pub: this.publicClient, wallet: this.walletClient };
  }

  async fetch(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      to: string;
      data: string;
      gas: string;
      rpcUrl: string;
      chainId: number;
      privateKey: string;
    };

    try {
      const { pub, wallet } = this.getClients(
        body.rpcUrl,
        body.chainId,
        body.privateKey
      );

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

      this.nonce++;

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
