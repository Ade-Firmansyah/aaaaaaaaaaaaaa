const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')

dayjs.extend(utc)
dayjs.extend(timezone)

const BUSINESS_START_MINUTES = 7 * 60 // 07:00
const BUSINESS_END_MINUTES = 23 * 60 + 30 // 23:30

function getJakartaNow() {
  return dayjs().tz('Asia/Jakarta')
}

function getCurrentJakartaTime() {
  return getJakartaNow().format()
}

function isBotOnline() {
  const now = getJakartaNow()
  const hour = now.hour()
  const minute = now.minute()
  const current = hour * 60 + minute

  return current >= BUSINESS_START_MINUTES && current < BUSINESS_END_MINUTES
}

function isBotOffline() {
  return !isBotOnline()
}

function getTimeStatus() {
  const now = getJakartaNow()
  const offline = isBotOffline()
  return `${now.format('HH:mm:ss')} (${offline ? 'OFFLINE' : 'ONLINE'})`
}

function getOfflineMessage() {
  const now = getJakartaNow()
  const hour = now.hour()
  let waktu

  if (hour >= 23 || hour < 4) {
    waktu = 'nanti pagi jam 07:00'
  } else if (hour >= 4 && hour < 7) {
    waktu = 'sebentar lagi jam 07:00'
  } else {
    waktu = 'jam operasional berikutnya'
  }

  return `╔═════════════════════════════╗
║   ⚠️ BOT SEDANG OFFLINE     ║
╚═════════════════════════════╝

Bot sedang tidak aktif saat ini 🌙
Jam operasional: 07:00 - 23:30 WIB

⏳ Silakan kembali ${waktu}
Terima kasih 🙏`
}

function getNextTransition() {
  const now = getJakartaNow()
  const current = now.hour() * 60 + now.minute()
  let nextTime
  let status

  if (isBotOffline()) {
    status = 'online'
    if (current >= BUSINESS_END_MINUTES) {
      nextTime = now.add(1, 'day').hour(7).minute(0).second(0).millisecond(0)
    } else {
      nextTime = now.hour(7).minute(0).second(0).millisecond(0)
    }
  } else {
    status = 'offline'
    nextTime = now.hour(23).minute(30).second(0).millisecond(0)
    if (current >= BUSINESS_END_MINUTES) {
      nextTime = nextTime.add(1, 'day')
    }
  }

  return {
    time: nextTime.format('HH:mm'),
    status
  }
}

module.exports = {
  isBotOnline,
  isBotOffline,
  getTimeStatus,
  getCurrentJakartaTime,
  getOfflineMessage,
  getNextTransition
}