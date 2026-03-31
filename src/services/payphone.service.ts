import axios from 'axios'
import type {
  PayphonePreparePayload,
  PayphonePrepareResult,
  PayphoneConfirmPayload,
  PayphoneConfirmResult,
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
