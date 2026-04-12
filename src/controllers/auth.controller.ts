import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { User } from '../models/user.model'
import { CustomError } from '../errors/customError.error'
import { AuthRequest } from '../types/AuthRequest'
import * as emailService from '../services/email.service'

function signToken(id: string, email: string, role: string): string {
  return jwt.sign({ id, email, role }, process.env.JWT_SECRET!, { expiresIn: '24h' })
}

// POST /api/auth/register
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password, phone } = req.body

    if (!name || !email || !password) {
      throw new CustomError('Name, email and password are required', 400)
    }

    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      throw new CustomError('Email already registered', 409)
    }

    const user = await User.create({ name, email, password, phone })

    const token = signToken(String(user._id), user.email, user.role)

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      throw new CustomError('Email and password are required', 400)
    }

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      throw new CustomError('Invalid credentials', 401)
    }

    const valid = await user.comparePassword(password)
    if (!valid) {
      throw new CustomError('Invalid credentials', 401)
    }

    const token = signToken(String(user._id), user.email, user.role)

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/auth/me
export async function me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findById(req.user!.id).select('-password -passwordResetToken -passwordResetExpires')
    if (!user) throw new CustomError('User not found', 404)
    res.json(user)
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/forgot-password
export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body
    if (!email) throw new CustomError('Email is required', 400)

    const user = await User.findOne({ email: email.toLowerCase() })
    // Always respond 200 to avoid user enumeration
    if (!user) {
      res.json({ message: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.' })
      return
    }

    // Anti-spam: check if reset was requested in the last 5 minutes
    if (user.passwordResetExpires && user.passwordResetToken) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      const tokenAge = new Date(user.passwordResetExpires.getTime() - 60 * 60 * 1000) // token created = expires - 1h
      if (tokenAge > fiveMinutesAgo) {
        res.status(429).json({ message: 'Ya enviamos un correo. Espera 5 minutos antes de intentarlo nuevamente.' })
        return
      }
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    user.passwordResetToken = resetToken
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await user.save({ validateBeforeSave: false })

    await emailService.sendPasswordResetEmail(user.email, resetToken)

    res.json({ message: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.' })
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/reset-password
export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body
    if (!token || !password) throw new CustomError('Token and new password are required', 400)

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    })

    if (!user) throw new CustomError('Token inválido o expirado', 400)

    user.password = password
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    await user.save()

    res.json({ message: 'Contraseña actualizada correctamente.' })
  } catch (err) {
    next(err)
  }
}
