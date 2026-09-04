import { Request, Response, NextFunction } from 'express'
import * as orderService from '../services/order.service'
import { CustomError } from '../errors/customError.error'

export async function prepare(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, clientTransactionId, customerEmail, customerInfo, deliveryCost, scheduledFor } = req.body
    if (!items?.length || !clientTransactionId) {
      throw new CustomError('items and clientTransactionId are required', 400)
    }
    if (!customerEmail || typeof customerEmail !== 'string' || !customerEmail.includes('@')) {
      throw new CustomError('customerEmail is required', 400)
    }
    const result = await orderService.createOrderAndPrepare({ items, clientTransactionId, customerEmail, customerInfo, deliveryCost, scheduledFor })
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, clientTransactionId } = req.body
    if (!id || !clientTransactionId) {
      throw new CustomError('id and clientTransactionId are required', 400)
    }
    const result = await orderService.confirmOrder({ id, clientTransactionId })
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * Settle orders left stranded on `pending` by a broken payment redirect.
 *
 * Runs on a schedule (see `crons` in vercel.json) and is also safe to hit by
 * hand when the store reports a payment it cannot see. Guarded by a shared
 * secret rather than the admin session, because the caller is Vercel's cron.
 */
export async function reconcile(req: Request, res: Response, next: NextFunction) {
  try {
    const secret = process.env.CRON_SECRET
    const presented = req.headers.authorization?.replace(/^Bearer /i, '')
    if (!secret || presented !== secret) {
      throw new CustomError('Unauthorized', 401)
    }
    const result = await orderService.reconcilePendingOrders()
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}
