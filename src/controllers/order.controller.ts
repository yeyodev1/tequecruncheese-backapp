import { Request, Response, NextFunction } from 'express'
import { Order } from '../models/order.model'
import { CustomError } from '../errors/customError.error'
import type { OrderStatus } from '../types/order.types'

export async function trackOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params
    const order = await Order.findOne({ trackingToken: token }).select(
      'status items total createdAt trackingToken',
    )
    if (!order) throw new CustomError('Order not found', 404)

    res.json({
      status: order.status,
      items: order.items,
      total: order.total,
      createdAt: order.createdAt,
    })
  } catch (err) {
    next(err)
  }
}

const ALLOWED_STATUSES: OrderStatus[] = [
  'pending', 'approved', 'preparing', 'ready', 'delivered', 'rejected', 'cancelled',
]

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.query as { status?: string }

    const filter =
      status && ALLOWED_STATUSES.includes(status as OrderStatus)
        ? { status }
        : { status: { $in: ['approved', 'preparing', 'ready', 'delivered', 'rejected', 'cancelled'] } }

    const orders = await Order.find(filter)
      .select('clientTransactionId status total items createdAt trackingToken')
      .sort({ createdAt: -1 })
      .limit(200)

    res.json(orders)
  } catch (err) {
    next(err)
  }
}
