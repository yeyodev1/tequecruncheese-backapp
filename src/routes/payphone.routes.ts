import { Router } from 'express'
import { prepare, confirm } from '../controllers/payphone.controller'

const payphoneRouter = Router()

payphoneRouter.post('/prepare', prepare)
payphoneRouter.post('/confirm', confirm)

export default payphoneRouter
