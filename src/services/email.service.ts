import { Resend } from 'resend'
import type { CartItem } from '../types/order.types'

const resend = new Resend(process.env.RESEND_KEY)

// Usar una dirección real (pedidos@tequecruncheese.com) — NO noreply, mejora entregabilidad
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Tequecruncheese <pedidos@tequecruncheese.com>'
// Correo del equipo que recibe notificaciones internas
const TEAM_EMAIL = process.env.TEAM_EMAIL ?? 'pedidos@tequecruncheese.com'

const ACCENT_COLOR = '#2d1b00'
const PRIMARY_COLOR = '#fed47f'

function buildItemsTable(items: CartItem[]): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">${item.nombre}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555;text-align:center;">${item.cantidad}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:${ACCENT_COLOR};font-weight:700;text-align:right;">$${(item.precio * item.cantidad).toFixed(2)}</td>
      </tr>`,
    )
    .join('')

  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:${PRIMARY_COLOR};">
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:${ACCENT_COLOR};">Producto</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;color:${ACCENT_COLOR};">Cant.</th>
          <th style="padding:10px 12px;text-align:right;font-size:13px;color:${ACCENT_COLOR};">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function buildEmailWrapper(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <body style="margin:0;padding:0;background:#fdf8f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f0;padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:560px;width:100%;">
              <tr>
                <td style="background:${ACCENT_COLOR};padding:24px 32px;text-align:center;">
                  <h1 style="margin:0;color:${PRIMARY_COLOR};font-size:22px;font-weight:900;letter-spacing:0.5px;">🧀 Tequecruncheese</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  ${content}
                </td>
              </tr>
              <tr>
                <td style="background:#f9f5ee;padding:16px 32px;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#999;">© 2025 Tequecruncheese · Tequeños artesanales</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`
}

