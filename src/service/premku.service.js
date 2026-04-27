const { retry } = require('../utils/retry')
const { enqueue, dedupe } = require('../utils/request-queue')
const { logInfo, logError } = require('../utils/logger')
const { isBotOffline } = require('../utils/time')
const BASE_URL = process.env.PREMIKU_API_BASE_URL || process.env.PAYMENT_API_BASE_URL || 'https://premku.com/api'
const TIMEOUT_MS = 10000

const productCache = {
  data: null,
  expiresAt: 0
}

async function fetchJson(path, payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(`API ${path} failed with status ${response.status}`)
    }

    return data
  } catch (error) {
    logError('Premku fetch failed', { path, payload, error: error.message })
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function getProducts(apiKey) {
  if (Date.now() < productCache.expiresAt && productCache.data) {
    return productCache.data
  }

  const response = await dedupe(`getProducts:${apiKey}`, () => enqueue(() => retry(() => fetchJson('/products', { api_key: apiKey }))))
  productCache.data = response
  productCache.expiresAt = Date.now() + 20 * 1000
  return response
}

async function createOrder(apiKey, productId, quantity, refId) {
  if (isBotOffline()) {
    console.log(`[BLOCKED] Premku order creation blocked during offline mode`)
    throw new Error('BOT_OFFLINE')
  }
  return enqueue(() => retry(() => fetchJson('/order', {
    api_key: apiKey,
    product_id: productId,
    qty: quantity,
    ref_id: refId
  })))
}

async function checkOrder(apiKey, invoice) {
  if (isBotOffline()) {
    console.log(`[BLOCKED] Premku order check blocked during offline mode`)
    throw new Error('BOT_OFFLINE')
  }
  return dedupe(`checkOrder:${invoice}`, () => enqueue(() => retry(() => fetchJson('/status', {
    api_key: apiKey,
    invoice
  }))))
}

module.exports = {
  getProducts,
  createOrder,
  checkOrder
}
