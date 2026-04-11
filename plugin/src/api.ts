import { state } from './state.js'

function baseUrl(): string {
  return state.backendUrl.replace(/\/$/, '')
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-agent-address': state.address,
    ...extra,
  }
}

async function request(method: string, path: string, body?: any, extraHeaders?: Record<string, string>): Promise<any> {
  const url = `${baseUrl()}${path}`
  const opts: RequestInit = {
    method,
    headers: headers(extraHeaders),
  }
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`)
  }
  return json
}

// ── Messages ──

export async function relayMessage(
  body: {
    proof: { pA: string[]; pB: string[][]; pC: string[] }
    pubSignals: string[]
    encryptedMessage: string
    sender: string
    recipient: string
  },
  paymentHeader: string
): Promise<{ messageId: number; txHash: string; commitment: string }> {
  return request('POST', '/messages/relay', body, { 'x-payment': paymentHeader })
}

export async function getMessages(address: string, since: number = 0): Promise<{ messages: any[] }> {
  return request('GET', `/messages?address=${address}&since=${since}`)
}

// ── Agents ──

export async function registerAgent(body: {
  agent: string
  input: any
  nonce: number | string
  signature: string
}): Promise<{ txHash: string; agent: string }> {
  return request('POST', '/agents/register', body)
}

export async function updateAgent(body: {
  agent: string
  input: any
  nonce: number | string
  signature: string
}): Promise<{ txHash: string }> {
  return request('POST', '/agents/update', body)
}

export async function searchAgents(filters?: {
  model?: string
  os?: string
  skill?: string
  online?: boolean
}): Promise<{ agents: any[] }> {
  const params = new URLSearchParams()
  if (filters?.model) params.set('model', filters.model)
  if (filters?.os) params.set('os', filters.os)
  if (filters?.skill) params.set('skill', filters.skill)
  if (filters?.online) params.set('online', 'true')
  const qs = params.toString()
  return request('GET', `/agents${qs ? `?${qs}` : ''}`)
}

export async function getAgent(address: string): Promise<any> {
  const url = `${baseUrl()}/agents/${address.toLowerCase()}`
  const res = await fetch(url, { headers: headers() })
  if (res.status === 404) return null
  const json = await res.json()
  if (!res.ok) throw new Error((json as any).error || `HTTP ${res.status}`)
  return json
}

// ── Jobs ──

export async function createJob(body: {
  buyer: string
  provider: string
  amount: string
  description: string
  descriptionHash: string
  nonce: string
  buyerSig: string
  validAfter: string
  validBefore: string
  paymentNonce: string
  v: number
  r: string
  s: string
}): Promise<{ jobId: number; txHash: string }> {
  return request('POST', '/jobs/create', body)
}

export async function markDone(
  jobId: number,
  providerSig: string
): Promise<{ txHash: string }> {
  return request('POST', `/jobs/${jobId}/done`, { providerSig })
}

export async function acceptResult(
  jobId: number,
  buyerSig: string
): Promise<{ txHash: string }> {
  return request('POST', `/jobs/${jobId}/accept`, { buyerSig })
}

export async function disputeJob(
  jobId: number,
  buyerSig: string
): Promise<{ txHash: string }> {
  return request('POST', `/jobs/${jobId}/dispute`, { buyerSig })
}

export async function resolveDispute(
  jobId: number,
  buyerAmount: string,
  providerAmount: string,
  judgeSig: string
): Promise<{ txHash: string }> {
  return request('POST', `/jobs/${jobId}/resolve`, { buyerAmount, providerAmount, judgeSig })
}

export async function claimPayment(jobId: number): Promise<{ txHash: string }> {
  return request('POST', `/jobs/${jobId}/claim`, {})
}

export async function requestRefund(jobId: number): Promise<{ txHash: string }> {
  return request('POST', `/jobs/${jobId}/refund`, {})
}

export async function getJob(jobId: number): Promise<{ job: any }> {
  return request('GET', `/jobs/${jobId}`)
}

export async function listJobs(address: string): Promise<{ jobs: any[] }> {
  return request('GET', `/jobs?address=${address}`)
}

// ── Files ──

export async function uploadFile(
  fileData: Uint8Array,
  fileName: string,
  paymentHeader: string
): Promise<{ cid: string; url: string }> {
  const form = new FormData()
  form.append('file', new Blob([fileData]), 'encrypted.bin')

  const url = `${baseUrl()}/files/upload`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-agent-address': state.address,
      'x-payment': paymentHeader,
    },
    body: form,
  })
  const json = await res.json()
  if (!res.ok) throw new Error((json as any).error || `HTTP ${res.status}`)
  return json as { cid: string; url: string }
}

// ── Disputes ──

export async function submitEvidence(
  jobId: number,
  submitter: string,
  messages: any[]
): Promise<{ jobId: number; submitter: string; accepted: boolean; verified: boolean; details: any[] }> {
  return request('POST', `/disputes/${jobId}/evidence`, { submitter, messages })
}

export async function getEvidence(
  jobId: number
): Promise<{ evidence: any[] }> {
  return request('GET', `/disputes/${jobId}/evidence`)
}
