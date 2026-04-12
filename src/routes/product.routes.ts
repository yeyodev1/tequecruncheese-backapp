import express from 'express'
import { listProducts, getProduct } from '../controllers/product.controller'

const productRouter = express.Router()

// Public routes
productRouter.get('/', listProducts)
productRouter.get('/:slug', getProduct)

export default productRouter
