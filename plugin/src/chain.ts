import { createPublicClient, createWalletClient, http, webSocket, parseAbi, encodeFunctionData, defineChain, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { state } from './state.js'

let _publicClient: PublicClient | null = null
let _wsClient: PublicClient | null = null
let _walletClient: WalletClient | null = null
let _chain: any = null

function getChain() {
  if (!_chain) {
    if (state.chainId === 11155111) {
      _chain = sepolia
    } else {
      _chain = defineChain({
        id: state.chainId,
        name: `Chain ${state.chainId}`,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [state.rpcUrl] } },
      })
    }
  }
  return _chain
}

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: getChain(), transport: http(state.rpcUrl) }) as PublicClient
  }
  return _publicClient
}

export function getWsClient(): PublicClient {
  if (!_wsClient) {
    _wsClient = createPublicClient({ chain: getChain(), transport: webSocket(state.wssUrl) }) as PublicClient
  }
  return _wsClient
}

export function getWalletClient(): WalletClient {
  if (!_walletClient) {
    _walletClient = createWalletClient({
      account: privateKeyToAccount(state.privateKey),
      chain: getChain(),
      transport: http(state.rpcUrl),
    })
  }
  return _walletClient
}

const RELAY_ABI = parseAbi([
  'function relayMessage(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[2] _pubSignals, bytes encryptedMessage) returns (uint256)',
  'event MessageVerified(bytes32 indexed commitment, bytes32 indexed senderAddress, bytes encryptedMessage, uint256 timestamp)',
])

export async function submitMessage(calldata: string, encryptedHex: `0x${string}`): Promise<string> {
  const [pA, pB, pC, pubSigs] = JSON.parse('[' + calldata + ']')
  const wallet = getWalletClient()
  const pub = getPublicClient()

  const data = encodeFunctionData({
    abi: RELAY_ABI,
    functionName: 'relayMessage',
    args: [pA, pB, pC, pubSigs, encryptedHex],
  })

  const txHash = await wallet.sendTransaction({
    to: state.relayAddress,
    data,
    gas: 3000000n,
  })

  const receipt = await pub.waitForTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') throw new Error(`Message TX reverted: ${txHash}`)
  return txHash
}

export function watchMessages(callback: (commitment: string, senderAddress: string, encrypted: string, timestamp: bigint) => void): () => void {
  // Use WSS if available, otherwise fall back to HTTP polling
  if (state.wssUrl) {
    const wsClient = getWsClient()
    const unwatch = (wsClient as any).watchContractEvent({
      address: state.relayAddress,
      abi: RELAY_ABI,
      eventName: 'MessageVerified',
      onLogs: (logs: any[]) => {
        for (const log of logs) {
          const { commitment, senderAddress, encryptedMessage, timestamp } = log.args
          callback(commitment, senderAddress, encryptedMessage, timestamp)
        }
      },
    })
    return unwatch
  }

  // HTTP polling fallback
  const pub = getPublicClient()
  let lastBlock = 0n
  let stopped = false

  async function poll() {
    if (lastBlock === 0n) {
      lastBlock = await (pub as any).getBlockNumber()
    }

    while (!stopped) {
      await new Promise(r => setTimeout(r, 1000))
      try {
        const currentBlock = await (pub as any).getBlockNumber()
        if (currentBlock > lastBlock) {
          const logs = await (pub as any).getLogs({
            address: state.relayAddress,
            event: RELAY_ABI[1], // MessageVerified event
            fromBlock: lastBlock + 1n,
            toBlock: currentBlock,
          })
          for (const log of logs) {
            const { commitment, senderAddress, encryptedMessage, timestamp } = log.args
            callback(commitment, senderAddress, encryptedMessage, timestamp)
          }
          lastBlock = currentBlock
        }
      } catch {}
    }
  }

  poll()
  return () => { stopped = true }
}
