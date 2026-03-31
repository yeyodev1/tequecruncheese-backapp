import { Order } from '../models/order.model'
import * as payphoneService from './payphone.service'
import { CustomError } from '../errors/customError.error'
import type { PrepareRequest, ConfirmRequest } from '../types/order.types'

export async function createOrderAndPrepare(body: PrepareRequest) {
  const { items, clientTransactionId } = body

  const total = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
  const amountCentavos = Math.round(total * 100)

  const existing = await Order.findOne({ clientTransactionId })
  if (existing) throw new CustomError('Transaction already exists', 409)

  const order = await Order.create({
    clientTransactionId,
    items,
    total,
    status: 'pending',
  })

  try {
    const result = await payphoneService.preparePurchase({
      amount: amountCentavos,
      amountWithoutTax: amountCentavos,
      currency: 'USD',
      clientTransactionId,
      responseUrl: `${process.env.FRONTEND_URL}/pago/confirmado`,
      cancellationUrl: `${process.env.FRONTEND_URL}/tienda`,
      storeId: process.env.PAYPHONE_STORE_ID!,
      reference: `TQC-${order._id}`,
    })
    return { payWithPayPhone: result.payWithPayPhone }
  } catch (err) {
    await Order.findByIdAndDelete(order._id)
    throw new CustomError('Payment gateway error', 502)
  }
}

export async function confirmOrder(body: ConfirmRequest) {
  const { id, clientTransactionId } = body

  const order = await Order.findOne({ clientTransactionId })
  if (!order) throw new CustomError('Order not found', 404)
  if (order.status !== 'pending') throw new CustomError('Order already processed', 409)

  const result = await payphoneService.confirmPurchase({ id, clientTransactionId })

  const newStatus = result.transactionStatus === 'Approved' ? 'approved' : 'rejected'
  order.status = newStatus
  order.payphoneTransactionId = id
  await order.save()

  return {
    success: newStatus === 'approved',
    transactionStatus: result.transactionStatus,
    order: {
      id: order._id,
      status: order.status,
      total: order.total,
    },
  }
}
