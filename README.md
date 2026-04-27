# 🤖 WhatsApp Bot Premiumin Plus

Bot WhatsApp otomatis untuk jual akun premium (auto stok, auto pembayaran, auto kirim akun).

---

## 🚀 INSTALL (DARI 0)

### 1. Clone / Download Project

```bash
git clone https://github.com/Ade-Firmansyah/aaaaaaaaaaaaaa.git
cd wa-bot-premium
```

---

### 2. Install Dependency

```bash
npm install
```

---

### 3. Setup ENV

Buat file `.env`

**Opsi 1: Menggunakan API Key Langsung (Direkomendasikan untuk Pemula)**

```env
API_KEY=ISI_API_PREMKU_KAMU
```

**Opsi 2: Menggunakan API Key Terenkripsi (Lebih Aman)**

Untuk keamanan tambahan, Anda dapat menggunakan API key yang dienkripsi. Jalankan script berikut untuk menghasilkan `CRYPTO_SECRET` dan `ENCRYPTED_API_KEY`:

```bash
node -e "
const crypto = require('crypto');
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
function deriveKey(secret) { return crypto.createHash('sha256').update(String(secret)).digest(); }
function encrypt(text, secret) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return \`\${iv.toString('base64')}:\${encrypted.toString('base64')}\`;
}
const CRYPTO_SECRET = crypto.randomBytes(32).toString('hex');
const API_KEY = 'ISI_API_PREMKU_KAMU'; // Ganti dengan API key Anda
const ENCRYPTED_API_KEY = encrypt(API_KEY, CRYPTO_SECRET);
console.log('CRYPTO_SECRET=' + CRYPTO_SECRET);
console.log('ENCRYPTED_API_KEY=' + ENCRYPTED_API_KEY);
"
```

Kemudian tambahkan ke `.env`:

```env
CRYPTO_SECRET=GENERATED_CRYPTO_SECRET_HERE
ENCRYPTED_API_KEY=GENERATED_ENCRYPTED_API_KEY_HERE
```

**Validasi Setup ENV:**

Jalankan bot dan periksa log. Jika berhasil, Anda akan melihat pesan "injected env" tanpa warning error dekripsi.

---

### 4. Jalankan Bot

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

**Dengan PM2 (Recommended untuk 24/7):**
```bash
npm run start:pm2
```

Scan QR → selesai ✅

---

## 🚂 DEPLOY KE RAILWAY

### 1. Fork Repository

Fork repository ini ke akun GitHub kamu.

### 2. Connect ke Railway

