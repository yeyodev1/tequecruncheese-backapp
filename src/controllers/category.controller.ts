import { Request, Response, NextFunction } from 'express'
import { Category } from '../models/category.model'
import { Product } from '../models/product.model'
import { CustomError } from '../errors/customError.error'

export const listCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categories = await Category.find().sort({ name: 1 })
    res.json(categories)
  } catch (error) {
    next(error)
  }
}

export const createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name } = req.body as { name?: string }

    if (!name || !name.trim()) {
      throw new CustomError('Category name is required', 400)
    }

    const category = await Category.create({ name: name.trim() })
    res.status(201).json(category)
  } catch (error) {
    next(error)
  }
}

export const deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params
    const { reassignTo } = req.body as { reassignTo?: string }

    const category = await Category.findById(id)
    if (!category) {
      throw new CustomError('Category not found', 404)
    }

    const categoryName = category.name

    let affectedProducts = 0

    if (reassignTo && reassignTo.trim()) {
      const result = await Product.updateMany(
        { categoria: categoryName },
        { $set: { categoria: reassignTo.trim() } },
      )
      affectedProducts = result.modifiedCount
    } else {
      const result = await Product.updateMany(
        { categoria: categoryName },
        { $set: { categoria: '' } },
      )
      affectedProducts = result.modifiedCount
    }

    await Category.findByIdAndDelete(id)

    res.json({ deleted: true, affectedProducts })
  } catch (error) {
    next(error)
  }
}
