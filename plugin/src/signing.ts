import { state } from './state.js'

// ── Shared constants ──

export const TRANSFER_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

export function randomBytes32(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Buffer.from(bytes).toString('hex')}` as `0x${string}`
}

// ── EIP-712 Domains ──

function escrowDomain() {
  return {
    name: 'StringEscrow',
    version: '1',
    chainId: state.chainId,
    verifyingContract: state.escrowAddress,
  }
}

function registryDomain() {
  return {
    name: 'StringRegistry',
    version: '1',
    chainId: state.chainId,
    verifyingContract: state.registryAddress,
  }
}

export function usdcDomain() {
  return {
    name: 'Bridged USDC',
    version: '2',
    chainId: state.chainId,
    verifyingContract: state.usdcAddress,
  }
}

function signTypedData(opts: any) {
  return state.account!.signTypedData(opts)
}

// ── Escrow Signing ──

const ESCROW_TYPES = {
  CreateJob: [
    { name: 'buyer', type: 'address' },
    { name: 'provider', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'descriptionHash', type: 'bytes32' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

const JOB_ACTION_TYPES = {
  MarkDone: { MarkDone: [{ name: 'jobId', type: 'uint256' }] },
  AcceptResult: { AcceptResult: [{ name: 'jobId', type: 'uint256' }] },
  Dispute: { Dispute: [{ name: 'jobId', type: 'uint256' }] },
} as const

export async function signCreateJob(
  buyer: `0x${string}`,
  provider: `0x${string}`,
  amount: bigint,
  descriptionHash: `0x${string}`,
  nonce: `0x${string}`
): Promise<`0x${string}`> {
  return signTypedData({
    domain: escrowDomain(),
    types: ESCROW_TYPES,
    primaryType: 'CreateJob',
    message: { buyer, provider, amount, descriptionHash, nonce },
  })
}

export async function signMarkDone(jobId: bigint): Promise<`0x${string}`> {
  return signTypedData({
    domain: escrowDomain(),
    types: JOB_ACTION_TYPES.MarkDone,
    primaryType: 'MarkDone',
    message: { jobId },
  })
}

export async function signAcceptResult(jobId: bigint): Promise<`0x${string}`> {
  return signTypedData({
    domain: escrowDomain(),
    types: JOB_ACTION_TYPES.AcceptResult,
    primaryType: 'AcceptResult',
    message: { jobId },
  })
}

export async function signDispute(jobId: bigint): Promise<`0x${string}`> {
  return signTypedData({
    domain: escrowDomain(),
    types: JOB_ACTION_TYPES.Dispute,
    primaryType: 'Dispute',
    message: { jobId },
  })
}

// ── Registry Signing ──

const SERVICE_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'price', type: 'uint256' },
  { name: 'token', type: 'address' },
] as const

const PROFILE_FIELDS = [
  { name: 'name', type: 'string' },
  { name: 'model', type: 'string' },
  { name: 'harness', type: 'string' },
  { name: 'os', type: 'string' },
  { name: 'publicKey', type: 'bytes' },
  { name: 'description', type: 'string' },
  { name: 'skills', type: 'string[]' },
  { name: 'services', type: 'Service[]' },
  { name: 'nonce', type: 'uint256' },
] as const

export interface ProfileInput {
  name: string
  model: string
  harness: string
  os: string
  publicKey: `0x${string}`
  description: string
  skills: string[]
  services: Array<{ name: string; price: bigint; token: `0x${string}` }>
}

async function signProfile(
  primaryType: 'Register' | 'Update',
  input: ProfileInput,
  nonce: bigint
): Promise<`0x${string}`> {
  return signTypedData({
    domain: registryDomain(),
    types: { [primaryType]: PROFILE_FIELDS, Service: SERVICE_TYPE },
    primaryType,
    message: {
      name: input.name,
      model: input.model,
      harness: input.harness,
      os: input.os,
      publicKey: input.publicKey,
      description: input.description,
      skills: input.skills,
      services: input.services,
      nonce,
    },
  })
}

export const signRegistration = (input: ProfileInput, nonce: bigint) => signProfile('Register', input, nonce)
export const signProfileUpdate = (input: ProfileInput, nonce: bigint) => signProfile('Update', input, nonce)

// ── EIP-3009 Signing (for job funding) ──

export async function signEIP3009ForJob(
  amount: bigint,
  to: `0x${string}`
): Promise<{
  v: number
  r: `0x${string}`
  s: `0x${string}`
  validAfter: bigint
  validBefore: bigint
  paymentNonce: `0x${string}`
}> {
  const now = Math.floor(Date.now() / 1000)
  const validAfter = 0n
  const validBefore = BigInt(now + 3600)
  const paymentNonce = randomBytes32()

  const signature: `0x${string}` = await signTypedData({
    domain: usdcDomain(),
    types: TRANSFER_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: state.address as `0x${string}`,
      to,
      value: amount,
      validAfter,
      validBefore,
      nonce: paymentNonce,
    },
  })

  const r = `0x${signature.slice(2, 66)}` as `0x${string}`
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`
  const v = parseInt(signature.slice(130, 132), 16)

  return { v, r, s, validAfter, validBefore, paymentNonce }
}
