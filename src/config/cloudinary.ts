import { v2 as cloudinary } from 'cloudinary'

const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? 'dvq6znk71'
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

if (!apiKey || !apiSecret) {
  console.warn('[cloudinary] WARNING: CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET not set. Image upload/delete will fail.')
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
})

export default cloudinary
