import express from 'express'
import { trackOrder, listOrders, ordersByEmail, myOrders } from '../controllers/order.controller'
import { verifyToken } from '../middlewares/auth.middleware'
import { AuthRequest } from '../types/AuthRequest'

const orderRouter = express.Router()

orderRouter.get('/my-orders', (req, res, next) => verifyToken(req as AuthRequest, res, next), (req, res, next) => myOrders(req as AuthRequest, res, next))
orderRouter.get('/track/:token', trackOrder)
orderRouter.get('/by-email', ordersByEmail)
orderRouter.get('/', listOrders)

export default orderRouter
