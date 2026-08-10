export interface FlavorSelection {
  nombre: string
  grupo: string
  cantidad: number
}

export interface CartItem {
  slug: string
  nombre: string
  precio: number
  cantidad: number
  flavorSelections?: FlavorSelection[]
}

export type OrderStatus =
  | 'pending'
  | 'approved'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'rejected'
  | 'cancelled'

export interface AdminNote {
  text: string
  createdAt: Date
}

export interface CustomerInfo {
  nombre?: string
  telefono?: string
  cedula?: string
  calle?: string
  barrio?: string
  referencia?: string
  mapsUrl?: string
  quiereFactura?: boolean
  facturaEmail?: string
  facturaRuc?: string
  deliveryMethod?: 'delivery' | 'pickup'
}

export interface PrepareRequest {
  items: CartItem[]
  clientTransactionId: string
  customerEmail: string
  customerInfo?: CustomerInfo
  deliveryCost?: number
}

export interface TrackOrderResponse {
  status: OrderStatus
  items: CartItem[]
  total: number
  createdAt: Date
}

export interface PrepareResponse {
  payWithPayPhone: string
}

export interface ConfirmRequest {
  id: string
  clientTransactionId: string
}

export interface ConfirmResponse {
  success: boolean
  transactionStatus: string
  order: {
    id: string
    status: OrderStatus
    total: number
  }
}

export interface PayphonePreparePayload {
  amount: number
  amountWithoutTax: number
  currency: string
  clientTransactionId: string
  responseUrl: string
  cancellationUrl: string
  storeId: string
  reference: string
}

export interface PayphonePrepareResult {
  payWithPayPhone: string
}

export interface PayphoneConfirmPayload {
  id: string
  clientTransactionId: string
}

export interface PayphoneConfirmResult {
  transactionStatus: string
  amount: number
  clientTransactionId: string
}
