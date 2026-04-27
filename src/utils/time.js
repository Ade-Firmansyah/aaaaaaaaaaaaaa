/**
 * Time utility functions for scheduled offline mode
 * Bot offline schedule: 23:30 - 07:00 (Asia/Jakarta timezone)
 */

/**
 * Check if bot is currently in offline/maintenance mode
 * @returns {boolean} true if bot should be offline
 */
function isBotOffline() {
  const now = new Date()

  // Get current time in minutes since midnight
  const hour = now.getHours()
  const minute = now.getMinutes()
  const current = hour * 60 + minute

  // Offline window: 23:30 to 07:00
  const start = 23 * 60 + 30 // 23:30
  const end = 7 * 60         // 07:00

  // Handle crossing midnight: current >= start OR current < end
  return current >= start || current < end
}

/**
 * Get current time status for logging
 * @returns {string} formatted time status
 */
function getTimeStatus() {
  const now = new Date()
  const timeString = now.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false
  })
  const offline = isBotOffline()
  return `${timeString} (${offline ? 'OFFLINE' : 'ONLINE'})`
}

/**
 * Get next online/offline time for user feedback
 * @returns {object} next transition info
 */
function getNextTransition() {
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()

  let nextTime, status
  if (isBotOffline()) {
    // Currently offline, next online at 07:00
    nextTime = new Date(now)
    nextTime.setHours(7, 0, 0, 0)
    if (current >= 23 * 60 + 30) {
      // After midnight, next online is tomorrow
      nextTime.setDate(nextTime.getDate() + 1)
    }
    status = 'online'
  } else {
    // Currently online, next offline at 23:30
    nextTime = new Date(now)
    nextTime.setHours(23, 30, 0, 0)
    status = 'offline'
  }

  return {
    time: nextTime.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false
    }),
    status
  }
}

module.exports = {
  isBotOffline,
  getTimeStatus,
  getNextTransition
}