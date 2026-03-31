import mongoose, { Schema, Document } from 'mongoose'
import type { CartItem, OrderStatus } from '../types/order.types'

export interface IOrder extends Document {
  clientTransactionId: string
  payphoneTransactionId?: string
  items: CartItem[]
  total: number
  status: OrderStatus
  createdAt: Date
  updatedAt: Date
}

const CartItemSchema = new Schema<CartItem>(
  {
    slug: { type: String, required: true },
    nombre: { type: String, required: true },
    precio: { type: Number, required: true },
    cantidad: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const OrderSchema = new Schema<IOrder>(
  {
    clientTransactionId: { type: String, required: true, unique: true, index: true },
    payphoneTransactionId: { type: String },
    items: { type: [CartItemSchema], required: true },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true },
)

export const Order = mongoose.model<IOrder>('Order', OrderSchema)
