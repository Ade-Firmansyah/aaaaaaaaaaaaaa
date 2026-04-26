const http = require('http')
const { createClient } = require('./service/wa.service')
const { handleIncomingMessage } = require('./handler/message.handler')
const { orderWatcher } = require('./handler/order.handler')
const { startScheduler: startStatusScheduler, stopScheduler: stopStatusScheduler } = require('./service/status.service')
const { validateSystem } = require('./utils/validator')
const resellerService = require('./service/reseller.service')
const { logInfo, logError } = require('./utils/logger')

const PORT = Number(process.env.PORT || 3000)
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000

let botClient = null
let isInitializing = false
let isIdle = false
let inactivityTimer = null

function sendHealthResponse(res) {
  const waConnected = !!(botClient && botClient.info && botClient.info.wid)
  const payload = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    whatsapp: {
      connected: waConnected,
      user: botClient?.info?.pushname || null
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    return sendHealthResponse(res)
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(PORT, () => {
  logInfo(`Health check server running on port ${PORT}`)
})

function resetInactivityTimer() {
  clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(() => {
    if (isIdle) return
    logInfo('Entering idle mode due to inactivity')
    isIdle = true
    orderWatcher.stop()
    stopStatusScheduler()
  }, INACTIVITY_TIMEOUT_MS)
}

function wakeFromIdle() {
  if (!isIdle) {
    resetInactivityTimer()
    return
  }

  isIdle = false
  logInfo('Waking from idle mode')
  if (botClient && botClient.info) {
    orderWatcher.start(botClient)
    startStatusScheduler(botClient)
    resellerService.removeExpired(botClient)
  }
  resetInactivityTimer()
}

function markActivity() {
  resetInactivityTimer()
  if (isIdle) {
    wakeFromIdle()
  }
}

process.on('uncaughtException', error => {
  logError('Uncaught Exception', { error: error.message, stack: error.stack })
  setTimeout(() => scheduleRestart(), 3000)
})

process.on('unhandledRejection', reason => {
  logError('Unhandled Rejection', { reason: reason?.message || reason })
})

process.on('warning', () => {})

async function initializeBot() {
  if (isInitializing) {
    logInfo('Bot initialization already in progress')
    return
  }

  isInitializing = true
  logInfo('Starting Premiumin Plus WhatsApp bot')

  if (!validateSystem()) {
    logError('System validation failed, aborting startup')
    isInitializing = false
    return
  }

  stopStatusScheduler()
  orderWatcher.stop()

  botClient = createClient()

  botClient.on('message', async msg => {
    markActivity()
    try {
      await handleIncomingMessage(botClient, msg)
    } catch (error) {
      logError('Message handler failed', { error: error.message, from: msg.from })
    }
  })

  botClient.on('ready', () => {
    logInfo('WhatsApp client ready')
    isInitializing = false
    isIdle = false
    orderWatcher.start(botClient)
    startStatusScheduler(botClient)
    resellerService.removeExpired(botClient)
    resetInactivityTimer()
  })

  botClient.initialize().catch(error => {
    logError('Failed to initialize WhatsApp client', error)
    isInitializing = false
    scheduleRestart()
  })
}

function scheduleRestart(delay = 5000) {
  logInfo('Scheduling bot restart', { delay })
  stopStatusScheduler()
  orderWatcher.stop()
  isInitializing = false
  isIdle = false

  setTimeout(() => {
    try {
      initializeBot()
    } catch (error) {
      logError('Restart failed', { error: error.message })
      scheduleRestart(delay)
    }
  }, delay)
}

initializeBot()
