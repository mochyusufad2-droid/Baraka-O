# 🚀 PANDUAN LENGKAP MIGRASI KE HOSTING MANDIRI (VPS & SHARED HOSTING)
### Aplikasi BARAKA ADVENTURE — 100% Bebas GitHub, Vercel, & Firebase

Dokumen ini adalah panduan teknis operasional resmi untuk memindahkan dan menjalankan aplikasi **BARAKA ADVENTURE** di server dan domain milik Anda sendiri.

---

## 📑 DAFTAR ISI
1. [Arsitektur Mandiri (Zero-Cloud Architecture)](#1-arsitektur-mandiri-zero-cloud-architecture)
2. [Konfigurasi Server Statis (Static File Serving)](#2-konfigurasi-server-statis-static-file-serving)
3. [Penanganan Routing: SPA Fallback & Isolasi API](#3-penanganan-routing-spa-fallback--isolasi-api)
4. [Persiapan File & Build Sebelum Deploy](#4-persiapan-file--build-sebelum-deploy)
5. [Opsi A: Deploy di Shared Hosting (cPanel / DirectAdmin)](#5-opsi-a-deploy-di-shared-hosting-cpanel--directadmin)
6. [Opsi B: Deploy di VPS (Ubuntu / Debian + Nginx + PM2)](#6-opsi-b-deploy-di-vps-ubuntu--debian--nginx--pm2)
7. [Migrasi Data 1-Klik dari AI Studio ke Server Anda](#7-migrasi-data-1-klik-dari-ai-studio-ke-server-anda)
8. [Panduan Update Fitur di Kemudian Hari](#8-panduan-update-fitur-di-kemudian-hari)
9. [Tips Troubleshooting & FAQ](#9-tips-troubleshooting--faq)

---

## 1. ARSITEKTUR MANDIRI (ZERO-CLOUD ARCHITECTURE)

Aplikasi BARAKA ADVENTURE telah dirancang menggunakan pola **Unified Full-Stack Runtime**:
* **Backend Runtime**: Menggunakan **Express.js (Node.js)** yang menangani API endpoints, validasi token organizer, kalkulasi skor, pencatatan log check-in offline, serta koordinat live tracking.
* **Database Persisten**: Disimpan dalam file flat JSON di server Anda:
  ```
  /data/baraka-db.json
  ```
  File ini dimuat ke dalam memori RAM saat aplikasi start (kecepatan akses 0,1 milidetik) dan ditulis otomatis secara atomik setiap kali ada perubahan data.
* **Mode Standalone**:
  Dengan mengatur environment variable `STANDALONE_MODE=true`, seluruh dependensi Firebase dinonaktifkan secara total. Aplikasi tidak melakukan request keluar ke Firebase, Vercel, maupun Google Cloud.
* **Keuntungan**:
  * **0 Biaya Langganan Cloud**: Tidak ada tagihan Firebase Read/Write limit harian.
  * **Kedaulatan Data 100%**: Koordinat rute rahasia, nomor BIB peserta, dan kontak darurat tersimpan di server Anda sendiri.
  * **Bebas Vendor Lock-in**: Dapat dipindahkan ke penyedia hosting mana pun dalam hitungan menit.

---

## 2. KONFIGURASI SERVER STATIS (STATIC FILE SERVING)

### A. Bagaimana Frontend Dikompilasi
Aplikasi frontend dibuat menggunakan React 19 + TypeScript + Tailwind CSS via **Vite**. Saat Anda menjalankan:
```bash
npm run build
```
Vite akan mengompilasi seluruh source code di folder `src/` menjadi aset statis murni di dalam folder `dist/`:
```
dist/
├── assets/
│   ├── index-[hash].js       # Bundel logika React (minified & tree-shaken)
│   └── index-[hash].css      # Style Tailwind CSS
├── icon.svg, manifest.json    # Konfigurasi PWA (Progressive Web App)
└── index.html                 # Single entry point HTML
```

### B. Konfigurasi Static Serving pada Express (`server.ts` / `server.js`)
Di lingkungan produksi (`NODE_ENV=production`), server Express secara otomatis menyajikan folder `dist/` dengan cache header optimal:
```javascript
import path from 'path';
import express from 'express';

const app = express();
const distPath = path.join(__dirname, 'dist');

// Sajikan folder dist sebagai file statis dengan caching browser 1 hari
app.use(express.static(distPath, {
  maxAge: '1d',
  etag: true
}));
```
File dengan fingerprint hash (seperti `assets/index-Bf92a.js`) aman di-cache oleh browser karena namanya akan otomatis berubah saat ada update kode baru.

---

## 3. PENANGANAN ROUTING: SPA FALLBACK & ISOLASI API

### A. Masalah: Mengapa SPA Membutuhkan Fallback?
Aplikasi BARAKA adalah **Single Page Application (SPA)**. Navigasi halaman (seperti membuka form peserta, dashboard organizer, atau peta spektator) diatur di sisi browser (client-side) tanpa me-reload server:
* URL peserta: `https://lomba.domainanda.com/?tab=participant` atau `/p/SESSION_ID`
* URL organizer: `https://lomba.domainanda.com/?tab=organizer`
* URL peta monitor: `https://lomba.domainanda.com/?tab=spectator`

Jika seorang pengguna me-refresh halaman browser di rute non-root, server web fisik akan mencari file fisik di disk (misalnya mencari file bernama `/p/SESSION_ID`). Karena file fisik tersebut tidak ada di disk, server biasa akan memunculkan error **404 Not Found**.

### B. Solusi: Catch-All Fallback ke `index.html`
Untuk mencegah 404, server dikonfigurasi untuk selalu mengembalikan `dist/index.html` untuk setiap rute browser yang tidak cocok dengan file fisik. Setelah `index.html` diterima, browser menjalankan JavaScript React dan me-render halaman yang tepat.

### C. Mencegah Konflik API (Penyebab Error `Unexpected token '<'`)
Jika sebuah request API (misal `/api/organizer/courses`) gagal atau salah URL, **JANGAN SAMPAI** server mengembalikan `index.html` (karena browser peserta mengharapkan format JSON, dan parsing HTML `<!doctype html>` akan memicu error `Unexpected token '<', "<!doctype "... is not valid JSON`).

Oleh karena itu, di `server.ts`, urutan routing disusun sangat ketat:
```javascript
// 1. DAFTARKAN SEMUA ROUTE API TERLEBIH DAHULU
app.use('/api', apiRouter);

// 2. ISOLASI 404 KHUSUS API (Mengembalikan JSON, BUKAN HTML!)
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `Endpoint API tidak ditemukan: ${req.method} ${req.path}`,
    timestamp: new Date().toISOString()
  });
});

// 3. SAJIKAN FILE STATIS
app.use(express.static(distPath, { maxAge: '1d' }));

// 4. CATCH-ALL ROUTE KHUSUS HALAMAN WEB SPA
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
```

---

## 4. PERSIAPAN FILE & BUILD SEBELUM DEPLOY

Lakukan langkah ini di laptop atau komputer Anda satu kali sebelum mengunggah ke hosting:

1. Buka terminal di folder project, jalankan:
   ```bash
   npm install
   npm run build:all
   ```
   *Perintah ini akan melakukan 2 hal sekaligus: mengompilasi frontend ke folder `dist/` dan mengompilasi backend ke file `server.js` siap jalan.*
2. Siapkan file-file berikut untuk di-upload (satukan dalam format `.zip`, misalnya `baraka-deploy.zip`):
   * Folder `dist/` (wajib)
   * File `server.js` (wajib - hasil build)
   * File `package.json` (wajib)
   * Folder `data/` (opsional, jika belum ada akan otomatis dibuat oleh server)
   * File `.env.example` (opsional)

> ⚠️ **Catatan Penting**: Folder `node_modules` dan folder `.git` **JANGAN dimasukkan ke zip** agar file ringan (hanya ~5-15 MB) dan cepat diunggah.

---

## 5. OPSI A: DEPLOY DI SHARED HOSTING (CPANEL / DIRECTADMIN)

Sangat cocok jika Anda sudah memiliki langganan web hosting murah seperti Niagahoster, DomaiNesia, IDWebhost, Rumahweb, Hostinger, dll.

### Syarat:
* Tersedia menu **"Setup Node.js App"** di cPanel Anda.
* SSL Aktif (Let's Encrypt / AutoSSL gratis dari cPanel).

### Langkah-demi-Langkah:
1. **Buat Aplikasi Node.js di cPanel**:
   * Login ke cPanel hosting Anda.
   * Cari dan buka menu **Setup Node.js App**.
   * Klik tombol **Create Application**:
     * **Node.js version**: Pilih versi **18.x** atau **20.x**.
     * **Application mode**: Pilih **Production**.
     * **Application root**: Isi nama folder, misal `baraka` atau `public_html/lomba`.
     * **Application URL**: Pilih subdomain atau domain utama Anda (misal `lomba.domainanda.com`).
     * **Application startup file**: Ketik `server.js`.
   * Klik tombol **Create**.

2. **Upload dan Ekstrak File**:
   * Buka menu **File Manager** di cPanel.
   * Masuk ke folder aplikasi yang Anda tentukan tadi (misal folder `baraka`).
   * Klik tombol **Upload**, lalu pilih file `baraka-deploy.zip`.
   * Setelah selesai, klik kanan file zip lalu pilih **Extract**.

3. **Install Dependencies di cPanel**:
   * Kembali ke menu **Setup Node.js App**.
   * Klik ikon pensil (Edit) pada aplikasi Anda.
   * Klik tombol **Run NPM Install**. Tunggu sekitar 1-2 menit hingga statusnya selesai.

4. **Konfigurasi Environment Variables**:
   * Di halaman edit Node.js App cPanel, scroll ke bawah ke bagian **Environment variables**.
   * Klik **Add Variable**, tambahkan:
     * `STANDALONE_MODE` = `true`
     * `NODE_ENV` = `production`
   * Klik **Save**.

5. **Penanganan Routing Otomatis via `.htaccess`**:
   cPanel Node.js selector secara otomatis membuat file `.htaccess` yang mengarahkan semua traffic domain ke Passenger Node.js socket.
   Jika Anda menggunakan konfigurasi manual, isi file `.htaccess` di root domain Anda adalah:
   ```apache
   # DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN
   PassengerAppRoot "/home/username/baraka"
   PassengerBaseURI "/"
   PassengerNodejs "/home/username/nodevenv/baraka/20/bin/node"
   PassengerAppType node
   PassengerStartupFile server.js
   # DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END
   ```

6. **Mulai Ulang (Restart)**:
   * Klik tombol **Restart Application**.
   * Buka browser Anda di `https://lomba.domainanda.com`.
   * Aplikasi Anda sudah aktif dan siap digunakan!

---

## 6. OPSI B: DEPLOY DI VPS (UBUNTU / DEBIAN + NGINX + PM2)

Direkomendasikan untuk event besar (500+ peserta) untuk stabilitas tinggi dan kontrol performa maksimal.

### Langkah 1: Persiapan Server VPS
Login ke VPS Anda via SSH:
```bash
ssh root@IP_VPS_ANDA
```
Install Node.js 20 LTS, Nginx, dan PM2:
```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# Install PM2 (Process Manager agar aplikasi auto-restart 24 jam)
sudo npm install -g pm2
```

### Langkah 2: Setup Direktori Aplikasi
```bash
sudo mkdir -p /var/www/baraka
sudo chown -R $USER:$USER /var/www/baraka
cd /var/www/baraka
```
Upload file zip Anda ke folder ini (bisa via FileZilla SFTP atau `scp baraka-deploy.zip root@IP_VPS:/var/www/baraka/`), lalu ekstrak:
```bash
unzip baraka-deploy.zip
npm install --omit=dev
```

### Langkah 3: Jalankan Aplikasi dengan PM2
```bash
NODE_ENV=production STANDALONE_MODE=true PORT=3000 pm2 start server.js --name "baraka"
pm2 save
pm2 startup
```
*(Perintah `pm2 startup` & `pm2 save` memastikan aplikasi otomatis hidup kembali jika VPS di-restart).*

### Langkah 4: Konfigurasi Nginx (Static Caching + Reverse Proxy + SPA Fallback)
Buat file konfigurasi Nginx:
```bash
sudo nano /etc/nginx/sites-available/baraka
```
Salin dan tempel konfigurasi berikut (ganti `lomba.domainanda.com` dengan domain Anda):
```nginx
server {
    listen 80;
    server_name lomba.domainanda.com;

    # Batas ukuran upload foto bukti laporan checkpoint (15MB)
    client_max_body_size 15M;

    # Gzip Compression untuk menghemat bandwidth HP peserta
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    # OPSI ASET STATIS: Dilayani langsung oleh Nginx untuk kecepatan maksimal
    location /assets/ {
        alias /var/www/baraka/dist/assets/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }

    # API & ROUTING UTAMA: Diteruskan ke Express Node.js di port 3000
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Aktifkan konfigurasi dan test Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/baraka /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Langkah 5: Pasang SSL Gratis (Wajib HTTPS untuk Kamera & GPS)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d lomba.domainanda.com
```
*Pilih opsi redirect HTTP to HTTPS (otomatis dilakukan oleh certbot).*

---

## 7. MIGRASI DATA 1-KLIK DARI AI STUDIO KE SERVER ANDA

Anda **tidak perlu memasukkan ulang** Course yang sudah dirancang atau daftar peserta:

1. **Unduh Data dari Versi AI Studio**:
   * Buka Dashboard Organizer di preview AI Studio saat ini.
   * Masuk sebagai Superadmin (PIN: `123456`).
   * Buka Tab **Kelola Akun Organizer & Pengaturan**.
   * Cari kartu **Pencadangan & Pemulihan Database Penuh**.
   * Klik tombol **Download Full Database (.json)**.
   * File JSON bernama `baraka-full-database-[TANGGAL].json` akan terunduh ke laptop Anda.

2. **Pulihkan ke Server Hosting Baru**:
   * Buka alamat domain hosting baru Anda (misal `https://lomba.domainanda.com`).
   * Login sebagai Superadmin.
   * Masuk ke Tab **Kelola Akun Organizer & Pengaturan**.
   * Klik tombol **Upload & Pulihkan Database (.json)** dan pilih file yang tadi diunduh.
   * Sistem akan menampilkan verifikasi ringkasan (jumlah Course, peserta, sesi, dan pos).
   * Klik tombol hijau: **"Ya, Pulihkan Database Sekarang"**.
   * Dalam 1 detik, seluruh data rute, koordinat, dan akun panitia langsung aktif di server pribadi Anda!

---

## 8. PANDUAN UPDATE FITUR DI KEMUDIAN HARI

Jika di masa mendatang Anda ingin memperbarui fitur aplikasi:

1. **Backup Data**:
   Selalu klik **Download Full Database (.json)** terlebih dahulu sebagai cadangan aman di laptop Anda.
2. **Build Versi Baru di Komputer**:
   Jalankan `npm run build:all`.
3. **Upload & Timpa (Overwrite)**:
   Upload folder `dist/` dan file `server.js` baru ke hosting Anda, menimpa file yang lama.
4. **PENTING — JANGAN HAPUS DATABASE**:
   Folder `/data/` dan file `/data/baraka-db.json` di hosting Anda **JANGAN DIHAPUS**. File ini berisi data hidup perlombaan Anda.
5. **Restart Server**:
   * Di cPanel: Klik tombol **Restart**.
   * Di VPS: Jalankan `pm2 restart baraka`.
6. Fitur baru langsung aktif tanpa menghapus satu pun data peserta!

---

## 9. TIPS TROUBLESHOOTING & FAQ

### Q1: Mengapa muncul error "Kamera tidak dapat diakses" saat scan QR di HP?
* **Penyebab**: Web diakses melalui `http://` (tidak aman).
* **Solusi**: Pastikan SSL aktif dan selalu buka via `https://lomba.domainanda.com`. Kebijakan keamanan browser Google Chrome dan Apple Safari memblokir kamera jika bukan HTTPS.

### Q2: Mengapa muncul error "Unexpected token '<', '<!doctype...'"?
* **Penyebab**: Request API memanggil endpoint yang salah, dan server yang lama mengembalikan halaman HTML `index.html`.
* **Solusi**: Di versi terbaru yang Anda miliki sekarang, Express telah dilengkapi API 404 Guard yang selalu mengembalikan JSON error, sehingga bug ini tidak akan pernah terjadi lagi.

### Q3: Bagaimana cara membuat backup otomatis di VPS?
Anda dapat menambahkan cronjob di VPS untuk backup otomatis setiap malam ke folder backup:
```bash
# Buka crontab
crontab -e

# Tambahkan baris ini (backup setiap jam 02:00 malam):
0 2 * * * cp /var/www/baraka/data/baraka-db.json /var/backups/baraka-$(date +\%Y\%m\%d).json
```

---
*Dokumen ini dibuat secara spesifik untuk arsitektur mandiri BARAKA ADVENTURE. Sistem siap dijalankan kapan saja di infrastruktur pilihan Anda!*
