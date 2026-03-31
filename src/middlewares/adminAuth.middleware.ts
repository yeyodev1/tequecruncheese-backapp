import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { CustomError } from '../errors/customError.error'

export interface AdminRequest extends Request {
  admin?: { email: string }
}

export function adminAuth(req: AdminRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new CustomError('Unauthorized', 401)
  }
  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { email: string }
    req.admin = { email: payload.email }
    next()
  } catch {
    throw new CustomError('Invalid or expired token', 401)
  }
}
