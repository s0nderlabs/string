import { createPublicClient, http, parseAbiItem, defineChain, type PublicClient } from 'viem'
import { state } from './state.js'
import { saveBookmark } from './bookmark.js'

let _publicClient: PublicClient | null = null
let _chain: any = null

function getChain() {
  if (!_chain) {
    _chain = defineChain({
      id: state.chainId,
      name: 'HashKey Testnet',
      nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
      rpcUrls: { default: { http: [state.rpcUrl] } },
    })
  }
  return _chain
}

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: getChain(), transport: http(state.rpcUrl) }) as PublicClient
  }
  return _publicClient
}

// ── Registry view calls (free, no gas) ──

const REGISTRY_NONCE_ABI = [{
  name: 'nonces',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'agent', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

const REGISTRY_IS_REGISTERED_ABI = [{
  name: 'isRegistered',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'agent', type: 'address' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

export async function getRegistryNonce(address: `0x${string}`): Promise<bigint> {
  const pub = getPublicClient()
  return (pub as any).readContract({
    address: state.registryAddress,
    abi: REGISTRY_NONCE_ABI,
    functionName: 'nonces',
    args: [address],
  })
}

export async function isRegistered(address: `0x${string}`): Promise<boolean> {
  const pub = getPublicClient()
  return (pub as any).readContract({
    address: state.registryAddress,
    abi: REGISTRY_IS_REGISTERED_ABI,
    functionName: 'isRegistered',
    args: [address],
  })
}

export async function getUsdcBalance(address: `0x${string}`): Promise<bigint> {
  const pub = getPublicClient()
  return (pub as any).readContract({
    address: state.usdcAddress,
    abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [address],
  })
}

// ── Event ABIs (v2) ──

const MESSAGE_VERIFIED_EVENT = parseAbiItem(
  'event MessageVerified(bytes32 indexed commitment, address indexed sender, bytes encryptedMessage, uint256 timestamp)'
)

const JOB_CREATED_EVENT = parseAbiItem(
  'event JobCreated(uint256 indexed jobId, address indexed buyer, address indexed provider, uint256 amount, bytes32 descriptionHash)'
)

const JOB_MARKED_DONE_EVENT = parseAbiItem(
  'event JobMarkedDone(uint256 indexed jobId, uint256 doneAt)'
)

const JOB_ACCEPTED_EVENT = parseAbiItem(
  'event JobAccepted(uint256 indexed jobId)'
)

const JOB_DISPUTED_EVENT = parseAbiItem(
  'event JobDisputed(uint256 indexed jobId)'
)

const JOB_SETTLED_EVENT = parseAbiItem(
  'event JobSettled(uint256 indexed jobId, address indexed recipient, uint256 payout, uint256 fee)'
)

const JOB_FORCE_CLOSED_EVENT = parseAbiItem(
  'event JobForceClosed(uint256 indexed jobId)'
)

const DISPUTE_RESOLVED_EVENT = parseAbiItem(
  'event DisputeResolved(uint256 indexed jobId, uint256 buyerAmount, uint256 providerAmount, uint256 fee)'
)

// ── Callback types ──

export interface MessageEvent {
  commitment: string
  sender: string
  encryptedMessage: string
  timestamp: bigint
}

export type JobEventType = 'created' | 'done' | 'accepted' | 'disputed' | 'settled' | 'force_closed' | 'dispute_resolved'

export interface JobEvent {
  type: JobEventType
  jobId: bigint
  buyer?: string
  provider?: string
  amount?: bigint
  recipient?: string
  payout?: bigint
  buyerAmount?: bigint
  providerAmount?: bigint
}

// ── Unified polling ──

export function watchEvents(
  onMessage: (evt: MessageEvent) => void,
  onJob: (evt: JobEvent) => void,
  startBlock?: bigint | null
): () => void {
  const pub = getPublicClient()
  let lastBlock = startBlock || 0n
  let stopped = false
  let tickCount = 0

  async function poll() {
    if (lastBlock === 0n) {
      lastBlock = await (pub as any).getBlockNumber()
    }

    while (!stopped) {
      await new Promise(r => setTimeout(r, 3000))
      tickCount++

      // Heartbeat: ping backend every 20s to keep last_seen fresh (agent stays online)
      if (tickCount % 20 === 0) {
        const { getAgent } = await import('./api.js')
        getAgent(state.address).catch(() => {})
      }

      try {
        const currentBlock: bigint = await (pub as any).getBlockNumber()
        if (currentBlock <= lastBlock) continue

        const fromBlock = lastBlock + 1n
        const toBlock = currentBlock

        // Fetch message events + escrow events (2 RPC calls instead of 8)
        const esc = state.escrowAddress
        const [messageLogs, escrowLogs] = await Promise.all([
          (pub as any).getLogs({ address: state.relayAddress, event: MESSAGE_VERIFIED_EVENT, fromBlock, toBlock }),
          (pub as any).getLogs({
            address: esc,
            events: [JOB_CREATED_EVENT, JOB_MARKED_DONE_EVENT, JOB_ACCEPTED_EVENT, JOB_DISPUTED_EVENT, JOB_SETTLED_EVENT, JOB_FORCE_CLOSED_EVENT, DISPUTE_RESOLVED_EVENT],
            fromBlock, toBlock,
          }),
        ])

        for (const log of messageLogs) {
          onMessage({ commitment: log.args.commitment, sender: log.args.sender, encryptedMessage: log.args.encryptedMessage, timestamp: log.args.timestamp })
        }
        for (const log of escrowLogs) {
          const name = log.eventName
          if (name === 'JobCreated') onJob({ type: 'created', jobId: log.args.jobId, buyer: log.args.buyer, provider: log.args.provider, amount: log.args.amount })
          else if (name === 'JobMarkedDone') onJob({ type: 'done', jobId: log.args.jobId })
          else if (name === 'JobAccepted') onJob({ type: 'accepted', jobId: log.args.jobId })
          else if (name === 'JobDisputed') onJob({ type: 'disputed', jobId: log.args.jobId })
          else if (name === 'JobSettled') onJob({ type: 'settled', jobId: log.args.jobId, recipient: log.args.recipient, payout: log.args.payout })
          else if (name === 'JobForceClosed') onJob({ type: 'force_closed', jobId: log.args.jobId })
          else if (name === 'DisputeResolved') onJob({ type: 'dispute_resolved', jobId: log.args.jobId, buyerAmount: log.args.buyerAmount, providerAmount: log.args.providerAmount })
        }

        lastBlock = currentBlock
        saveBookmark(state.address, currentBlock)
      } catch (err) {
        process.stderr.write(`string: poll error: ${err}\n`)
      }
    }
  }

  poll()
  return () => { stopped = true }
}