export async function sendOrderPendingEmail(params: {
  to: string
  items: CartItem[]
  total: number
  trackingToken: string
}): Promise<void> {
  const { to, items, total, trackingToken } = params
  const trackingUrl = `${process.env.FRONTEND_URL}/pedido/${trackingToken}`

  const content = `
    <h2 style="margin:0 0 8px;color:${ACCENT_COLOR};font-size:20px;font-weight:800;">¡Recibimos tu pedido!</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Estamos procesando tu pago. En cuanto se confirme, te enviaremos otro correo con la notificación.
    </p>
    ${buildItemsTable(items)}
    <div style="text-align:right;margin:8px 0 24px;font-size:16px;color:${ACCENT_COLOR};font-weight:800;">
      Total: $${total.toFixed(2)}
    </div>
    <p style="margin:0 0 16px;color:#555;font-size:14px;">
      Puedes seguir el estado de tu pedido en cualquier momento con este enlace:
    </p>
    <div style="text-align:center;margin:0 0 8px;">
      <a href="${trackingUrl}"
         style="display:inline-block;background:${ACCENT_COLOR};color:${PRIMARY_COLOR};text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">
        Ver estado del pedido
      </a>
    </div>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Tequecruncheese · Tu pedido está siendo procesado',
      html: buildEmailWrapper(content),
    })
    console.log('[email] sendOrderPendingEmail sent:', result)
  } catch (err) {
    console.error('[email] sendOrderPendingEmail failed:', err)
  }
}

export async function sendPaymentApprovedEmail(params: {
  to: string
  items: CartItem[]
  total: number
  trackingToken: string
}): Promise<void> {
  const { to, items, total, trackingToken } = params
  const trackingUrl = `${process.env.FRONTEND_URL}/pedido/${trackingToken}`

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:48px;">✅</span>
    </div>
    <h2 style="margin:0 0 8px;color:#2f855a;font-size:20px;font-weight:800;text-align:center;">¡Pago confirmado!</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;text-align:center;">
      Tu pedido fue pagado exitosamente. ¡Gracias por confiar en Tequecruncheese!
    </p>
    ${buildItemsTable(items)}
    <div style="text-align:right;margin:8px 0 24px;font-size:16px;color:${ACCENT_COLOR};font-weight:800;">
      Total pagado: $${total.toFixed(2)}
    </div>
    <div style="text-align:center;margin:0 0 8px;">
      <a href="${trackingUrl}"
         style="display:inline-block;background:${ACCENT_COLOR};color:${PRIMARY_COLOR};text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">
        Seguir mi pedido
      </a>
    </div>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Tequecruncheese · ¡Tu pago fue confirmado!',
      html: buildEmailWrapper(content),
    })
    console.log('[email] sendPaymentApprovedEmail sent:', result)
  } catch (err) {
    console.error('[email] sendPaymentApprovedEmail failed:', err)
  }
}

export async function sendPaymentRejectedEmail(params: { to: string }): Promise<void> {
  const { to } = params
  const storeUrl = `${process.env.FRONTEND_URL}/tienda`

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:48px;">❌</span>
    </div>
    <h2 style="margin:0 0 8px;color:#c53030;font-size:20px;font-weight:800;text-align:center;">Tu pago no pudo procesarse</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;text-align:center;">
      Lo sentimos, tu pago fue cancelado o rechazado. Puedes volver a intentarlo cuando quieras.
    </p>
    <div style="text-align:center;margin:0 0 8px;">
      <a href="${storeUrl}"
         style="display:inline-block;background:${ACCENT_COLOR};color:${PRIMARY_COLOR};text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">
        Volver a la Tienda
      </a>
    </div>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Tequecruncheese · Tu pago no pudo completarse',
      html: buildEmailWrapper(content),
    })
    console.log('[email] sendPaymentRejectedEmail sent:', result)
  } catch (err) {
    console.error('[email] sendPaymentRejectedEmail failed:', err)
  }
}

export async function sendGuestAccountCreatedEmail(to: string, name: string, tempPassword: string): Promise<void> {
  const loginUrl = `${process.env.FRONTEND_URL}/login`

  const content = `
    <h2 style="margin:0 0 8px;color:${ACCENT_COLOR};font-size:20px;font-weight:800;">¡Te creamos una cuenta!</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Hola <strong>${name}</strong>, compraste y te creamos una cuenta automáticamente para que puedas hacer seguimiento de tus pedidos.
    </p>
    <div style="background:#f9f5ee;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-size:13px;color:#777;">Tu contraseña es tu correo electrónico:</p>
      <p style="margin:0;font-size:16px;font-weight:800;color:${ACCENT_COLOR};letter-spacing:1px;">${tempPassword}</p>
    </div>
    <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6;">
      Puedes cambiarla en tu perfil una vez que ingreses.
    </p>
    <div style="text-align:center;margin:0 0 8px;">
      <a href="${loginUrl}"
         style="display:inline-block;background:${ACCENT_COLOR};color:${PRIMARY_COLOR};text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">
        Iniciar sesión
      </a>
    </div>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Tequecruncheese · Tu cuenta ha sido creada',
      html: buildEmailWrapper(content),
    })
    console.log('[email] sendGuestAccountCreatedEmail sent:', result)
  } catch (err) {
    console.error('[email] sendGuestAccountCreatedEmail failed:', err)
  }
}

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`

  const content = `
    <h2 style="margin:0 0 8px;color:${ACCENT_COLOR};font-size:20px;font-weight:800;">Recupera tu contraseña</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para crear una nueva contraseña.
    </p>
    <p style="margin:0 0 20px;color:#777;font-size:13px;">
      Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.
    </p>
    <div style="text-align:center;margin:0 0 8px;">
      <a href="${resetUrl}"
         style="display:inline-block;background:${ACCENT_COLOR};color:${PRIMARY_COLOR};text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">
        Restablecer contraseña
      </a>
    </div>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Tequecruncheese · Recupera tu contraseña',
      html: buildEmailWrapper(content),
    })
    console.log('[email] sendPasswordResetEmail sent:', result)
  } catch (err) {
    console.error('[email] sendPasswordResetEmail failed:', err)
  }
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Pago confirmado',
  preparing: 'En preparación',
  ready: 'Listo para entregar',
  delivered: 'Entregado',
}

