import express from 'express'
import { listCategories } from '../controllers/category.controller'

const categoryRouter = express.Router()
categoryRouter.get('/', listCategories)

export default categoryRouter
