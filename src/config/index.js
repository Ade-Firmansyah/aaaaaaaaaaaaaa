const path = require('path')
const dotenv = require('dotenv')
const { decrypt } = require('../utils/crypto')

// Load .env file with explicit path
const envPath = path.resolve(__dirname, '../../.env')
const result = dotenv.config({ path: envPath })

if (result.error) {
  console.warn('⚠️ Failed to load .env file:', result.error.message)
} else {
  console.log('✅ .env file loaded successfully')
}

const SESSION_PATH = path.resolve(process.cwd(), 'sessions')
const {
  ENCRYPTED_API_KEY,
  CRYPTO_SECRET,
  API_KEY: RAW_API_KEY,
  PREMKU_API_BASE_URL,
  PAYMENT_API_BASE_URL
} = process.env

let API_KEY = ''

// Debug logging
console.log('🔍 Environment variables check:')
console.log('- ENCRYPTED_API_KEY exists:', !!ENCRYPTED_API_KEY)
console.log('- CRYPTO_SECRET exists:', !!CRYPTO_SECRET)
console.log('- RAW_API_KEY exists:', !!RAW_API_KEY)

if (ENCRYPTED_API_KEY) {
  if (!CRYPTO_SECRET) {
    console.warn('⚠️ CRYPTO_SECRET tidak ditemukan. ENCRYPTED_API_KEY tidak dapat didekripsi.')
  } else {
    try {
      API_KEY = decrypt(ENCRYPTED_API_KEY, CRYPTO_SECRET)
      console.log('✅ API_KEY decrypted from ENCRYPTED_API_KEY')
    } catch (error) {
      console.warn('⚠️ Gagal mendekripsi ENCRYPTED_API_KEY:', error.message)
    }
  }
}

if (!API_KEY && RAW_API_KEY) {
  API_KEY = RAW_API_KEY
  console.log('✅ API_KEY loaded from RAW_API_KEY')
}

if (!API_KEY) {
  console.warn('⚠️ API_KEY tidak dikonfigurasi. Tambahkan ENCRYPTED_API_KEY atau API_KEY di file .env.')
  console.log('Current env vars:', { ENCRYPTED_API_KEY: !!ENCRYPTED_API_KEY, CRYPTO_SECRET: !!CRYPTO_SECRET, RAW_API_KEY: !!RAW_API_KEY })
} else {
  console.log('✅ API_KEY configured successfully')
}

module.exports = {
  API_KEY,
  SESSION_PATH,
  BASE_API_URL: PREMKU_API_BASE_URL || PAYMENT_API_BASE_URL || 'https://premku.com/api'
}
