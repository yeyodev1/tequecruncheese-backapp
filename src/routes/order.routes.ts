import express from 'express'
import { trackOrder, listOrders, ordersByEmail } from '../controllers/order.controller'

const orderRouter = express.Router()

orderRouter.get('/track/:token', trackOrder)
orderRouter.get('/by-email', ordersByEmail)
orderRouter.get('/', listOrders)

export default orderRouter
