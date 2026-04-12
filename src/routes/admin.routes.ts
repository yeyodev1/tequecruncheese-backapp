import express from 'express'
import { login, listOrders, getOrder, updateStatus, addNote, sendEmail } from '../controllers/admin.controller'
import {
  adminListProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  deleteProductImage,
  reorderProducts,
} from '../controllers/product.controller'
import { listCategories, createCategory, deleteCategory } from '../controllers/category.controller'
import { adminAuth } from '../middlewares/adminAuth.middleware'

const adminRouter = express.Router()

adminRouter.post('/login', login)
adminRouter.get('/orders', adminAuth, listOrders)
adminRouter.get('/orders/:id', adminAuth, getOrder)
adminRouter.patch('/orders/:id/status', adminAuth, updateStatus)
adminRouter.post('/orders/:id/notes', adminAuth, addNote)
adminRouter.post('/orders/:id/send-email', adminAuth, sendEmail)

// Product admin routes (specific paths before /:id to avoid conflicts)
adminRouter.get('/products', adminAuth, adminListProducts)
adminRouter.post('/products/upload-image', adminAuth, uploadProductImage)
adminRouter.post('/products/delete-image', adminAuth, deleteProductImage)
adminRouter.patch('/products/reorder', adminAuth, reorderProducts)
adminRouter.post('/products', adminAuth, createProduct)
adminRouter.put('/products/:id', adminAuth, updateProduct)
adminRouter.delete('/products/:id', adminAuth, deleteProduct)

// Category admin routes
adminRouter.get('/categories', adminAuth, listCategories)
adminRouter.post('/categories', adminAuth, createCategory)
adminRouter.delete('/categories/:id', adminAuth, deleteCategory)

export default adminRouter
