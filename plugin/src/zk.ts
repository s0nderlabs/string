import path from 'path'

const BN254_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617')

const CIRCUIT_DIR = path.join(import.meta.dir, '..', 'circuits')
const WASM_PATH = path.join(CIRCUIT_DIR, 'message_proof.wasm')
const ZKEY_PATH = path.join(CIRCUIT_DIR, 'circuit.zkey')
const VKEY_PATH = path.join(CIRCUIT_DIR, 'vkey.json')

let poseidonInstance: any = null

async function getPoseidon() {
  if (!poseidonInstance) {
    const { buildPoseidon } = await import('circomlibjs')
    poseidonInstance = await buildPoseidon()
  }
  return poseidonInstance
}

export function messageToFields(msg: string): bigint[] {
  const bytes = new TextEncoder().encode(msg)
  const chunkSize = Math.ceil(bytes.length / 4)
  const fields: bigint[] = []
  for (let i = 0; i < 4; i++) {
    const chunk = bytes.slice(i * chunkSize, (i + 1) * chunkSize)
    let val = 0n
    for (let j = 0; j < chunk.length; j++) val = (val * 256n + BigInt(chunk[j])) % BN254_MODULUS
    fields.push(val)
  }
  return fields
}

export async function computeCommitment(msg: string, senderSecret: bigint): Promise<{ commitment: string; senderAddress: string }> {
  const poseidon = await getPoseidon()
  const fields = messageToFields(msg)
  const commitment = poseidon.F.toString(poseidon(fields))
  const senderAddress = poseidon.F.toString(poseidon([senderSecret % BN254_MODULUS]))
  return { commitment, senderAddress }
}

export async function generateProof(msg: string, senderSecret: bigint): Promise<{
  proof: any
  publicSignals: string[]
  commitment: string
  senderAddress: string
  calldata: string
}> {
  const snarkjs = await import('snarkjs')
  const fields = messageToFields(msg)
  const secret = senderSecret % BN254_MODULUS
  const { commitment, senderAddress } = await computeCommitment(msg, senderSecret)

  const input = {
    message: fields.map(f => f.toString()),
    senderSecret: secret.toString(),
    commitment,
    senderAddress,
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input, WASM_PATH, ZKEY_PATH,
    null, null, { singleThread: true }
  )

  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)
  return { proof, publicSignals, commitment, senderAddress, calldata }
}

export async function verifyCommitment(msg: string, expectedCommitment: string, senderSecret: bigint): Promise<boolean> {
  const { commitment } = await computeCommitment(msg, senderSecret)
  return commitment === expectedCommitment
}
