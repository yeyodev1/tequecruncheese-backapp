import mongoose, { Schema, Document } from 'mongoose'
import type { CartItem, OrderStatus, AdminNote, FlavorSelection } from '../types/order.types'

export interface IDeliveryAddress {
  calle: string
  barrio?: string
  referencia?: string
  mapsUrl?: string
}

export interface IOrder extends Document {
  clientTransactionId: string
  payphoneTransactionId?: string
  payWithPayPhone?: string
  customerEmail: string
  customerName?: string
  customerPhone?: string
  trackingToken: string
  items: CartItem[]
  total: number
  status: OrderStatus
  adminNotes: AdminNote[]
  userId?: mongoose.Types.ObjectId
  deliveryAddress?: IDeliveryAddress
  cedula?: string
  quiereFactura?: boolean
  facturaEmail?: string
  facturaRuc?: string
  deliveryCost?: number
  deliveryKm?: number
  deliveryMethod?: 'delivery' | 'pickup'
  /** Absent on immediate orders; set when the customer booked a slot. */
  scheduledFor?: Date
  createdAt: Date
  updatedAt: Date
}

const FlavorSelectionSchema = new Schema<FlavorSelection>(
  {
    nombre: { type: String, required: true },
    grupo: { type: String, required: true },
    cantidad: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const CartItemSchema = new Schema<CartItem>(
  {
    slug: { type: String, required: true },
    nombre: { type: String, required: true },
    precio: { type: Number, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    // Flavor boxes carry their per-flavor breakdown; mongoose silently drops
    // anything not declared here, which is why orders used to arrive empty.
    flavorSelections: { type: [FlavorSelectionSchema], default: undefined },
  },
  { _id: false },
)

const OrderSchema = new Schema<IOrder>(
  {
    clientTransactionId: { type: String, required: true, unique: true, index: true },
    payphoneTransactionId: { type: String },
    payWithPayPhone: { type: String },
    customerEmail:  { type: String, required: true },
    customerName:   { type: String },
    customerPhone:  { type: String },
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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deliveryAddress: {
      type: new Schema<IDeliveryAddress>(
        {
          calle: { type: String, required: true },
          barrio: { type: String },
          referencia: { type: String },
          mapsUrl: { type: String },
        },
        { _id: false },
      ),
    },
    cedula: { type: String, match: /^\d{10}$/ },
    quiereFactura: { type: Boolean, default: false },
    facturaEmail:  { type: String },
    facturaRuc:    { type: String, match: /^(\d{10}|\d{13})$/ },
    deliveryCost:  { type: Number, default: 0 },
    deliveryKm:    { type: Number },
    deliveryMethod: { type: String, enum: ['delivery', 'pickup'], default: 'delivery' },
    // Indexed so the kitchen can pull the upcoming schedule in order.
    scheduledFor:  { type: Date, index: true },
  },
  { timestamps: true },
)

export const Order = mongoose.model<IOrder>('Order', OrderSchema)
