import { Router } from 'express'
import { prepare, confirm, reconcile } from '../controllers/payphone.controller'

const payphoneRouter = Router()

payphoneRouter.post('/prepare', prepare)
payphoneRouter.post('/confirm', confirm)
// Scheduled sweep for payments whose browser redirect never landed.
payphoneRouter.get('/reconcile', reconcile)

export default payphoneRouter