1. Buka [Railway.app](https://railway.app)
2. Login dengan GitHub
3. Klik "New Project"
4. Pilih "Deploy from GitHub repo"
5. Cari dan pilih repository yang sudah di-fork

### 3. Setup Environment Variables

Di Railway dashboard, pergi ke "Variables" dan tambahkan:

```
API_KEY=ISI_API_PREMKU_KAMU
```

### 4. Deploy

Klik "Deploy" dan tunggu proses selesai.

### 5. Setup WhatsApp Login

Setelah deploy selesai, akses domain Railway kamu:

- **Health Check**: `https://your-app.railway.app/health`
- **QR Code Login**: `https://your-app.railway.app/qr` atau `https://your-app.railway.app/`

Buka link QR login di browser, scan QR code dengan WhatsApp untuk login.

---

## ⏰ SCHEDULED OFFLINE MODE

Bot otomatis **OFFLINE** setiap hari **23:30 - 07:00** (WIB)

### ✅ FITUR OFFLINE

* **Auto Blocking**: Semua transaksi (buy, cancel, status, gabung) ditolak
* **Essential Commands**: ping, menu, help, admin tetap aktif
* **User Feedback**: Pesan offline yang jelas dan informatif
* **Service Protection**: API calls di-block di service layer
* **Logging**: Monitor offline status setiap menit

### 📱 OFFLINE RESPONSE

```
╔═════════════════════════════╗
║   ⚠️ BOT SEDANG OFFLINE      ║
╚═════════════════════════════╝

Bot sedang tidak aktif saat ini 🌙
Jam operasional: 07:00 - 23:30

⏳ Silakan kembali lagi pagi nanti
Terima kasih 🙏

💬 Jika butuh segera, hubungi admin langsung
   Transaksi bisa dilakukan manual jika admin belum tidur
```

### 🛡️ PROTECTION LAYER

1. **Message Handler**: Block transaction commands
2. **Command Handlers**: Offline checks di setiap transaction handler
3. **Service Layer**: Payment & Premku API calls di-block
4. **Order Processing**: Fulfillment di-stop saat offline

### 📊 MONITORING

* Console log setiap menit: `[OFFLINE MODE] 09:22:37 (ONLINE)`
* Block logging: `[BLOCKED] Buy command blocked during offline mode`
* Health check: `/health` shows offline status

---

### Command Yang Tersedia:

- `menu` atau `help` - Tampilkan menu
- `stok` - Lihat daftar produk
- `buy <id>` - Beli produk (contoh: `buy 1`)
- `status <invoice>` - Cek status pembayaran
- `cancel <invoice>` - Batalkan pembayaran

### Contoh Penggunaan:

```
stok
buy 1
status INV-123456789
```

---

## 🔧 TROUBLESHOOTING

### API Key Tidak Ditemukan

Pastikan environment variable `API_KEY` sudah di-set dengan benar di Railway.

### Bot Tidak Merespons

1. Cek apakah bot sudah login WhatsApp via `/qr`
2. Pastikan command yang dikirim sesuai format
3. Cek logs di Railway dashboard

### QR Code Tidak Muncul

1. Bot mungkin sudah terautentikasi
2. Restart aplikasi di Railway
3. Cek logs untuk error

---

## 📊 MONITORING

- **Health Check**: `https://your-app.railway.app/health`
- **Logs**: Cek di Railway dashboard
- **Status**: Bot akan memberikan feedback otomatis

---

## ⚠️ CATATAN PENTING

- Bot menggunakan mode "senior" - hanya merespons command yang valid
- Pastikan API key Premku valid dan memiliki saldo
- Bot akan otomatis mengirim akun setelah pembayaran berhasil
- Gunakan command yang benar sesuai format di atas

## 📌 COMMAND USER

* `ping / p / cek` → test bot
* `menu` → menu utama
* `stok` → lihat produk
* `buy [id]` → beli produk
* `status [invoice]` → cek status pembayaran
* `cancel [invoice]` → batalkan pembayaran

Contoh:

```bash
buy 1
```

---

## 💳 FLOW PEMBELIAN

1. User ketik `buy`
2. Bot generate harga + kode unik
3. Bot kirim QRIS
4. User bayar
5. Bot auto cek pembayaran
6. Bot auto order ke Premku
7. Bot kirim akun ke user

---

## 🔐 KEAMANAN

JANGAN upload:

* `.env`
* `sessions/`
* `node_modules/`

---

## ⚙️ LIBRARY

* whatsapp-web.js
* dotenv
* qrcode-terminal

Install manual:

```bash
npm install whatsapp-web.js dotenv qrcode-terminal
```

---

## 🧠 FITUR

✔ Auto stok dari Premku
✔ Auto generate pembayaran
✔ Auto cek pembayaran
✔ Auto kirim akun
✔ Anti duplicate transaksi

---

## ⚠️ NOTE

* QR kadang delay → normal
* Pastikan API_KEY benar
* Gunakan Node.js v18+

---

## 🔥 NEXT

Upgrade:

* Auto cancel 5 menit
* UI premium
* Multi API provider
* Deploy VPS 24 jam

---

## ⚡ OPTIMASI UNTUK PRODUCTION (Ubuntu/VPS)

### Memory Optimization
Bot sudah dioptimasi untuk penggunaan RAM minimal:
- GC otomatis setiap 60 detik
- Cache cleanup otomatis
- Debounce message untuk anti-spam
- Queue limit 50 messages

### PM2 Production Setup
```bash
# Install PM2 globally
npm install -g pm2

# Start dengan PM2
npm run start:pm2

# Monitor
npm run pm2:monit

# Logs
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

### Ubuntu Server Tuning
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y chromium-browser nodejs npm

# Optimize untuk headless
echo "kernel.core_pattern=|/bin/false" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Disable swap (opsional, untuk memory dedicated)
sudo swapoff -a
```

### Railway Deployment
Bot sudah teroptimasi untuk Railway:
- QR code via HTTP server
- Auto reconnect
- Memory limit 300MB
- Production logging

### Performance Tips
- Bot menggunakan single process untuk stability
- Puppeteer args dioptimasi untuk low memory
- API responses di-cache 30 detik
- Logging dikurangi di production

🚀 Bot siap dipakai jualan otomatis

---

## 🚂 DEPLOY KE RAILWAY

### Prasyarat:
* GitHub account
* Railway account (https://railway.app)
* Git installed

### Langkah Deploy:

1. **Push ke GitHub:**
```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

2. **Login ke Railway dan Buat Project:**
   - Buka https://railway.app
   - Klik "Create New Project"
   - Pilih "Deploy from GitHub"
   - Pilih repository ini

3. **Set Environment Variables di Railway:**
   - Di Railway dashboard → Variables
   - Tambahkan:
     - `API_KEY`: (API key dari Premku)
     - `CRYPTO_SECRET`: (dari .env)
     - `ENCRYPTED_API_KEY`: (dari .env, jika menggunakan enkripsi)
     - `PORT`: (Railway akan auto-set, default 3000)

4. **Deploy:**
   - Railway akan auto-deploy saat ada push ke GitHub
   - Tunggu hingga status "UP"
   - Akses QR via public URL yang diberikan Railway

### Testing Deployment:
- Railway akan menampilkan URL publik saat deployment selesai
- Buka URL untuk melihat halaman QR WhatsApp
- Scan dengan WhatsApp mobile Anda
- Bot siap menerima pesan

### Troubleshooting:
- Jika QR tidak muncul: tunggu beberapa detik, refresh halaman
- Jika bot disconnect: Railway akan auto-restart
- Check logs di Railway dashboard untuk error details

---
