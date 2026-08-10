import { randomUUID } from 'crypto'
import { Order } from '../models/order.model'
import { User } from '../models/user.model'
import * as payphoneService from './payphone.service'
import * as emailService from './email.service'
import * as mapsService from './maps.service'
import { CustomError } from '../errors/customError.error'
import type { PrepareRequest, ConfirmRequest } from '../types/order.types'

async function linkOrCreateUser(customerEmail: string, order: InstanceType<typeof Order>): Promise<void> {
  try {
    const existingUser = await User.findOne({ email: customerEmail.toLowerCase() })
    if (existingUser) {
      order.userId = existingUser._id as import('mongoose').Types.ObjectId
    } else {
      // Default password is the customer's email address
      const newUser = await User.create({
        name: customerEmail.split('@')[0],
        email: customerEmail.toLowerCase(),
        password: customerEmail,
        role: 'customer',
      })
      order.userId = newUser._id as import('mongoose').Types.ObjectId
      await emailService.sendGuestAccountCreatedEmail(customerEmail, newUser.name, customerEmail)
    }
    await order.save()
  } catch (err) {
    console.error('[order.service] linkOrCreateUser failed:', err)
  }
}

/**
 * Delivery is priced on the server from the customer's Maps link. The amount
 * the browser computed is only a preview — trusting it would let a crafted
 * request pay $0 shipping, and it would drift whenever the tariff changes.
 */
async function resolveDelivery(customerInfo: PrepareRequest['customerInfo'], clientCost?: number) {
  if (customerInfo?.deliveryMethod === 'pickup') {
    return { cost: 0, km: undefined as number | undefined }
  }
  const mapsUrl = customerInfo?.mapsUrl
  if (!mapsUrl) return { cost: 0, km: undefined }

  try {
    const quote = await mapsService.quoteFromMapsUrl(mapsUrl)
    if (quote.deliveryCost !== null) {
      return { cost: quote.deliveryCost, km: quote.km ?? undefined }
    }
  } catch (err) {
    console.error('[order.service] delivery quote failed:', err)
  }

  // Unresolvable link: charge nothing now and coordinate the fee manually,
  // rather than billing a guessed distance.
  return { cost: 0, km: undefined, unresolved: true, clientPreview: clientCost }
}

export async function createOrderAndPrepare(body: PrepareRequest) {
  const { items, clientTransactionId, customerEmail } = body

  const existing = await Order.findOne({ clientTransactionId })
  if (existing) throw new CustomError('Transaction already exists', 409)

  const { customerInfo } = body
  const delivery = await resolveDelivery(customerInfo, body.deliveryCost)

  const itemsTotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
  const total = Math.round((itemsTotal + delivery.cost) * 100) / 100
  const amountCentavos = Math.round(total * 100)

  const trackingToken = randomUUID()

  const order = await Order.create({
    clientTransactionId,
    customerEmail,
    customerName:  customerInfo?.nombre,
    customerPhone: customerInfo?.telefono,
    cedula:        customerInfo?.cedula,
    deliveryAddress: customerInfo?.calle ? {
      calle:      customerInfo.calle,
      barrio:     customerInfo.barrio,
      referencia: customerInfo.referencia,
      mapsUrl:    customerInfo.mapsUrl,
    } : undefined,
    quiereFactura: customerInfo?.quiereFactura,
    facturaEmail:  customerInfo?.facturaEmail,
    facturaRuc:    customerInfo?.facturaRuc,
    deliveryCost:   delivery.cost,
    deliveryKm:     delivery.km,
    deliveryMethod: customerInfo?.deliveryMethod ?? 'delivery',
    trackingToken,
    items,
    total,
    status: 'pending',
  })

  // Link or create user account (non-blocking — failures logged, not thrown)
  void linkOrCreateUser(customerEmail, order)

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

    // Persist the payment URL so customers can retry from their order history
    order.payWithPayPhone = result.payWithPayPhone
    await order.save()

    // Email al cliente: pedido recibido, procesando pago
    void emailService.sendOrderPendingEmail({ to: customerEmail, items, total, trackingToken })
    // Alerta interna al equipo: nuevo pedido entrante
    void emailService.sendNewOrderAlertToTeam({
      customerEmail,
      items,
      total,
      trackingToken,
      orderId: String(order._id),
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
    // Email al cliente: pago aprobado
    void emailService.sendPaymentApprovedEmail({
      to: order.customerEmail,
      items: order.items,
      total: order.total,
      trackingToken: order.trackingToken,
    })
    // Alerta interna al equipo: pago confirmado, preparar pedido
    void emailService.sendPaymentConfirmedAlertToTeam({
      customerEmail: order.customerEmail,
      items: order.items,
      total: order.total,
      trackingToken: order.trackingToken,
      orderId: String(order._id),
    })
  } else {
    void emailService.sendPaymentRejectedEmail({ to: order.customerEmail })
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
