import { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { Order } from '../models/order.model'
import { CustomError } from '../errors/customError.error'
import type { OrderStatus } from '../types/order.types'
import { AuthRequest } from '../types/AuthRequest'

export async function trackOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params
    const order = await Order.findOne({ trackingToken: token }).select(
      'status items total createdAt trackingToken scheduledFor',
    )
    if (!order) throw new CustomError('Order not found', 404)

    res.json({
      status: order.status,
      items: order.items,
      total: order.total,
      createdAt: order.createdAt,
      scheduledFor: order.scheduledFor,
    })
  } catch (err) {
    next(err)
  }
}

const ALLOWED_STATUSES: OrderStatus[] = [
  'pending', 'approved', 'preparing', 'ready', 'delivered', 'rejected', 'cancelled',
]

export async function ordersByEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.query as { email?: string }
    if (!email || !email.includes('@')) {
      throw new CustomError('Valid email is required', 400)
    }
    const orders = await Order.find({
      customerEmail: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      status: { $nin: ['pending'] },
    })
      .select('status items total createdAt trackingToken updatedAt scheduledFor')
      .sort({ createdAt: -1 })
      .limit(20)

    res.json(orders)
  } catch (err) {
    next(err)
  }
}

// Status group mappings for the `filter` query param
const STATUS_GROUPS: Record<string, string[]> = {
  pending:   ['pending'],
  active:    ['approved', 'preparing', 'ready'],
  completed: ['delivered'],
  cancelled: ['rejected', 'cancelled'],
}

// GET /api/orders/my-orders?filter=pending|active|completed|cancelled  (auth required)
export async function myOrders(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id
    const userEmail = req.user!.email
    const { filter } = req.query as { filter?: string }

    // Build ownership filter (userId OR email for legacy orders without userId)
    const ownerFilter = {
      $or: [
        { userId: new mongoose.Types.ObjectId(userId) },
        { customerEmail: { $regex: `^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ],
    }

    // Build status filter
    const statusFilter =
      filter && STATUS_GROUPS[filter]
        ? { status: { $in: STATUS_GROUPS[filter] } }
        : {}

    const orders = await Order.find({ ...ownerFilter, ...statusFilter })
      .select('status items total createdAt trackingToken updatedAt payWithPayPhone scheduledFor')
      .sort({ createdAt: -1 })
      .limit(100)

    res.json(orders)
  } catch (err) {
    next(err)
  }
}

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.query as { status?: string }

    const filter =
      status && ALLOWED_STATUSES.includes(status as OrderStatus)
        ? { status }
        : { status: { $in: ['approved', 'preparing', 'ready', 'delivered', 'rejected', 'cancelled'] } }

    const orders = await Order.find(filter)
      .select('clientTransactionId status total items createdAt trackingToken scheduledFor')
      .sort({ createdAt: -1 })
      .limit(200)

    res.json(orders)
  } catch (err) {
    next(err)
  }
}
