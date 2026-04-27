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

// Global QR code storage
global.currentQrCode = null

function sendHealthResponse(res) {
  const isConnected = botClient && botClient.info && botClient.info.wid
  const payload = {
    status: 'ok', // Always return 200 for server health
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    whatsapp: {
      connected: isConnected,
      user: botClient?.info?.pushname || null,
      authenticated: !!(botClient && botClient.info && botClient.info.wid),
      qr_available: !!global.currentQrCode
    }
  }

  // Always return 200 when server is running (Railway requires this)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function sendQrResponse(res) {
  if (!global.currentQrCode) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'QR code not available. Bot may already be authenticated.' }))
    return
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Bot QR Login</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }
        h1 {
            color: #25d366;
            margin-bottom: 20px;
        }
        .qr-container {
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .instructions {
            color: #666;
            line-height: 1.6;
            margin: 20px 0;
        }
        .status {
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
        }
        .status.waiting {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        .status.ready {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 WhatsApp Bot Login</h1>
        <div class="status ready">
            ✅ QR Code Ready - Scan with WhatsApp
        </div>
        <div class="qr-container">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(global.currentQrCode)}" alt="QR Code" style="max-width: 100%; height: auto;" />
        </div>
        <div class="instructions">
            <h3>📋 Instructions:</h3>
            <ol>
                <li>Open WhatsApp on your phone</li>
                <li>Tap the menu (⋮) or settings</li>
                <li>Select "Linked Devices" or "WhatsApp Web"</li>
                <li>Tap "Link a Device"</li>
                <li>Scan the QR code above</li>
            </ol>
            <p><strong>Note:</strong> The QR code expires in 45 seconds. Refresh the page if needed.</p>
        </div>
    </div>

    <script>
        // Auto-refresh QR code every 30 seconds
        setTimeout(() => {
            if (!window.location.search.includes('refresh')) {
                window.location.reload();
            }
        }, 30000);
    </script>
</body>
</html>`

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(html)
}

const server = http.createServer((req, res) => {
  // Enable CORS for Railway
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.url === '/health') {
    return sendHealthResponse(res)
  }

  if (req.url === '/' || req.url === '/qr') {
    return sendQrResponse(res)
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(PORT, () => {
  logInfo(`Health check server running on port ${PORT}`)
  logInfo(`QR Code available at: http://localhost:${PORT}/qr`)
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
