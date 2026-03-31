import { randomUUID } from 'crypto'
import { Order } from '../models/order.model'
import * as payphoneService from './payphone.service'
import * as emailService from './email.service'
import { CustomError } from '../errors/customError.error'
import type { PrepareRequest, ConfirmRequest } from '../types/order.types'

export async function createOrderAndPrepare(body: PrepareRequest) {
  const { items, clientTransactionId, customerEmail } = body

  const total = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
  const amountCentavos = Math.round(total * 100)

  const existing = await Order.findOne({ clientTransactionId })
  if (existing) throw new CustomError('Transaction already exists', 409)

  const trackingToken = randomUUID()

  const order = await Order.create({
    clientTransactionId,
    customerEmail,
    trackingToken,
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
      responseUrl: `${process.env.FRONTEND_URL}/pay-response`,
      cancellationUrl: `${process.env.FRONTEND_URL}/tienda`,
      storeId: process.env.PAYPHONE_STORE_ID!,
      reference: `TQC-${order._id}`,
    })

    await emailService.sendOrderPendingEmail({ to: customerEmail, items, total, trackingToken })

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

  // If already processed (e.g., page refresh), return current order data
  if (order.status !== 'pending') {
    return {
      success: order.status !== 'rejected' && order.status !== 'cancelled',
      transactionStatus: order.payphoneTransactionId ? 'Approved' : 'Canceled',
      order: {
        id: order._id,
        status: order.status,
        total: order.total,
        trackingToken: order.trackingToken,
      },
    }
  }

  const result = await payphoneService.confirmPurchase({ id, clientTransactionId })

  const newStatus = result.transactionStatus === 'Approved' ? 'approved' : 'rejected'
  order.status = newStatus
  order.payphoneTransactionId = id
  await order.save()

  if (newStatus === 'approved') {
    await emailService.sendPaymentApprovedEmail({
      to: order.customerEmail,
      items: order.items,
      total: order.total,
      trackingToken: order.trackingToken,
    })
  } else {
    await emailService.sendPaymentRejectedEmail({ to: order.customerEmail })
  }

  return {
    success: newStatus === 'approved',
    transactionStatus: result.transactionStatus,
    order: {
      id: order._id,
      status: order.status,
      total: order.total,
      trackingToken: order.trackingToken,
    },
  }
}
