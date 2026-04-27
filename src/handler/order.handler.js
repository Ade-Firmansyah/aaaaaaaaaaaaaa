const { API_KEY } = require('../config')
const payment = require('../service/payment.service')
const premku = require('../service/premku.service')
const db = require('../../database/db')
const { logInfo, logError } = require('../utils/logger')
const { formatCurrency } = require('../utils/format')
const { isBotOffline } = require('../utils/time')

let isProcessingOrders = false
let isExpiringOrders = false

async function processPendingOrders(client) {
  if (isProcessingOrders) return
  isProcessingOrders = true

  try {
    const orders = db.getActiveOrders()
    if (!orders.length) return

    for (const order of orders) {
      try {
        // Skip orders that are already being processed
        if (order.status === 'ORDER_CREATED') {
          continue
        }

        const paymentStatus = await payment.checkDeposit(API_KEY, order.invoice_pay)

        // Handle API errors
        if (!paymentStatus.success) {
          logError('Payment API error', {
            invoice: order.invoice,
            pay_invoice: order.invoice_pay,
            message: paymentStatus.message,
            fullResponse: paymentStatus
          })
          continue // Skip this order, try again later
        }

        const status = paymentStatus.data?.status || paymentStatus.status || ''
        logInfo('Checking payment status', {
          invoice: order.invoice,
          pay_invoice: order.invoice_pay,
          status,
          message: paymentStatus.message
        })

        if (status === 'success') {
          await fulfillOrder(client, order)
        } else if (status === 'expired' || status === 'failed' || status === 'canceled') {
          db.updateOrder(order.invoice, { status: 'EXPIRED' })
          await client.sendMessage(order.user, `❌ Pembayaran ${order.invoice} ${status === 'expired' ? 'kedaluwarsa' : status === 'failed' ? 'gagal' : 'dibatalkan'}. Silakan buat ulang jika masih ingin membeli.`)
          logInfo('Payment failed/expired', { invoice: order.invoice, status })
        } else if (status === 'pending') {
          // Payment still pending, continue waiting
          logInfo('Payment still pending, will check again later', { invoice: order.invoice })
          // Don't update status, keep waiting
        } else {
          logError('Unknown payment status', { invoice: order.invoice, status, fullResponse: paymentStatus })
        }
      } catch (error) {
        logError('Payment check failed', {
          invoice: order.invoice,
          error: error.message,
          stack: error.stack
        })
      }
    }
  } catch (error) {
    logError('Process pending orders failed', {
      error: error.message,
      stack: error.stack
    })
  } finally {
    isProcessingOrders = false
  }
}

async function fulfillOrder(client, order) {
  // Check offline mode
  if (isBotOffline()) {
    console.log(`[BLOCKED] Order fulfillment blocked during offline mode: ${order.invoice}`)
    return
  }

  const existing = db.getOrder(order.invoice)
  if (!existing || existing.status !== 'WAITING') {
    return
  }

  try {
    // Step 1: Create order via Premku API with retry
    let orderResponse
    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      try {
        orderResponse = await premku.createOrder(API_KEY, order.product_id, 1, order.invoice)
        if (orderResponse.success) {
          break // Success, exit retry loop
        } else {
          logError('Premku order creation failed, will retry', {
            invoice: order.invoice,
            attempt: retryCount + 1,
            response: orderResponse
          })
        }
      } catch (error) {
        logError('Premku order creation error, will retry', {
          invoice: order.invoice,
          attempt: retryCount + 1,
          error: error.message
        })
      }

      retryCount++
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)) // Exponential backoff
      }
    }

    if (!orderResponse || !orderResponse.success) {
      logError('Premku order creation failed after all retries', {
        invoice: order.invoice,
        finalResponse: orderResponse
      })
      await client.sendMessage(order.user, `❌ Gagal memproses pesanan ${order.invoice}. Silakan hubungi admin atau coba lagi nanti.`)
      return
    }

    // Update order with Premku invoice
    db.updateOrder(order.invoice, {
      premku_invoice: orderResponse.invoice,
      status: 'ORDER_CREATED'
    })

    logInfo('Order created in Premku', {
      invoice: order.invoice,
      premku_invoice: orderResponse.invoice
    })

    // Step 2: Check order status until ready (with retry logic)
    await checkOrderStatusUntilReady(client, order.invoice, orderResponse.invoice, order)

  } catch (error) {
    logError('Fulfill order failed', {
      invoice: order.invoice,
      error: error.message,
      stack: error.stack
    })

    // Send error message to user
    try {
      await client.sendMessage(order.user, `❌ Terjadi kesalahan saat memproses pesanan ${order.invoice}. Silakan hubungi admin.`)
    } catch (msgError) {
      logError('Failed to send error message', { invoice: order.invoice, error: msgError.message })
    }
  }
}

