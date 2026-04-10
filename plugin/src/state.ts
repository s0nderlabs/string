import type { LocalAccount } from 'viem/accounts'

export const state = {
  privateKey: '' as `0x${string}`,
  address: '' as string,
  publicKey: '' as string,
  account: null as LocalAccount | null,
  lastInboundFrom: '' as string,
  lastInboundPubKey: '' as string,
  rpcUrl: '' as string,
  relayAddress: '' as `0x${string}`,
  escrowAddress: '' as `0x${string}`,
  registryAddress: '' as `0x${string}`,
  usdcAddress: '' as `0x${string}`,
  feeRecipient: '' as `0x${string}`,
  backendUrl: '' as string,
  judgeAddress: '' as string,
  messagePriceMicros: '1000' as string,
  filePriceMicros: '5000' as string,
  chainId: 133,
  // Identity (populated at startup)
  registered: false,
  agentName: '' as string,
  usdcBalance: '0' as string,
  skills: [] as string[],
  description: '' as string,
}
