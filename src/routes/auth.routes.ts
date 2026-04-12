import express from 'express'
import { register, login, me, forgotPassword, resetPassword } from '../controllers/auth.controller'
import { verifyToken } from '../middlewares/auth.middleware'
import { AuthRequest } from '../types/AuthRequest'

const authRouter = express.Router()

authRouter.post('/register', register)
authRouter.post('/login', login)
authRouter.get('/me', (req, res, next) => verifyToken(req as AuthRequest, res, next), (req, res, next) => me(req as AuthRequest, res, next))
authRouter.post('/forgot-password', forgotPassword)
authRouter.post('/reset-password', resetPassword)

export default authRouter
