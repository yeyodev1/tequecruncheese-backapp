import axios from 'axios'
import type {
  PayphonePreparePayload,
  PayphonePrepareResult,
  PayphoneConfirmPayload,
  PayphoneConfirmResult,
  PayphoneSaleLookup,
} from '../types/order.types'

const payphoneClient = axios.create({
  baseURL: process.env.PAYPHONE_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.PAYPHONE_TOKEN}`,
    'Content-Type': 'application/json',
  },
})

export async function preparePurchase(
  payload: PayphonePreparePayload,
): Promise<PayphonePrepareResult> {
  const { data } = await payphoneClient.post<PayphonePrepareResult>('/button/Prepare', payload)
  return data
}

export async function confirmPurchase(
  payload: PayphoneConfirmPayload,
): Promise<PayphoneConfirmResult> {
  const { data } = await payphoneClient.post<PayphoneConfirmResult>('/button/Confirm', payload)
  return data
}

/**
 * The transaction Payphone holds for one of our order ids, or null.
 *
 * `Confirm` needs Payphone's own transaction id, which only ever reaches us on
 * the browser redirect — so a customer who paid and then closed the tab left
 * the order stuck on `pending` with no way to ask. This lookup keys off the id
 * *we* generated, which we always have.
 */
export async function findSaleByClientTxId(
  clientTransactionId: string,
): Promise<PayphoneSaleLookup | null> {
  try {
    const { data } = await payphoneClient.get<PayphoneSaleLookup>('/Sale', {
      params: { clientTxId: clientTransactionId },
    })
    return data ?? null
  } catch {
    // A transaction that was never started 404s — indistinguishable from an
    // outage here, so the caller simply leaves the order pending and retries.
    return null
  }
}
