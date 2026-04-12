/**
 * Seed script — crea (o actualiza) la cuenta de administrador.
 * Uso: pnpm seed:admin
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../models/user.model'

const ADMIN_EMAIL    = 'admin@tequecruncheese.com'
const ADMIN_PASSWORD = '123456789'
const ADMIN_NAME     = 'Admin Tequecruncheese'

async function main() {
  const uri = process.env.DB_URI
  if (!uri) {
    console.error('❌  DB_URI no está definido en .env')
    process.exit(1)
  }

  console.log('🔌  Conectando a MongoDB...')
  await mongoose.connect(uri)
  console.log('✅  Conectado.')

  const existing = await User.findOne({ email: ADMIN_EMAIL })

  if (existing) {
    // Actualiza contraseña y rol por si acaso
    existing.password = ADMIN_PASSWORD
    existing.role = 'admin'
    existing.name = ADMIN_NAME
    await existing.save()
    console.log(`✅  Cuenta admin actualizada: ${ADMIN_EMAIL}`)
  } else {
    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
    })
    console.log(`✅  Cuenta admin creada: ${ADMIN_EMAIL}`)
  }

  console.log(`🔑  Contraseña: ${ADMIN_PASSWORD}`)
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('❌  Error en seed:', err)
  process.exit(1)
})
