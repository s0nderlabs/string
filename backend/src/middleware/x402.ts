import { createMiddleware } from "hono/factory";
import { verifyTypedData, encodeFunctionData } from "viem";
import type { AppContext } from "../types";
import { getRoutePrice } from "../types";
import { submitContractTx } from "../chain/contracts";

const EIP3009_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

interface PaymentAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

interface PaymentPayload {
  x402Version: number;
  payload: {
    authorization: PaymentAuthorization;
    signature: string;
  };
}

export const x402Middleware = createMiddleware<AppContext>(async (c, next) => {
  if (c.get("paymentVerified")) {
    await next();
    return;
  }

  const price = getRoutePrice(c.req.path, c.env);
  if (!price) {
    await next();
    return;
  }

  const env = c.env;
  const paymentHeader = c.req.header("x-payment");

  if (!paymentHeader) {
    return c.json(
      {
        x402Version: 2,
        resource: {
          url: c.req.url,
          description: `API call to ${c.req.path}`,
          mimeType: "application/json",
        },
        accepts: [
          {
            scheme: "exact",
            network: `eip155:${env.CHAIN_ID}`,
            amount: price.amount,
            payTo: env.FEE_RECIPIENT,
            maxTimeoutSeconds: 300,
            asset: env.USDC_ADDRESS,
            extra: { name: "Bridged USDC", version: "2" },
          },
        ],
        error: "Payment Required",
      },
      402
    );
  }

  try {
    const decoded: PaymentPayload = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf-8")
    );
    const { authorization, signature } = decoded.payload;
    const now = Math.floor(Date.now() / 1000);

    if (now < Number(authorization.validAfter)) {
      return c.json({ error: "Authorization not yet valid" }, 402);
    }
    if (now >= Number(authorization.validBefore)) {
      return c.json({ error: "Authorization expired" }, 402);
    }
    if (authorization.to.toLowerCase() !== env.FEE_RECIPIENT.toLowerCase()) {
      return c.json({ error: "Invalid payTo address" }, 402);
    }
    if (BigInt(authorization.value) < BigInt(price.amount)) {
      return c.json({ error: "Insufficient payment amount" }, 402);
    }

    const valid = await verifyTypedData({
      address: authorization.from as `0x${string}`,
      domain: {
        name: "Bridged USDC",
        version: "2",
        chainId: Number(env.CHAIN_ID),
        verifyingContract: env.USDC_ADDRESS as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from as `0x${string}`,
        to: authorization.to as `0x${string}`,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce as `0x${string}`,
      },
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return c.json({ error: "Invalid payment signature" }, 402);
    }

    c.set("paymentVerified", true);
    c.set("paymentAmount", BigInt(price.amount));
    c.set("agentAddress", authorization.from);

    await next();

    // Background settlement on success via unified TxQueue
    if (c.res.status >= 200 && c.res.status < 300) {
      const sig = signature as `0x${string}`;
      const r = `0x${sig.slice(2, 66)}` as `0x${string}`;
      const s = `0x${sig.slice(66, 130)}` as `0x${string}`;
      const v = parseInt(sig.slice(130, 132), 16);

      const data = encodeFunctionData({
        abi: EIP3009_ABI,
        functionName: "transferWithAuthorization",
        args: [
          authorization.from as `0x${string}`,
          authorization.to as `0x${string}`,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce as `0x${string}`,
          v,
          r,
          s,
        ],
      });

      const settlePromise = submitContractTx(
        env,
        env.USDC_ADDRESS as `0x${string}`,
        data,
        250_000n
      )
        .then(({ hash }) => console.log(`[x402] Settled: ${hash}`))
        .catch((err) => console.error("[x402] Settlement failed:", err));

      const ctx = c.executionCtx as any;
      ctx?.waitUntil?.(settlePromise);
    }
  } catch (err) {
    return c.json(
      {
        error: "Payment processing error",
        message: err instanceof Error ? err.message : "Unknown",
      },
      400
    );
  }
});
