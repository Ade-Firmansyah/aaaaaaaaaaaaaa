const { retry } = require('../utils/retry')
const { enqueue, dedupe } = require('../utils/request-queue')
const { logInfo, logError } = require('../utils/logger')
const { isBotOffline } = require('../utils/time')
const BASE_URL = process.env.PREMIKU_API_BASE_URL || process.env.PAYMENT_API_BASE_URL || 'https://premku.com/api'
const TIMEOUT_MS = 10000

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
    logError('Payment fetch failed', { path, payload, error: error.message })
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function createDeposit(apiKey, amount) {
  if (isBotOffline()) {
    console.log(`[BLOCKED] Payment creation blocked during offline mode`)
    throw new Error('BOT_OFFLINE')
  }
  return enqueue(() => retry(() => fetchJson('/pay', { api_key: apiKey, amount })))
}

async function checkDeposit(apiKey, invoice) {
  if (isBotOffline()) {
    console.log(`[BLOCKED] Payment check blocked during offline mode`)
    throw new Error('BOT_OFFLINE')
  }
  return dedupe(`checkDeposit:${invoice}`, () => retry(() => fetchJson('/pay_status', { api_key: apiKey, invoice })))
}

async function cancelDeposit(apiKey, invoice) {
  if (isBotOffline()) {
    console.log(`[BLOCKED] Payment cancel blocked during offline mode`)
    throw new Error('BOT_OFFLINE')
  }
  return enqueue(() => retry(() => fetchJson('/cancel_pay', { api_key: apiKey, invoice })))
}

module.exports = {
  createDeposit,
  checkDeposit,
  cancelDeposit
}
