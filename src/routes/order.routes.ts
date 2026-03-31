import express from 'express'
import { trackOrder, listOrders } from '../controllers/order.controller'

const orderRouter = express.Router()

orderRouter.get('/track/:token', trackOrder)
orderRouter.get('/', listOrders)

export default orderRouter
