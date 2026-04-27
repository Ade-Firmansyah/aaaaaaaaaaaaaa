const fs = require('fs')
const path = require('path')
const qrcode = require('qrcode-terminal')
const { Client, LocalAuth } = require('whatsapp-web.js')
const { logInfo, logError } = require('../utils/logger')
const { SESSION_PATH } = require('../config')

function ensureSessionPath() {
  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true })
  }
}

function detectChromium() {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH
  }

  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome'
  ]

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch (_) {
      continue
    }
  }

  return undefined
}

function createClient() {
  ensureSessionPath()

  const chromiumPath = detectChromium()
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'bot-session',
      dataPath: SESSION_PATH
    }),
    puppeteer: {
      headless: true,
      executablePath: chromiumPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-dev-tools',
        '--disable-software-rasterizer'
      ]
    }
  })

  client.on('qr', qr => {
    // Store QR code for HTTP serving
    global.currentQrCode = qr
    logInfo('QR code generated for login - Available at /qr endpoint')
    qrcode.generate(qr, { small: true })

    // Clear QR code after 60 seconds (QR codes expire)
    setTimeout(() => {
      if (global.currentQrCode === qr) {
        global.currentQrCode = null
        logInfo('QR code expired and cleared')
      }
    }, 60000)
  })

  client.on('ready', () => {
    // Clear QR code when authenticated
    global.currentQrCode = null
    logInfo('WhatsApp client ready - QR code cleared')
  })

  client.on('auth_failure', msg => {
    logError('WhatsApp authentication failure', { message: msg })
  })

  client.on('disconnected', reason => {
    if (reason === 'LOGOUT') {
      logInfo('WhatsApp session logged out')
    } else {
      logError('WhatsApp disconnected unexpectedly', { reason })
      setTimeout(() => {
        client.initialize().catch(err => logError('WhatsApp reconnect error', err))
      }, 5000)
    }
  })

  return client
}

module.exports = {
  createClient
}
