import type { Account } from 'viem/accounts'

export const state = {
  privateKey: '' as `0x${string}`,
  address: '' as string,
  account: null as Account | null,
  lastInboundFrom: '' as string,
  rpcUrl: '' as string,
  wssUrl: '' as string,
  relayAddress: '' as `0x${string}`,
  verifierAddress: '' as `0x${string}`,
  chainId: 11155111,
}
