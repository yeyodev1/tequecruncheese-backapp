import { Schema, model, Document } from 'mongoose'

export interface IFlavor {
  nombre: string
  grupo: 'normal' | 'especial'
  isActive: boolean
  limite: number   // 0 = sin límite individual
}

export interface IProduct extends Document {
  slug: string
  nombre: string
  descripcion: string
  precio: number
  categoria: string
  imagen: {
    url: string
    publicId: string
  }
  inStock: boolean
  hasStock: boolean
  stockCount: number
  isActive: boolean
  sortOrder: number
  hasFlavors: boolean
  boxSize: number
  batchSize: number
  flavors: IFlavor[]
}

const productSchema = new Schema<IProduct>(
  {
    slug: { type: String, unique: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '' },
    precio: { type: Number, required: true, min: 0.01 },
    categoria: { type: String, default: 'tequeños' },
    imagen: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    inStock: { type: Boolean, default: true },
    hasStock: { type: Boolean, default: false },
    stockCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    hasFlavors: { type: Boolean, default: false },
    boxSize: { type: Number, default: 12 },
    batchSize: { type: Number, default: 1 },
    flavors: {
      type: [{
        nombre:  { type: String, required: true, trim: true },
        grupo:   { type: String, enum: ['normal', 'especial'], default: 'normal' },
        isActive: { type: Boolean, default: true },
        limite:  { type: Number, default: 0 },
      }],
      default: [],
    },
  },
  { timestamps: true },
)

// Auto-generate slug from nombre before saving if slug not provided
productSchema.pre('save', function (next) {
  if (!this.slug && this.nombre) {
    this.slug = this.nombre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }
  next()
})

export const Product = model<IProduct>('Product', productSchema)
