const { enqueue } = require('../utils/queue')
const { handleCommand } = require('./command.handler')
const { logInfo } = require('../utils/logger')
const { isBotOffline, getTimeStatus } = require('../utils/time')

const ALLOWED_COMMANDS = ['menu', 'help', 'stok', 'stock', 'buy', 'admin', 'ping', 'p', 'cek', 'cancel', 'testpay', 'reseller', 'gabung', 'website', 'halo', 'test', 'assalamualaikum']

// Commands allowed during offline mode
const OFFLINE_ALLOWED_COMMANDS = ['ping', 'p', 'cek', 'menu', 'help', 'admin']

const OFFLINE_MESSAGE = `╔═════════════════════════════╗
║   ⚠️ BOT SEDANG OFFLINE      ║
╚═════════════════════════════╝

Bot sedang tidak aktif saat ini 🌙
Jam operasional: 07:00 - 23:30

⏳ Silakan kembali lagi pagi nanti

💬 Jika butuh transaksi urgent:
Hubungi admin langsung jika admin belum tidur
Transaksi bisa dilakukan manual

Terima kasih 🙏`

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

  if (offline) {
    console.log(`[OFFLINE MODE] ${getTimeStatus()} - Message from ${from}: ${text}`)

    // Allow only specific commands during offline
    if (!isOfflineAllowedCommand(text)) {
      console.log(`[BLOCKED] Transaction command blocked during offline: ${text}`)
      return client.sendMessage(from, OFFLINE_MESSAGE)
    }

    // Allow offline-allowed commands to proceed
    logInfo('Received offline-allowed command', { from, body: text })
    return enqueue(client, msg, handleCommand)
  }

  // Normal online processing
  if (!isValidCommand(text)) {
    return
  }

  logInfo('Received command', { from, body: text })
  enqueue(client, msg, handleCommand)
}

module.exports = {
  handleIncomingMessage
}
