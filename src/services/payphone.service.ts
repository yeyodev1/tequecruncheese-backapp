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

/** What a lookup actually did, so a silent no-op can be told from a real "no". */
export interface SaleLookupOutcome {
  sale: PayphoneSaleLookup | null
  /** 'found' | 'not-found' | 'error' — only 'not-found' is a real answer. */
  result: 'found' | 'not-found' | 'error'
  detail?: string
}

/**
 * The transaction Payphone holds for one of our order ids.
 *
 * `Confirm` needs Payphone's own transaction id, which only ever reaches us on
 * the browser redirect — so a customer who paid and then closed the tab left
 * the order stuck on `pending` with no way to ask. This lookup keys off the id
 * *we* generated, which we always have.
 *
 * The outcome is reported rather than collapsed to null: a reconciler that
 * cannot tell "Payphone says no such sale" from "Payphone did not answer" is a
 * no-op that looks like a clean run.
 */
export async function findSaleByClientTxId(
  clientTransactionId: string,
): Promise<SaleLookupOutcome> {
  // Probed against the live API rather than guessed: `GET /Sale` answers 405
  // ("does not support http method 'GET'") and the path form answers 401, so
  // the lookup is a POST. The body key is tried both ways because Prepare and
  // Confirm disagree about whether it is `clientTxId` or `clientTransactionId`.
  const attempts: Array<{ label: string; run: () => Promise<PayphoneSaleLookup> }> = [
    {
      label: 'post-clientTxId',
      run: async () =>
        (await payphoneClient.post<PayphoneSaleLookup>('/Sale', {
          clientTxId: clientTransactionId,
        })).data,
    },
    {
      label: 'post-clientTransactionId',
      run: async () =>
        (await payphoneClient.post<PayphoneSaleLookup>('/Sale', {
          clientTransactionId,
        })).data,
    },
  ]

  const notes: string[] = []
  for (const attempt of attempts) {
    try {
      const data = await attempt.run()
      if (data && (data.transactionStatus || data.transactionId)) {
        return { sale: data, result: 'found', detail: attempt.label }
      }
      notes.push(`${attempt.label}=empty`)
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const body = (err as { response?: { data?: unknown } })?.response?.data
      notes.push(`${attempt.label}=${status ?? 'net'}:${JSON.stringify(body)?.slice(0, 120)}`)
    }
  }

  // Every attempt 404'd: Payphone genuinely holds no sale for this id, which
  // means the customer never completed the payment.
  const allNotFound = notes.every((n) => n.includes('=404'))
  return {
    sale: null,
    result: allNotFound ? 'not-found' : 'error',
    detail: notes.join(' | '),
  }
}
