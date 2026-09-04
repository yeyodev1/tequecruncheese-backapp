/**
 * Scheduled-order slots.
 *
 * The browser renders the picker, but the slot a customer picked is re-checked
 * here before the order is created — a stale tab, a clock skew, or a crafted
 * request must not book a delivery for 3am or for a date in the past.
 */

import { CustomError } from '../errors/customError.error'

/** Ecuador has no DST, but resolving through the IANA zone keeps it honest. */
const STORE_TIMEZONE = 'America/Guayaquil'

export const SCHEDULE_CONFIG = {
  timezone: STORE_TIMEZONE,
  /** Store opens at 09:00. */
  openHour: 9,
  /** Store closes at 20:00 — the last bookable slot starts before this. */
  closeHour: 20,
  /** Slots every 30 minutes. */
  slotMinutes: 30,
  /** Nothing sooner than an hour from now: the kitchen needs the lead time. */
  minLeadMinutes: 60,
  /** Nothing further out than two weeks. */
  maxDaysAhead: 14,
} as const

export interface StoreLocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Wall-clock time at the store for a given instant. */
export function storeLocalParts(date: Date): StoreLocalParts {
  const parts = partsFormatter.formatToParts(date)
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // `hour12: false` renders midnight as 24 in some ICU builds.
  const hour = read('hour') % 24
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
  }
}

/** "2026-08-11" for the store's calendar day containing this instant. */
export function storeDayKey(date: Date): string {
  const { year, month, day } = storeLocalParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Human label used in emails and the admin panel, e.g. "mar 11 ago, 14:30". */
export function formatScheduledFor(date: Date): string {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: STORE_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/**
 * Validate a customer-supplied slot.
 * Returns null when nothing was scheduled (an "as soon as possible" order);
 * throws a 400 when a slot was supplied but is not bookable.
 */
export function validateScheduledFor(raw: unknown, now: Date = new Date()): Date | null {
  if (raw === undefined || raw === null || raw === '') return null

  if (typeof raw !== 'string') {
    throw new CustomError('scheduledFor must be an ISO date string', 400)
  }

  // Strict ISO-8601 with an explicit offset. The Date constructor is lenient
  // enough to read "manana a las 3" as 2001-03-01, so garbage must be rejected
  // as garbage rather than sliding into the range checks below.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    throw new CustomError('scheduledFor must be an ISO-8601 instant with an offset', 400)
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new CustomError('scheduledFor is not a valid date', 400)
  }

  const leadMs = date.getTime() - now.getTime()
  if (leadMs < SCHEDULE_CONFIG.minLeadMinutes * 60_000) {
    throw new CustomError(
      `Los pedidos programados necesitan al menos ${SCHEDULE_CONFIG.minLeadMinutes} minutos de anticipación`,
      400,
    )
  }

  const maxMs = SCHEDULE_CONFIG.maxDaysAhead * 24 * 60 * 60_000
  if (leadMs > maxMs) {
    throw new CustomError(
      `Solo puedes programar con hasta ${SCHEDULE_CONFIG.maxDaysAhead} días de anticipación`,
      400,
    )
  }

  const { hour, minute } = storeLocalParts(date)
  const minutesOfDay = hour * 60 + minute
  const opens = SCHEDULE_CONFIG.openHour * 60
  // The last slot must start early enough to fall before closing time.
  const lastSlot = SCHEDULE_CONFIG.closeHour * 60 - SCHEDULE_CONFIG.slotMinutes

  if (minutesOfDay < opens || minutesOfDay > lastSlot) {
    throw new CustomError(
      `Atendemos de ${SCHEDULE_CONFIG.openHour}:00 a ${SCHEDULE_CONFIG.closeHour}:00`,
      400,
    )
  }

  if (minute % SCHEDULE_CONFIG.slotMinutes !== 0) {
    throw new CustomError(
      `Los horarios son cada ${SCHEDULE_CONFIG.slotMinutes} minutos`,
      400,
    )
  }

  return date
}

/**
 * Is the store taking orders right now?
 *
 * The scheduled-slot rules above govern *when a customer wants their food*.
 * This governs *when an order may be placed at all* — a different question,
 * asked because orders landing after closing had nobody to cook them.
 */
export function isStoreOpen(now: Date = new Date()): boolean {
  const { hour, minute } = storeLocalParts(now)
  const minutesOfDay = hour * 60 + minute
  return (
    minutesOfDay >= SCHEDULE_CONFIG.openHour * 60 &&
    minutesOfDay < SCHEDULE_CONFIG.closeHour * 60
  )
}

/**
 * Reject an order placed outside opening hours.
 *
 * Checked on the server because the browser's clock belongs to the customer:
 * a device set to noon, or a tab left open since the afternoon, would sail
 * past a front-end-only check.
 */
export function assertStoreOpen(now: Date = new Date()): void {
  if (isStoreOpen(now)) return
  throw new CustomError(
    `Ya cerramos por hoy. Recibimos pedidos de ${SCHEDULE_CONFIG.openHour}:00 a ` +
      `${SCHEDULE_CONFIG.closeHour}:00 (hora de Ecuador). ¡Te esperamos mañana!`,
    409,
  )
}
