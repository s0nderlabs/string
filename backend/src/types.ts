export type Env = {
  DB: D1Database;
  TX_QUEUE: DurableObjectNamespace;
  HOT_WALLET_PRIVATE_KEY: string;
  PINATA_JWT: string;
  CHAIN_ID: string;
  RPC_URL: string;
  USDC_ADDRESS: string;
  ZKRELAY_ADDRESS: string;
  REGISTRY_ADDRESS: string;
  ESCROW_ADDRESS: string;
  FEE_RECIPIENT: string;
  JUDGE_ADDRESS: string;
  MESSAGE_PRICE: string;
  FILE_UPLOAD_PRICE: string;
  FAUCET_AMOUNT: string;
};

export type Variables = {
  paymentVerified?: boolean;
  paymentAmount?: bigint;
  agentAddress?: string;
};

export type AppContext = {
  Bindings: Env;
  Variables: Variables;
};

export function getRoutePrice(
  path: string,
  env: Env
): { amount: string; route: string } | null {
  if (path === "/messages/relay") return { amount: env.MESSAGE_PRICE, route: "messages/relay" };
  if (path === "/files/upload") return { amount: env.FILE_UPLOAD_PRICE, route: "files/upload" };
  return null;
}
