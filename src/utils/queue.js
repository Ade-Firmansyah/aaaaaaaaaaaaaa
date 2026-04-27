const { logError } = require('./logger')

const queue = []
let isProcessing = false
const MAX_QUEUE_SIZE = 50 // Limit queue size to prevent memory bloat

// Optimasi: Debounce map untuk mencegah spam dari user yang sama
const debounceMap = new Map()
const DEBOUNCE_TIME = 2000 // 2 detik debounce per user

async function processQueue() {
  if (isProcessing) return
  isProcessing = true

  while (queue.length > 0) {
    const job = queue.shift()
    try {
      await job.handler(job.client, job.msg)
    } catch (error) {
      logError('Queue job failed', { error: error.message, from: job.msg.from })
    }
  }

  isProcessing = false
}

function cleanupDebounce() {
  const now = Date.now()
  for (const [key, timestamp] of debounceMap.entries()) {
    if (now - timestamp > DEBOUNCE_TIME * 2) {
      debounceMap.delete(key)
    }
  }
}

function enqueue(client, msg, handler) {
  const userId = msg.from
  const now = Date.now()

  cleanupDebounce()

  if (debounceMap.has(userId)) {
    const lastTime = debounceMap.get(userId)
    if (now - lastTime < DEBOUNCE_TIME) {
      return
    }
  }
  debounceMap.set(userId, now)

  if (queue.length >= MAX_QUEUE_SIZE) {
    logError('Queue overflow', { size: queue.length })
    return
  }

  queue.push({ client, msg, handler })
  processQueue().catch(error => {
    logError('Queue processing failed', error)
  })
}

module.exports = {
  enqueue
}
