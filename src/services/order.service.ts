import { randomUUID } from 'crypto'
import { Order } from '../models/order.model'
import { User } from '../models/user.model'
import * as payphoneService from './payphone.service'
import * as emailService from './email.service'
import * as mapsService from './maps.service'
import * as scheduleService from './schedule.service'
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

  // Unresolvable link. Charging $0 here was the worst of the options: the order
  // simply shipped free, and nothing in it said so. The browser quoted the
  // customer a fare from the same tariff table before they paid, so bill that
  // instead — bounded by the table so a crafted request cannot name its own
  // price, and flagged so the team can check the distance by hand.
  const preview =
    typeof clientCost === 'number' && Number.isFinite(clientCost)
      ? Math.min(Math.max(clientCost, mapsService.TARIFF_RANGE.min), mapsService.TARIFF_RANGE.max)
      : 0

  console.warn(
    `[order.service] unresolved delivery link, billing preview $${preview.toFixed(2)}: ${mapsUrl}`,
  )
  return { cost: preview, km: undefined, unresolved: true }
}

export async function createOrderAndPrepare(body: PrepareRequest) {
  const { items, clientTransactionId, customerEmail } = body

  const existing = await Order.findOne({ clientTransactionId })
  if (existing) throw new CustomError('Transaction already exists', 409)

  // Nothing gets taken outside opening hours — an order placed at 21:00 has
  // nobody in the kitchen to cook it. Checked before anything is written or
  // charged, so a closed store costs the customer nothing.
  scheduleService.assertStoreOpen()

  // Re-checked server-side: a stale tab could still be offering a slot that
  // has since passed, or that falls outside opening hours.
  const scheduledFor = scheduleService.validateScheduledFor(body.scheduledFor)

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
    scheduledFor:   scheduledFor ?? undefined,
    trackingToken,
    items,
    total,
    status: 'pending',
  })

  // Awaited, not fired and forgotten: this runs on a serverless function, and
  // the instance is frozen the moment the response is sent. A dangling promise
  // is simply never resumed. `linkOrCreateUser` swallows its own errors.
  await linkOrCreateUser(customerEmail, order)

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

    // Both awaited before responding — see above. They are sent concurrently so
    // the customer waits for one round trip, not two, and `allSettled` keeps a
    // bounced address from blocking the redirect to the payment page.
    await Promise.allSettled([
      // Email al cliente: pedido recibido, procesando pago
      emailService.sendOrderPendingEmail({ to: customerEmail, items, total, trackingToken, scheduledFor }),
      // Alerta interna al equipo: nuevo pedido entrante
      emailService.sendNewOrderAlertToTeam({
        customerEmail,
        customerName: customerInfo?.nombre,
        customerPhone: customerInfo?.telefono,
        deliveryAddress: order.deliveryAddress,
        deliveryCost: delivery.cost,
        deliveryMethod: customerInfo?.deliveryMethod ?? 'delivery',
        deliveryUnresolved: 'unresolved' in delivery && delivery.unresolved === true,
        items,
        total,
        trackingToken,
        orderId: String(order._id),
        scheduledFor,
      }),
    ])

    return { payWithPayPhone: result.payWithPayPhone }
  } catch (err) {
    await Order.findByIdAndDelete(order._id)
    throw new CustomError('Payment gateway error', 502)
  }
}


/**
 * The customer and kitchen emails that follow a settled payment.
 *
 * Shared with the reconciler below so an order rescued from `pending` sends
 * exactly what it would have sent on the redirect — the customer should not be
 * able to tell that their browser never made it back.
 */
async function notifyPaymentOutcome(
  order: InstanceType<typeof Order>,
  status: 'approved' | 'rejected',
): Promise<void> {
  if (status !== 'approved') {
    await emailService.sendPaymentRejectedEmail({ to: order.customerEmail })
    return
  }

  await Promise.allSettled([
    // Email al cliente: pago aprobado
    emailService.sendPaymentApprovedEmail({
      to: order.customerEmail,
      items: order.items,
      total: order.total,
      trackingToken: order.trackingToken,
    }),
    // Alerta interna al equipo: pago confirmado, preparar pedido
    emailService.sendPaymentConfirmedAlertToTeam({
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      deliveryCost: order.deliveryCost,
      deliveryMethod: order.deliveryMethod,
      items: order.items,
      total: order.total,
      trackingToken: order.trackingToken,
      orderId: String(order._id),
    }),
  ])
}

