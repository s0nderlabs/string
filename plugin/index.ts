#!/usr/bin/env bun
import { deriveIdentity } from './src/crypto.js'
import { state } from './src/state.js'
import { connectMcp } from './src/server.js'
import { loadBookmark } from './src/bookmark.js'
import { isRegistered, getUsdcBalance } from './src/chain.js'
import { generatePrivateKey } from 'viem/accounts'
import { mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import * as api from './src/api.js'

process.on('unhandledRejection', (err) => {
  process.stderr.write(`string: unhandled rejection: ${err}\n`)
})
process.on('uncaughtException', (err) => {
  process.stderr.write(`string: uncaught exception: ${err}\n`)
})

// ── Resolve state directory + webhook: auto-detect harness from dirname or env ──
function detectHarness(): { stateDir: string; webhookUrl: string } {
  const dir = import.meta.dir || ''

  // OpenClaw: check OPENCLAW_STATE_DIR env, OPENCLAW_CONFIG_PATH env, or dirname
  const openclawDir = process.env.OPENCLAW_STATE_DIR || process.env.OPENCLAW_CONFIG_PATH || ''
  if (dir.includes('.openclaw') || (dir.includes('openclaw') && dir.includes('extensions')) || openclawDir !== '') {
    const base = openclawDir || join(process.env.HOME ?? '/root', '.openclaw')
    return { stateDir: join(base, 'channels', 'string'), webhookUrl: 'http://127.0.0.1:18789/plugins/string/notify' }
  }

  // Hermes: check HERMES_HOME env or dirname
  const hermesHome = process.env.HERMES_HOME || ''
  if (dir.includes('.hermes') || (dir.includes('hermes') && dir.includes('plugins')) || hermesHome !== '') {
    const base = hermesHome || join(process.env.HOME ?? '/root', '.hermes')
    return { stateDir: join(base, 'channels', 'string'), webhookUrl: '' }
  }

  // Default: Claude Code
  return { stateDir: join(process.env.HOME ?? '/root', '.claude', 'channels', 'string'), webhookUrl: '' }
}
const harness = detectHarness()
const STATE_DIR = process.env.STRING_STATE_DIR || harness.stateDir
if (!process.env.STRING_WEBHOOK_URL && harness.webhookUrl) {
  process.env.STRING_WEBHOOK_URL = harness.webhookUrl
}
const ENV_PATH = join(STATE_DIR, '.env')

let privateKey = process.env.STRING_PRIVATE_KEY as `0x${string}` | undefined

if (!privateKey) {
  try {
    const content = await Bun.file(ENV_PATH).text()
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('STRING_PRIVATE_KEY=')) {
        privateKey = trimmed.split('=', 2)[1].trim() as `0x${string}`
        break
      }
    }
  } catch {}
}

if (!privateKey) {
  privateKey = generatePrivateKey()
  mkdirSync(STATE_DIR, { recursive: true })
  await Bun.write(ENV_PATH, `STRING_PRIVATE_KEY=${privateKey}\n`)
  chmodSync(ENV_PATH, 0o600)
  process.stderr.write(`string: generated new wallet, saved to ${ENV_PATH}\n`)
}

const backendUrl = process.env.STRING_BACKEND_URL || 'https://api.string.s0nderlabs.xyz'

state.privateKey = privateKey as `0x${string}`
state.backendUrl = backendUrl
state.rpcUrl = process.env.STRING_RPC_URL || 'https://testnet.hsk.xyz'
state.relayAddress = (process.env.STRING_RELAY_ADDRESS || '0xaB194c8030A81FaE84B197CAb238Ed18A5108050') as `0x${string}`
state.escrowAddress = (process.env.STRING_ESCROW_ADDRESS || '0x66B51d3150d461424174F55Fda61363a2e6cc916') as `0x${string}`
state.registryAddress = (process.env.STRING_REGISTRY_ADDRESS || '0x2d8E586847565AA4C517f177d922A37286e9d1F8') as `0x${string}`
state.usdcAddress = (process.env.STRING_USDC_ADDRESS || '0x18ec8e93627c893ae61ae0491c1c98769fd4dfa2') as `0x${string}`
state.feeRecipient = (process.env.STRING_FEE_RECIPIENT || '0xC635e6Eb223aE14143E23cEEa9440bC773dc87Ec') as `0x${string}`
state.chainId = parseInt(process.env.STRING_CHAIN_ID || '133')
state.judgeAddress = process.env.STRING_JUDGE_ADDRESS || ''
state.messagePriceMicros = process.env.STRING_MESSAGE_PRICE || '1000'
state.filePriceMicros = process.env.STRING_FILE_PRICE || '5000'

const { address, account } = deriveIdentity(state.privateKey)
state.address = address
state.account = account as any
state.publicKey = account.publicKey

// ── Startup identity check ──
// Check on-chain registration + USDC balance + backend profile (updates last_seen → online)
try {
  const [onChainRegistered, balance, profile] = await Promise.all([
    isRegistered(address as `0x${string}`),
    getUsdcBalance(address as `0x${string}`),
    api.getAgent(address), // also updates last_seen → agent shows online
  ])

  state.registered = onChainRegistered
  state.usdcBalance = (Number(balance) / 1_000_000).toFixed(2)

  if (profile) {
    state.agentName = (profile as any).name || ''
    state.skills = (profile as any).skills || []
    state.description = (profile as any).description || ''
  }

  process.stderr.write(`string: ${state.registered ? `registered as "${state.agentName}"` : 'NOT registered'} | ${state.usdcBalance} USDC.e\n`)
} catch (err) {
  process.stderr.write(`string: identity check failed (non-fatal): ${err}\n`)
}

// Load block bookmark for catch-up
const savedBlock = loadBookmark(address)
if (savedBlock) {
  process.stderr.write(`string: resuming from block ${savedBlock}\n`)
}

process.stderr.write(`string: agent ${address}\n`)
process.stderr.write(`string: backend ${state.backendUrl}\n`)

// Connect MCP
await connectMcp(savedBlock)

// Shutdown handling
process.stdin.resume()
let shuttingDown = false
function shutdown(reason: string) {
  if (shuttingDown) return
  shuttingDown = true
  process.stderr.write(`string: shutting down (${reason})\n`)
  process.exit(0)
}

process.stdin.on('end', () => shutdown('stdin end'))
process.stdin.on('close', () => shutdown('stdin close'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
