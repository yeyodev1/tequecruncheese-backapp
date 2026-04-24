import { Request, Response, NextFunction } from 'express'
import { Product } from '../models/product.model'
import { CustomError } from '../errors/customError.error'
import cloudinary from '../config/cloudinary'

function generateSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Public Endpoints ──────────────────────────────────────────────────────────

// GET /api/products
export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const products = await Product.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 })
    res.json(products)
  } catch (err) {
    next(err)
  }
}

// GET /api/products/:slug
export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    if (!product) throw new CustomError('Product not found', 404)
    res.json(product)
  } catch (err) {
    next(err)
  }
}

// ─── Admin Endpoints ───────────────────────────────────────────────────────────

// GET /api/admin/products
export async function adminListProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const products = await Product.find().sort({ sortOrder: 1, createdAt: -1 })
    res.json(products)
  } catch (err) {
    next(err)
  }
}

// POST /api/admin/products
export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { nombre, descripcion, precio, categoria, imagen, inStock, hasStock, stockCount, isActive, slug, hasFlavors, boxSize, batchSize, flavors } = req.body

    if (!nombre) throw new CustomError('nombre is required', 400)
    if (precio === undefined || precio === null) throw new CustomError('precio is required', 400)
    if (typeof precio !== 'number' || precio <= 0) throw new CustomError('precio must be a positive number', 400)

    const computedSlug = slug || generateSlug(nombre)

    const existing = await Product.findOne({ slug: computedSlug })
    if (existing) throw new CustomError(`A product with slug "${computedSlug}" already exists`, 409)

    const product = new Product({
      slug: computedSlug,
      nombre,
      descripcion,
      precio,
      categoria,
      imagen,
      inStock,
      hasStock,
      stockCount,
      isActive,
      ...(hasFlavors !== undefined && { hasFlavors }),
      ...(boxSize !== undefined && { boxSize }),
      ...(batchSize !== undefined && { batchSize }),
      ...(Array.isArray(flavors) && { flavors }),
    })

    await product.save()
    res.status(201).json(product)
  } catch (err) {
    next(err)
  }
}

// PUT /api/admin/products/:id
export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { nombre, descripcion, precio, categoria, imagen, inStock, hasStock, stockCount, isActive, slug, hasFlavors, boxSize, batchSize, flavors } = req.body

    const updateData: Record<string, unknown> = {}
    if (nombre !== undefined) updateData.nombre = nombre
    if (descripcion !== undefined) updateData.descripcion = descripcion
    if (precio !== undefined) updateData.precio = precio
    if (categoria !== undefined) updateData.categoria = categoria
    if (imagen !== undefined) updateData.imagen = imagen
    if (inStock !== undefined) updateData.inStock = inStock
    if (hasStock !== undefined) updateData.hasStock = hasStock
    if (stockCount !== undefined) updateData.stockCount = stockCount
    if (isActive !== undefined) updateData.isActive = isActive
    if (slug && slug.trim()) updateData.slug = slug.trim()
    if (hasFlavors !== undefined) updateData.hasFlavors = hasFlavors
    if (boxSize !== undefined) updateData.boxSize = boxSize
    if (batchSize !== undefined) updateData.batchSize = batchSize
    if (Array.isArray(flavors)) updateData.flavors = flavors

    // If nombre changed and no explicit slug provided, regenerate from nombre
    if (nombre !== undefined && !updateData.slug) {
      updateData.slug = generateSlug(nombre)
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
    if (!product) throw new CustomError('Product not found', 404)
    res.json(product)
  } catch (err) {
    next(err)
  }
}

// DELETE /api/admin/products/:id
export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) throw new CustomError('Product not found', 404)

    // Delete image from Cloudinary if exists
    if (product.imagen?.publicId) {
      try {
        await cloudinary.uploader.destroy(product.imagen.publicId)
      } catch (cloudErr) {
        console.warn('[deleteProduct] Failed to delete Cloudinary image:', cloudErr)
      }
    }

    await product.deleteOne()
    res.json({ message: 'Product deleted successfully' })
  } catch (err) {
    next(err)
  }
}

// POST /api/admin/products/upload-image
export async function uploadProductImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { data, filename } = req.body as { data?: string; filename?: string }

    if (!data) throw new CustomError('data is required (base64 data URL or URL string)', 400)

    const uploadOptions: Record<string, unknown> = {
      folder: 'tequecruncheese/products',
      resource_type: 'image',
    }

    if (filename) {
      // Use filename without extension as public_id
      const publicIdName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
      uploadOptions.public_id = publicIdName
    }

    const result = await cloudinary.uploader.upload(data, uploadOptions)
    res.json({ url: result.secure_url, publicId: result.public_id })
  } catch (err) {
    next(err)
  }
}

// POST /api/admin/products/delete-image
export async function deleteProductImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { publicId } = req.body as { publicId?: string }
    if (!publicId) throw new CustomError('publicId is required', 400)

    await cloudinary.uploader.destroy(publicId)
    res.json({ message: 'Image deleted successfully' })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/admin/products/reorder
export async function reorderProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { order } = req.body as { order: Array<{ _id: string; sortOrder: number }> }
    if (!Array.isArray(order)) throw new CustomError('order must be an array', 400)

    await Promise.all(
      order.map(({ _id, sortOrder }) =>
        Product.findByIdAndUpdate(_id, { sortOrder }),
      ),
    )
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}
