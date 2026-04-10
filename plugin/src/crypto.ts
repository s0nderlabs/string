import { privateKeyToAccount } from 'viem/accounts'
import { encrypt, decrypt } from 'eciesjs'

export function deriveIdentity(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey)
  return {
    address: account.address.toLowerCase(),
    account,
  }
}

export function encryptMessage(recipientPublicKey: string, plaintext: string): string {
  const pubKeyHex = recipientPublicKey.startsWith('0x') ? recipientPublicKey.slice(2) : recipientPublicKey
  const data = new TextEncoder().encode(plaintext)
  const encrypted = encrypt(pubKeyHex, data)
  return Buffer.from(encrypted).toString('base64')
}

export function decryptMessage(privateKey: `0x${string}`, encrypted: string): string {
  const privKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey
  const data = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
  const decrypted = decrypt(privKeyHex, data)
  return new TextDecoder().decode(decrypted)
}
