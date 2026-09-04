import { Request, Response, NextFunction } from 'express'
import * as emailService from '../services/email.service'
import { CustomError } from '../errors/customError.error'

/** Shared-secret gate, same one the reconciler cron presents. */
function assertAuthorized(req: Request): void {
  const secret = process.env.CRON_SECRET
  const presented = req.headers.authorization?.replace(/^Bearer /i, '')
  if (!secret || presented !== secret) throw new CustomError('Unauthorized', 401)
}

/**
 * Send the notification test message to an address and report what Resend said.
 *
 * Exists because "did the email go out?" was previously only answerable by
 * placing a real order and waiting. The error is returned rather than
 * swallowed, so a rejected sender domain or a bad key is visible immediately.
 */
export async function testEmail(req: Request, res: Response, next: NextFunction) {
  try {
    assertAuthorized(req)
    const to = (req.query.to as string | undefined)?.trim()
    if (!to || !to.includes('@')) throw new CustomError('A `to` address is required', 400)

    const id = await emailService.sendNotificationTestEmail(to)
    res.json({ ok: true, to, id, from: process.env.EMAIL_FROM, teamEmail: process.env.TEAM_EMAIL })
  } catch (err) {
    if (err instanceof CustomError) return next(err)
    res.status(502).json({ ok: false, error: (err as Error).message })
  }
}