/** A pending order younger than this is still plausibly mid-checkout. */
const RECONCILE_MIN_AGE_MINUTES = 3
/** How far back a sweep looks. Money stays owed however old the order is. */
const RECONCILE_MAX_AGE_DAYS = Number(process.env.RECONCILE_MAX_AGE_DAYS ?? 45)
/**
 * Past this, a settled order is only recorded, never announced to the customer.
 * Telling someone their payment failed a month after they moved on is noise;
 * an *approved* one still alerts the team, because that is money received that
 * nobody has acted on.
 */
const RECONCILE_NOTIFY_WINDOW_HOURS = 12

/**
 * Settle orders whose payment completed but whose browser never came back.
 *
 * `confirmOrder` is driven entirely by the Payphone redirect, so anything that
 * breaks the return trip — the tab closed, the network dropped, the frontend
 * being down for an hour — leaves a *paid* order sitting at `pending` with no
 * email to the customer and nothing in the kitchen's inbox. That is the failure
 * the store hit on 2026-09-01: money taken, order invisible.
 *
 * Run from a schedule, this asks Payphone about every stranded order and
 * finishes the job the redirect was supposed to do. Safe to run concurrently
 * with a real redirect: whichever gets there first flips the status off
 * `pending`, and the other one finds nothing to do.
 */
export async function reconcilePendingOrders(debug = false): Promise<{
  checked: number
  approved: number
  rejected: number
  stillPending: number
  error?: string
  diagnostics?: string[]
}> {
  const now = Date.now()
  const stale = await Order.find({
    status: 'pending',
    createdAt: {
      $lte: new Date(now - RECONCILE_MIN_AGE_MINUTES * 60_000),
      $gte: new Date(now - RECONCILE_MAX_AGE_DAYS * 86_400_000),
    },
  }).limit(100)

  let approved = 0
  let rejected = 0
  let stillPending = 0
  const diagnostics: string[] = []
  let unauthorized = false

  for (const order of stale) {
    const outcome = await payphoneService.findSaleByClientTxId(order.clientTransactionId)
    const sale = outcome.sale
    if (debug) {
      diagnostics.push(
        `${String(order._id)} ${new Date(order.createdAt).toISOString().slice(0, 10)} ` +
          `${outcome.result} ${outcome.detail ?? ''} status=${sale?.transactionStatus ?? '-'}`,
      )
    }

    // An outage means "we do not know", never "it failed" — cancelling an order
    // because Payphone was unreachable would reject payments the customer
    // actually made. A clean 404 is different: there is no sale, so the
    // checkout was abandoned and the order can be closed.
    if (!sale?.transactionStatus) {
      if (outcome.result === 'not-found') {
        order.status = 'rejected'
        await order.save()
        rejected++
        continue
      }

      console.warn(`[reconcile] lookup unresolved for ${order.clientTransactionId}: ${outcome.detail}`)
      stillPending++

      // A 401 is about the credentials, not this order, so every remaining
      // lookup would fail identically. The Payphone token is scoped to the
      // payment button and cannot query transactions: that permission has to
      // be granted on the Payphone account before this sweep can do anything.
      if (outcome.detail?.includes('401')) {
        unauthorized = true
        console.error(
          '[reconcile] aborting: the Payphone token is not authorized to query ' +
            'transactions. Grant it transaction-query access in the Payphone panel.',
        )
        break
      }
      continue
    }

    const isRecent =
      now - new Date(order.createdAt).getTime() < RECONCILE_NOTIFY_WINDOW_HOURS * 3_600_000

    if (sale.transactionStatus === 'Approved') {
      order.status = 'approved'
      if (sale.transactionId) order.payphoneTransactionId = String(sale.transactionId)
      await order.save()
      await notifyPaymentOutcome(order, 'approved')
      approved++
      console.log(`[reconcile] recovered paid order ${order._id} (${order.clientTransactionId})`)
      continue
    }

    if (sale.transactionStatus === 'Canceled' || sale.transactionStatus === 'Cancelled') {
      order.status = 'rejected'
      await order.save()
      // Silent for anything old: the customer abandoned this checkout weeks ago
      // and does not need a "your payment failed" email about it today.
      if (isRecent) await notifyPaymentOutcome(order, 'rejected')
      rejected++
      continue
    }

    stillPending++
  }

  return {
    checked: stale.length,
    approved,
    rejected,
    stillPending,
    // Surfaced rather than logged away: without this the sweep reports a clean
    // run while silently doing nothing at all.
    ...(unauthorized
      ? { error: 'payphone-token-cannot-query-transactions' as const }
      : {}),
    ...(debug ? { diagnostics } : {}),
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

  await notifyPaymentOutcome(order, newStatus)

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
