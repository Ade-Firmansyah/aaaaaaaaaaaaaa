const http = require('http')
const fs = require('fs')
const path = require('path')
const { createClient } = require('./service/wa.service')
const { handleIncomingMessage } = require('./handler/message.handler')
const { orderWatcher } = require('./handler/order.handler')
const { startScheduler: startStatusScheduler, stopScheduler: stopStatusScheduler } = require('./service/status.service')
const { validateSystem } = require('./utils/validator')
const resellerService = require('./service/reseller.service')
const { logInfo, logError } = require('./utils/logger')

const PORT = Number(process.env.PORT || 3000)
const LOCK_FILE = path.join(process.cwd(), 'bot.lock')

let botClient = null
let isInitializing = false
let isStarting = false

// Offline mode logger - variable outside closure to prevent memory leak
const timeUtils = require('./utils/time')
let lastOfflineStatus = null

// Global QR code storage
global.currentQrCode = null

// Single instance protection
function checkLockFile() {
  if (fs.existsSync(LOCK_FILE)) {
    console.log("⚠️ Bot already running (lock detected)")
    process.exit(1)
  }

  try {
    fs.writeFileSync(LOCK_FILE, `locked-${Date.now()}-${process.pid}`)
    console.log("🔒 Bot lock file created")
  } catch (error) {
    console.error("❌ Failed to create lock file:", error.message)
    process.exit(1)
  }
}

function removeLockFile() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE)
      console.log("🔓 Bot lock file removed")
    }
  } catch (error) {
    console.error("❌ Failed to remove lock file:", error.message)
  }
}

// Global error handling
process.on('uncaughtException', error => {
  logError('Uncaught Exception', { error: error.message, stack: error.stack })
  setTimeout(() => scheduleRestart(), 3000)
})

process.on('unhandledRejection', reason => {
  logError('Unhandled Rejection', { reason: reason?.message || reason })
})

process.on('warning', () => {})

// Cleanup on exit
process.on('exit', () => {
  removeLockFile()
  stopStatusScheduler()
  orderWatcher.stop()
})

process.on('SIGINT', () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...")
  removeLockFile()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...")
  removeLockFile()
  process.exit(0)
})

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

// Safe server startup with port conflict handling
function startServer() {
  server.listen(PORT, () => {
    logInfo(`Health check server running on port ${PORT}`)
    logInfo(`QR Code available at: http://localhost:${PORT}/qr`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${PORT} already in use, skipping web server...`)
      console.log("ℹ️ Bot will continue without HTTP server (normal for Railway)")
    } else {
      logError('Server error', { error: err.message, code: err.code })
    }
  })
}

// Offline mode logger - log only when status changes (no closure recreation)
setInterval(() => {
  const offline = timeUtils.isBotOffline()
  if (lastOfflineStatus === null || offline !== lastOfflineStatus) {
    console.log(`[OFFLINE MODE] ${timeUtils.getTimeStatus()}`)
    lastOfflineStatus = offline
  }
}, 60000)

// Single instance protection and main startup
async function startBot() {
  if (isStarting) {
    console.log("⚠️ Bot already starting, skip...")
    return
  }

  isStarting = true

  try {
    console.log("🚀 Starting bot...")

    // Check lock file first
    checkLockFile()

    // Start HTTP server (safe)
    startServer()

    // Initialize bot
    await initializeBot()

  } catch (err) {
    console.error("❌ Error starting bot:", err)
    removeLockFile()
  } finally {
    isStarting = false
  }
}

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
    try {
      await handleIncomingMessage(botClient, msg)
    } catch (error) {
      logError('Message handler failed', { error: error.message, from: msg.from })
    }
  })

  botClient.on('ready', () => {
    logInfo('WhatsApp client ready')
    isInitializing = false
    orderWatcher.start(botClient)
    startStatusScheduler(botClient)
    resellerService.removeExpired(botClient)
  })

  botClient.on('disconnected', async (reason) => {
    logInfo('WhatsApp disconnected', { reason })

    // Only restart if not manually stopped
    if (reason !== 'LOGOUT' && !isInitializing) {
      setTimeout(() => {
        logInfo('Attempting to restart WhatsApp client...')
        initializeBot()
      }, 5000)
    }
  })

  try {
    await botClient.initialize()
  } catch (error) {
    logError('Failed to initialize WhatsApp client', error)
    isInitializing = false
    // Don't auto-restart on initialization failure
  }
}

function scheduleRestart(delay = 5000) {
  if (isInitializing) {
    logInfo('Restart already scheduled')
    return
  }

  stopStatusScheduler()
  orderWatcher.stop()
  isInitializing = false

  setTimeout(() => {
    try {
      initializeBot()
    } catch (error) {
      logError('Restart failed', { error: error.message })
      // Don't recursively schedule restart on failure
    }
  }, delay)
}

// Clean session reset function
function safeResetSession() {
  console.log("⚠️ Resetting session manually...")
  try {
    const sessionPath = path.join(process.cwd(), 'sessions')
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true })
      console.log("✅ Session data cleared")
    }
  } catch (error) {
    console.error("❌ Failed to reset session:", error.message)
  }
}

// Export for manual session reset if needed
global.safeResetSession = safeResetSession

// Start bot once
startBot()