async function checkOrderStatusUntilReady(client, localInvoice, premkuInvoice, order, attempts = 0) {
  const MAX_ATTEMPTS = 20 // Check for up to ~5 minutes (20 * 15s)
  const CHECK_INTERVAL = 15000 // 15 seconds

  if (attempts >= MAX_ATTEMPTS) {
    logError('Order status check timeout', { invoice: localInvoice, premku_invoice: premkuInvoice })
    await client.sendMessage(order.user, `⏳ Pesanan ${localInvoice} sedang diproses. Jika belum menerima akun dalam 10 menit, hubungi admin.`)
    return
  }

  try {
    const statusResponse = await premku.checkOrder(API_KEY, premkuInvoice)

    if (statusResponse.success && statusResponse.status === 'success' &&
        Array.isArray(statusResponse.accounts) && statusResponse.accounts.length > 0) {

      // Order is ready, send account data
      await sendAccountData(client, localInvoice, order, statusResponse.accounts[0])
      return
    }

    // Order not ready yet, schedule next check
    logInfo('Order not ready yet, will check again', {
      invoice: localInvoice,
      premku_invoice: premkuInvoice,
      status: statusResponse.status,
      attempt: attempts + 1
    })

    setTimeout(() => {
      checkOrderStatusUntilReady(client, localInvoice, premkuInvoice, order, attempts + 1)
    }, CHECK_INTERVAL)

  } catch (error) {
    logError('Order status check failed', {
      invoice: localInvoice,
      premku_invoice: premkuInvoice,
      error: error.message,
      attempt: attempts + 1
    })

    // Retry after error
    setTimeout(() => {
      checkOrderStatusUntilReady(client, localInvoice, premkuInvoice, order, attempts + 1)
    }, CHECK_INTERVAL)
  }
}

async function sendAccountData(client, invoice, order, account) {
  try {
    // Delete QR message if exists
    if (order.qr_message_id && typeof client.deleteMessage === 'function') {
      await client.deleteMessage(order.user, order.qr_message_id, false)
    }
  } catch (deleteError) {
    logError('Failed to remove QR message', {
      invoice: invoice,
      error: deleteError.message
    })
  }

  // Parse password and notes
  const [password, ...noteParts] = (account.password || '').split(' - ')
  const note = noteParts.filter(Boolean).join(' - ')

  const successMessage =
`✅ *PEMBAYARAN BERHASIL*\n\n📦 Produk: *${order.product_name}*\n💰 Total: Rp *${formatCurrency(order.total)}*\n\n📧 Username: ${account.username}\n🔑 Password: ${password || '-'}\n${note ? `\n📝 Catatan: ${note}` : ''}\n\n📄 Invoice: *${invoice}*\n\nTerima kasih telah menggunakan *Premiumin Plus* 🚀`

  try {
    await client.sendMessage(order.user, successMessage)
    db.updateOrder(invoice, { status: 'SUCCESS' })
    logInfo('Order fulfilled successfully', { invoice: invoice })
  } catch (sendError) {
    logError('Failed to send success message', {
      invoice: invoice,
      error: sendError.message
    })
    // Still mark as success since account was delivered
    db.updateOrder(invoice, { status: 'SUCCESS' })
  }
}

