import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { Order } from '../models/order.model'
import { CustomError } from '../errors/customError.error'
import type { OrderStatus } from '../types/order.types'
import * as emailService from '../services/email.service'

const STATUS_UPDATE_EMAIL_TRIGGERS: OrderStatus[] = ['approved', 'preparing', 'ready', 'delivered', 'cancelled', 'rejected']

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tequecruncheese.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '123456789'

const ALLOWED_STATUSES: OrderStatus[] = [
  'pending', 'approved', 'preparing', 'ready', 'delivered', 'rejected', 'cancelled',
]

// POST /api/admin/login
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      throw new CustomError('Invalid credentials', 401)
    }
    const token = jwt.sign({ email }, process.env.JWT_SECRET!, { expiresIn: '12h' })
    res.json({ token })
  } catch (err) {
    next(err)
  }
}

// GET /api/admin/orders
export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, search, from, to } = req.query as Record<string, string>

    const filter: Record<string, unknown> = {}

    if (status && ALLOWED_STATUSES.includes(status as OrderStatus)) {
      filter.status = status
    }

    if (search) {
      filter.$or = [
        { customerEmail: { $regex: search, $options: 'i' } },
        { clientTransactionId: { $regex: search, $options: 'i' } },
        { trackingToken: { $regex: search, $options: 'i' } },
      ]
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) dateFilter.$gte = new Date(from)
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        dateFilter.$lte = toDate
      }
      filter.createdAt = dateFilter
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(300)
    res.json(orders)
  } catch (err) {
    next(err)
  }
}

// GET /api/admin/orders/:id
export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) throw new CustomError('Order not found', 404)
    res.json(order)
  } catch (err) {
    next(err)
  }
}

// PATCH /api/admin/orders/:id/status
export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, note } = req.body
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      throw new CustomError('Invalid status', 400)
    }
    // Cannot move backwards to pending, or change a rejected/cancelled order (except to cancelled)
    const order = await Order.findById(req.params.id)
    if (!order) throw new CustomError('Order not found', 404)
    if (order.status === 'pending') {
      throw new CustomError('Cannot manually update a pending payment order', 400)
    }
    order.status = status
    const trimmedNote = typeof note === 'string' ? note.trim() : ''
    if (trimmedNote) {
      order.adminNotes.push({ text: `[${status.toUpperCase()}] ${trimmedNote}`, createdAt: new Date() })
    }
    await order.save()

    if (STATUS_UPDATE_EMAIL_TRIGGERS.includes(status as OrderStatus)) {
      void emailService.sendOrderStatusUpdateEmail(order.customerEmail, status, order.trackingToken, trimmedNote || undefined)
    }

    res.json(order)
  } catch (err) {
    next(err)
  }
}

// POST /api/admin/orders/:id/send-email
export async function sendEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { subject, message } = req.body
    if (!subject?.trim() || !message?.trim()) {
      throw new CustomError('subject and message are required', 400)
    }
    const order = await Order.findById(req.params.id)
    if (!order) throw new CustomError('Order not found', 404)

    await emailService.sendAdminCustomEmail({
      to: order.customerEmail,
      subject: subject.trim(),
      message: message.trim(),
      trackingToken: order.trackingToken,
    })

    // Log as internal note
    order.adminNotes.push({ text: `[EMAIL ENVIADO] ${subject.trim()}: ${message.trim()}`, createdAt: new Date() })
    await order.save()

    res.json({ ok: true, order })
  } catch (err) {
    next(err)
  }
}

// POST /api/admin/orders/:id/notes
export async function addNote(req: Request, res: Response, next: NextFunction) {
  try {
    const { text } = req.body
    if (!text?.trim()) throw new CustomError('Note text is required', 400)
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $push: { adminNotes: { text: text.trim(), createdAt: new Date() } } },
      { new: true },
    )
    if (!order) throw new CustomError('Order not found', 404)
    res.json(order)
  } catch (err) {
    next(err)
  }
}
