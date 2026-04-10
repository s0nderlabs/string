#!/usr/bin/env bun
import { deriveIdentity } from './src/crypto.js'
import { state } from './src/state.js'
import { connectMcp } from './src/server.js'

process.on('unhandledRejection', (err) => {
  process.stderr.write(`string: unhandled rejection: ${err}\n`)
})
process.on('uncaughtException', (err) => {
  process.stderr.write(`string: uncaught exception: ${err}\n`)
})

// Load config from env
const privateKey = process.env.STRING_PRIVATE_KEY
if (!privateKey) {
  process.stderr.write('string: STRING_PRIVATE_KEY is required\n')
  process.exit(1)
}

state.privateKey = privateKey as `0x${string}`
state.rpcUrl = process.env.STRING_RPC_URL || 'https://rpc.ankr.com/eth_sepolia'
state.wssUrl = process.env.STRING_WSS_URL || ''
state.relayAddress = (process.env.STRING_RELAY_ADDRESS || '0x6EC3A52057c98234Bb7D63f3eB1Db92eFa2f63dE') as `0x${string}`
state.verifierAddress = (process.env.STRING_VERIFIER_ADDRESS || '0x443f4aBf3867eA448143c04d5606B6E258c2d5Bd') as `0x${string}`
state.chainId = parseInt(process.env.STRING_CHAIN_ID || '11155111')

const { address, account } = deriveIdentity(state.privateKey)
state.address = address
state.account = account

process.stderr.write(`string: agent ${address}\n`)

// Connect MCP
await connectMcp()

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