async function checkStuckPayments(client) {
  try {
    const orders = db.getActiveOrders()
    const now = Date.now()

    for (const order of orders) {
      // Only check orders that are still waiting for payment
      if (order.status !== 'WAITING') {
        continue
      }

      const ageMinutes = (now - order.created_at) / (1000 * 60)

      // Force check payments that are stuck for more than 7 minutes
      if (ageMinutes > 7) {
        try {
          logInfo('Force checking stuck payment', { invoice: order.invoice, ageMinutes })
          const paymentStatus = await payment.checkDeposit(API_KEY, order.invoice_pay)

          if (paymentStatus.success) {
            const status = paymentStatus.data?.status || paymentStatus.status || ''
            logInfo('Stuck payment status update', {
              invoice: order.invoice,
              pay_invoice: order.invoice_pay,
              status,
              wasStuck: true
            })

            // If payment is actually successful, process it
            if (status === 'success') {
              await fulfillOrder(client, order)
            }
          }
        } catch (error) {
          logError('Failed to check stuck payment', {
            invoice: order.invoice,
            pay_invoice: order.invoice_pay,
            error: error.message
          })
        }
      }
    }
  } catch (error) {
    logError('Stuck payment checker failed', error)
  }
}

async function expireOldOrders(client) {
  if (isExpiringOrders) return
  isExpiringOrders = true
  try {
    const orders = db.getActiveOrders()
    const now = Date.now()

    for (const order of orders) {
      // Don't expire orders that are already being processed
      if (order.status === 'ORDER_CREATED') {
        continue
      }

      const ageMinutes = (now - order.created_at) / (1000 * 60)

      if (ageMinutes > 15) { // 15 minutes total timeout
        // Try to cancel payment first
        try {
          const cancelResult = await payment.cancelDeposit(API_KEY, order.invoice_pay)
          logInfo('Payment cancelled due to timeout', {
            invoice: order.invoice,
            pay_invoice: order.invoice_pay,
            cancelResult
          })
        } catch (cancelError) {
          logError('Failed to cancel payment', {
            invoice: order.invoice,
            pay_invoice: order.invoice_pay,
            error: cancelError.message
          })
        }

        db.updateOrder(order.invoice, { status: 'EXPIRED' })
        await client.sendMessage(order.user, `⏳ Waktu pembayaran untuk ${order.invoice} telah berakhir (15 menit). Pembayaran otomatis dibatalkan. Silakan buat kembali jika masih ingin membeli.`)
        logInfo('Order expired due timeout', { invoice: order.invoice, ageMinutes })
      } else if (ageMinutes > 10) { // Warning at 10 minutes
        await client.sendMessage(order.user, `⚠️ Pembayaran ${order.invoice} akan kedaluwarsa dalam ${Math.ceil(15 - ageMinutes)} menit lagi. Segera selesaikan pembayaran QRIS Anda.`)
      }
    }
  } catch (error) {
    logError('Order expiration failed', error)
  } finally {
    isExpiringOrders = false
  }
}

const WATCH_INTERVAL_MS = 30 * 1000
const EXPIRATION_CHECK_MS = 90 * 1000
const STUCK_CHECK_MS = 5 * 60 * 1000

let watcherTimer = null
let watcherRunning = false
let lastExpirationCheck = 0
let lastStuckCheck = 0

function scheduleWatcher(client) {
  if (!watcherRunning) return

  watcherTimer = setTimeout(async () => {
    try {
      await processPendingOrders(client)
      const now = Date.now()

      if (now - lastExpirationCheck >= EXPIRATION_CHECK_MS) {
        await expireOldOrders(client)
        lastExpirationCheck = now
      }

      if (now - lastStuckCheck >= STUCK_CHECK_MS) {
        await checkStuckPayments(client)
        lastStuckCheck = now
      }
    } catch (error) {
      logError('Order watcher tick failed', error)
    } finally {
      scheduleWatcher(client)
    }
  }, WATCH_INTERVAL_MS)
}

const orderWatcher = {
  start(client) {
    if (watcherRunning) return
    watcherRunning = true
    lastExpirationCheck = 0
    lastStuckCheck = 0
    logInfo('Order watcher started')
    scheduleWatcher(client)
  },

  stop() {
    watcherRunning = false
    if (watcherTimer) {
      clearTimeout(watcherTimer)
      watcherTimer = null
    }
    logInfo('Order watcher stopped')
  }
}

module.exports = {
  orderWatcher,
  startOrderWatcher: orderWatcher.start,
  stopOrderWatcher: orderWatcher.stop
}
