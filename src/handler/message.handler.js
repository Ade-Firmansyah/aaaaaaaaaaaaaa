const { enqueue } = require('../utils/queue')
const { handleCommand } = require('./command.handler')
const logger = require('../utils/logger')
const {
  isBotOffline,
  getTimeStatus,
  getOfflineMessage,
  getCurrentJakartaTime
} = require('../utils/time')

const ALLOWED_COMMANDS = ['menu', 'help', 'stok', 'stock', 'buy', 'admin', 'ping', 'p', 'cek', 'cancel', 'status', 'testpay', 'reseller', 'gabung', 'website', 'halo', 'test', 'assalamualaikum']

// Commands allowed during offline mode
const OFFLINE_ALLOWED_COMMANDS = ['ping', 'p', 'cek', 'menu', 'help', 'admin']

const lastOfflineReply = {}

function canSendOfflineReply(userId) {
  const now = Date.now()

  if (!lastOfflineReply[userId]) {
    lastOfflineReply[userId] = now
    return true
  }

  if (now - lastOfflineReply[userId] > 300000) {
    lastOfflineReply[userId] = now
    return true
  }

  return false
}

function isValidCommand(text) {
  const normalized = String(text).toLowerCase().trim()
  return ALLOWED_COMMANDS.some(cmd => normalized.startsWith(cmd))
}

function isOfflineAllowedCommand(text) {
  const normalized = String(text).toLowerCase().trim()
  return OFFLINE_ALLOWED_COMMANDS.some(cmd => normalized.startsWith(cmd))
}

async function handleIncomingMessage(client, msg) {
  if (!msg.body) return

  const from = msg.from || ''
  const text = msg.body.toString()

  // Ignore broadcast/status messages
  if (from === 'status@broadcast' || from.includes('broadcast')) {
    return
  }

  // Check if bot is offline
  const offline = isBotOffline()
  logger.info('time_check', {
    time: getCurrentJakartaTime(),
    online: !offline
  })

  if (offline) {
    console.log(`[OFFLINE MODE] ${getTimeStatus()} - Message from ${from}: ${text}`)

    // Allow only specific commands during offline
    if (!isOfflineAllowedCommand(text)) {
      console.log(`[BLOCKED] Transaction command blocked during offline: ${text}`)
      if (canSendOfflineReply(from)) {
        logger.info('offline_reply_sent', { from, time: getCurrentJakartaTime() })
        return client.sendMessage(from, { text: getOfflineMessage() })
      }
      return
    }

    // Allow offline-allowed commands to proceed
    logger.info('Received offline-allowed command', { from, body: text })
    return enqueue(client, msg, handleCommand)
  }

  // Normal online processing
  if (!isValidCommand(text)) {
    return
  }

  logger.info('Received command', { from, body: text })
  enqueue(client, msg, handleCommand)
}

module.exports = {
  handleIncomingMessage
}
