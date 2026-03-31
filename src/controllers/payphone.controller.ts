import { Request, Response, NextFunction } from 'express'
import * as orderService from '../services/order.service'
import { CustomError } from '../errors/customError.error'

export async function prepare(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, clientTransactionId, customerEmail } = req.body
    if (!items?.length || !clientTransactionId) {
      throw new CustomError('items and clientTransactionId are required', 400)
    }
    if (!customerEmail || typeof customerEmail !== 'string' || !customerEmail.includes('@')) {
      throw new CustomError('customerEmail is required', 400)
    }
    const result = await orderService.createOrderAndPrepare({ items, clientTransactionId, customerEmail })
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
