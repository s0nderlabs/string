import { state } from './state.js'
import { TRANSFER_AUTH_TYPES, usdcDomain, randomBytes32 } from './signing.js'

export async function signPaymentHeader(amount: string): Promise<string> {
  if (!state.account) throw new Error('No account loaded')

  const now = Math.floor(Date.now() / 1000)
  const validAfter = BigInt(now - 60)
  const validBefore = BigInt(now + 300)
  const nonce = randomBytes32()

  const message = {
    from: state.address as `0x${string}`,
    to: state.feeRecipient,
    value: BigInt(amount),
    validAfter,
    validBefore,
    nonce,
  }

  const signature = await state.account.signTypedData({
    domain: usdcDomain(),
    types: TRANSFER_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization' as const,
    message,
  })

  const payload = {
    x402Version: 2,
    payload: {
      authorization: {
        from: state.address,
        to: state.feeRecipient,
        value: amount,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
      signature,
    },
  }

  return Buffer.from(JSON.stringify(payload)).toString('base64')
}
