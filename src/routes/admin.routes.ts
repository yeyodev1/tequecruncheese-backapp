import express from 'express'
import { login, listOrders, getOrder, updateStatus, addNote } from '../controllers/admin.controller'
import { adminAuth } from '../middlewares/adminAuth.middleware'

const adminRouter = express.Router()

adminRouter.post('/login', login)
adminRouter.get('/orders', adminAuth, listOrders)
adminRouter.get('/orders/:id', adminAuth, getOrder)
adminRouter.patch('/orders/:id/status', adminAuth, updateStatus)
adminRouter.post('/orders/:id/notes', adminAuth, addNote)

export default adminRouter
