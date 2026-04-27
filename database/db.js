const fs = require('fs')
const path = require('path')

const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json')
let transactionCache = null
let cacheTimestamp = 0
const CACHE_TTL = 60 * 1000 // Cache for 60 seconds (optimized from 5s)

function readTransactionsWithCache() {
  const now = Date.now()
  if (transactionCache && (now - cacheTimestamp) < CACHE_TTL) {
    return transactionCache
  }

  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) {
      fs.writeFileSync(TRANSACTIONS_FILE, '[]')
      transactionCache = []
    } else {
      const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf8')
      transactionCache = JSON.parse(data)
    }
    cacheTimestamp = now
    return transactionCache
  } catch (error) {
    console.error('Error reading transactions:', error)
    // Try to recreate corrupted file
    try {
      fs.writeFileSync(TRANSACTIONS_FILE, '[]')
      transactionCache = []
      cacheTimestamp = now
      console.log('Recreated corrupted transactions file')
      return transactionCache
    } catch (recoveryError) {
      console.error('Failed to recover transactions file:', recoveryError)
      return []
    }
  }
}

function readTransactions() {
  return readTransactionsWithCache()
}

function writeTransactions(transactions) {
  try {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2))
    transactionCache = transactions
    cacheTimestamp = Date.now()
  } catch (error) {
    console.error('Error writing transactions:', error)
  }
}

function getPendingTotals() {
  const transactions = readTransactions()
  return transactions
    .filter(order => order.status === 'WAITING')
    .map(order => order.total)
}

function addOrder(order) {
  const transactions = readTransactions()
  transactions.push(order)
  writeTransactions(transactions)
}

function updateOrder(invoice, updates) {
  const transactions = readTransactions()
  const index = transactions.findIndex(order => order.invoice === invoice)
  if (index !== -1) {
    transactions[index] = { ...transactions[index], ...updates }
    writeTransactions(transactions)
  }
}

function getActiveOrders() {
  const transactions = readTransactions()
  return transactions.filter(order =>
    order.status === 'WAITING' || order.status === 'ORDER_CREATED'
  )
}

function getOrder(invoice) {
  const transactions = readTransactions()
  return transactions.find(order => order.invoice === invoice)
}

module.exports = {
  getPendingTotals,
  addOrder,
  updateOrder,
  getActiveOrders,
  getOrder
}