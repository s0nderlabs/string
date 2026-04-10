import { poseidon4 } from "poseidon-lite/poseidon4";

const BN254_MODULUS = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

/**
 * Convert a message string to 4 BN254 field elements.
 * Must be byte-identical to plugin/src/zk.ts:messageToFields().
 */
export function messageToFields(msg: string): bigint[] {
  const bytes = new TextEncoder().encode(msg);
  const chunkSize = Math.ceil(bytes.length / 4);
  const fields: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    const chunk = bytes.slice(i * chunkSize, (i + 1) * chunkSize);
    let val = 0n;
    for (let j = 0; j < chunk.length; j++)
      val = (val * 256n + BigInt(chunk[j]!)) % BN254_MODULUS;
    fields.push(val);
  }
  return fields;
}

/**
 * Compute the Poseidon commitment for a plaintext message (decimal string).
 */
export function computeCommitment(plaintext: string): string {
  return poseidon4(messageToFields(plaintext)).toString();
}

/**
 * Verify that a plaintext message matches the given commitment.
 *
 * Commitment formats:
 * - DB stores: "0x" + decimal_string (from snarkjs pubSignals[0])
 * - Event decoded: "0x" + 64 hex chars (bytes32 from viem)
 * - poseidon4 returns: BigInt → .toString() = decimal
 *
 * Normalizes both to decimal string for comparison.
 */
export function verifyMessageCommitment(
  plaintext: string,
  storedCommitment: string
): { matches: boolean; decimalCommitment: string } {
  const computed = computeCommitment(plaintext);
  let expected = storedCommitment.startsWith("0x")
    ? storedCommitment.slice(2)
    : storedCommitment;
  // If hex bytes32 (64 hex chars), convert to decimal
  if (/^[0-9a-fA-F]{64}$/.test(expected)) {
    expected = BigInt("0x" + expected).toString();
  }
  return { matches: computed === expected, decimalCommitment: computed };
}