export async function sendOrderStatusUpdateEmail(to: string, orderStatus: string, trackingToken: string): Promise<void> {
  const trackingUrl = `${process.env.FRONTEND_URL}/pedido/${trackingToken}`
  const statusLabel = STATUS_LABELS[orderStatus] ?? orderStatus

  const content = `
    <h2 style="margin:0 0 8px;color:${ACCENT_COLOR};font-size:20px;font-weight:800;">Tu pedido fue actualizado</h2>
    <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">
      El estado de tu pedido cambió a:
    </p>
    <div style="background:#f9f5ee;border-radius:8px;padding:16px 20px;margin:0 0 24px;text-align:center;">
      <p style="margin:0;font-size:18px;font-weight:800;color:${ACCENT_COLOR};">${statusLabel}</p>
    </div>
    <div style="text-align:center;margin:0 0 8px;">
      <a href="${trackingUrl}"
         style="display:inline-block;background:${ACCENT_COLOR};color:${PRIMARY_COLOR};text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">
        Ver mi pedido
      </a>
    </div>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Tequecruncheese · Tu pedido fue actualizado',
      html: buildEmailWrapper(content),
    })
    console.log('[email] sendOrderStatusUpdateEmail sent:', result)
  } catch (err) {
    console.error('[email] sendOrderStatusUpdateEmail failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICACIONES INTERNAS AL EQUIPO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Notifica al equipo cuando llega un pedido nuevo (pago pendiente).
 * Se envía desde el mismo pedidos@ para que el equipo pueda responder si es necesario.
 */
export async function sendNewOrderAlertToTeam(params: {
  customerEmail: string
  customerName?: string
  items: CartItem[]
  total: number
  trackingToken: string
  orderId: string
}): Promise<void> {
  const { customerEmail, customerName, items, total, trackingToken, orderId } = params
  const adminUrl = `${process.env.FRONTEND_URL}/admin/dashboard`
  const trackingUrl = `${process.env.FRONTEND_URL}/pedido/${trackingToken}`
  const displayName = customerName ?? customerEmail

  const content = `
    <h2 style="margin:0 0 4px;color:${ACCENT_COLOR};font-size:20px;font-weight:800;">
      🛒 Nuevo pedido recibido
    </h2>
    <p style="margin:0 0 20px;color:#777;font-size:13px;">ID: ${orderId}</p>

    <div style="background:#f9f5ee;border-radius:8px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0 0 4px;font-size:13px;color:#777;">Cliente</p>
      <p style="margin:0;font-size:15px;font-weight:700;color:${ACCENT_COLOR};">${displayName}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#555;">${customerEmail}</p>
    </div>

    ${buildItemsTable(items)}

    <div style="text-align:right;margin:8px 0 24px;font-size:16px;color:${ACCENT_COLOR};font-weight:800;">
      Total: $${total.toFixed(2)}
    </div>

    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:0 0 8px;">
      <a href="${adminUrl}"
         style="display:inline-block;background:${ACCENT_COLOR};color:${PRIMARY_COLOR};text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;">
        Ver en Admin
      </a>
      <a href="${trackingUrl}"
         style="display:inline-block;background:#f9f5ee;color:${ACCENT_COLOR};text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;border:1px solid ${ACCENT_COLOR};">
        Ver tracking
      </a>
    </div>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: TEAM_EMAIL,
      subject: `🛒 Nuevo pedido — $${total.toFixed(2)} — ${displayName}`,
      html: buildEmailWrapper(content),
    })
    console.log('[email] sendNewOrderAlertToTeam sent:', result)
  } catch (err) {
    console.error('[email] sendNewOrderAlertToTeam failed:', err)
  }
}

/**
 * Notifica al equipo cuando un pago fue CONFIRMADO (aprobado por Payphone).
 */
export async function sendPaymentConfirmedAlertToTeam(params: {
  customerEmail: string
  items: CartItem[]
  total: number
  trackingToken: string
  orderId: string
}): Promise<void> {
  const { customerEmail, items, total, trackingToken, orderId } = params
  const adminUrl = `${process.env.FRONTEND_URL}/admin/dashboard`

  const content = `
    <div style="text-align:center;margin-bottom:20px;">
      <span style="font-size:40px;">✅</span>
    </div>
    <h2 style="margin:0 0 4px;color:#2f855a;font-size:20px;font-weight:800;text-align:center;">
      Pago confirmado
    </h2>
    <p style="margin:0 0 20px;color:#777;font-size:13px;text-align:center;">ID: ${orderId}</p>

    <div style="background:#f0fff4;border-radius:8px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0 0 4px;font-size:13px;color:#777;">Cliente</p>
      <p style="margin:0;font-size:15px;font-weight:700;color:#22543d;">${customerEmail}</p>
    </div>

    ${buildItemsTable(items)}

    <div style="text-align:right;margin:8px 0 24px;font-size:16px;color:${ACCENT_COLOR};font-weight:800;">
      Total pagado: $${total.toFixed(2)}
    </div>

    <div style="text-align:center;margin:0 0 8px;">
      <a href="${adminUrl}"
         style="display:inline-block;background:${ACCENT_COLOR};color:${PRIMARY_COLOR};text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">
        Gestionar pedido en Admin
      </a>
    </div>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: TEAM_EMAIL,
      subject: `✅ Pago confirmado — $${total.toFixed(2)} — ${customerEmail}`,
      html: buildEmailWrapper(content),
    })
    console.log('[email] sendPaymentConfirmedAlertToTeam sent:', result)
  } catch (err) {
    console.error('[email] sendPaymentConfirmedAlertToTeam failed:', err)
  }
}
