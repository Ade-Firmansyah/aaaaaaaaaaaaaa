const LOG_LEVEL = (process.env.LOG_LEVEL || process.env.DEBUG || '').toLowerCase()
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT
const isDebug = LOG_LEVEL === 'debug' || process.env.DEBUG === 'true'

function formatPrefix(level) {
  const time = new Date().toISOString()
  return `[${level}] ${time}`
}

function logInfo(message, meta) {
  if (isProduction && !isDebug) {
    const allowed = ['ready', 'started', 'healthy', 'idle', 'waking', 'connected', 'time_check', 'offline_reply_sent']
    if (!allowed.some(keyword => message.toLowerCase().includes(keyword))) {
      return
    }
  }

  if (meta !== undefined) {
    console.log(`${formatPrefix('INFO')} ${message}`, meta)
  } else {
    console.log(`${formatPrefix('INFO')} ${message}`)
  }
}

function logError(message, meta) {
  if (meta !== undefined) {
    console.error(`${formatPrefix('ERROR')} ${message}`, meta)
  } else {
    console.error(`${formatPrefix('ERROR')} ${message}`)
  }
}

function logRetry(message, meta) {
  if (isProduction && !isDebug) return
  if (meta !== undefined) {
    console.warn(`${formatPrefix('RETRY')} ${message}`, meta)
  } else {
    console.warn(`${formatPrefix('RETRY')} ${message}`)
  }
}

module.exports = {
  logInfo,
  info: logInfo,
  logError,
  logRetry
}
