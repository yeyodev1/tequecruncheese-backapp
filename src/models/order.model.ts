import mongoose, { Schema, Document } from 'mongoose'
import type { CartItem, OrderStatus, AdminNote } from '../types/order.types'

export interface IOrder extends Document {
  clientTransactionId: string
  payphoneTransactionId?: string
  customerEmail: string
  trackingToken: string
  items: CartItem[]
  total: number
  status: OrderStatus
  adminNotes: AdminNote[]
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
    customerEmail: { type: String, required: true },
    trackingToken: { type: String, required: true, unique: true, index: true },
    items: { type: [CartItemSchema], required: true },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'preparing', 'ready', 'delivered', 'rejected', 'cancelled'],
      default: 'pending',
    },
    adminNotes: {
      type: [{ text: String, createdAt: { type: Date, default: Date.now } }],
      default: [],
    },
  },
  { timestamps: true },
)

export const Order = mongoose.model<IOrder>('Order', OrderSchema)
