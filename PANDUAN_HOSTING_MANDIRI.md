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

## 4. BUNDEL SIAP PAKAI TANPA `npm install` (`cpanel-server.cjs` + `dist/`)

Proyek ini sudah dilengkapi bundel matang (**Zero-NPM-Install Bundle**) yang menyatukan seluruh kode server beserta *Express.js* ke dalam satu file mandiri **`cpanel-server.cjs`**, serta seluruh tampilan ke dalam folder **`dist/`**.

Anda **tidak perlu menjalankan `npm install`** di cPanel Gapurahoster! File yang wajib ada di folder aplikasi cPanel Anda hanyalah:
1. File **`cpanel-server.cjs`** (1 file server mandiri hasil bundel)
2. Folder **`dist/`** (seluruh tampilan web & PWA hasil kompilasi)
3. Folder **`data/`** (database JSON lokal — akan otomatis dibuat jika belum ada)

*(Catatan: Jika suatu hari Anda mengedit source code di laptop sendiri, cukup jalankan `npm run build:all` untuk memperbarui `dist/` dan `cpanel-server.cjs`).*

---

## 5. OPSI A: DEPLOY DI SHARED HOSTING CPANEL GAPURAHOSTER (`neo.baraka.id`) — TANPA `npm install`

### Langkah-demi-Langkah:
1. **Upload File ke Folder Domain (`neo.baraka.id`)**:
   * Buka menu **File Manager** di cPanel Gapurahoster.
   * Masuk ke folder domain Anda (misal `neo.baraka.id`).
   * Unggah dan ekstrak hasil unduhan proyek sehingga di dalam folder `neo.baraka.id` terdapat langsung:
     * **`cpanel-server.cjs`**
     * **`dist/`** (folder)
     * **`data/`** (folder, opsional)

2. **Buat / Edit Aplikasi Node.js di cPanel**:
   * Buka menu **Setup Node.js App** di cPanel.
   * Klik **Create Application** (atau klik ikon **Edit** jika sudah dibuat):
     * **Node.js version**: Pilih versi **18.x**, **20.x**, atau **22.x**.
     * **Application mode**: Pilih **Production**.
     * **Application root**: Isi folder Anda, misal `neo.baraka.id`.
     * **Application URL**: Pilih `neo.baraka.id`.
     * **Application startup file**: Ketik **`cpanel-server.cjs`** *(bukan `server.ts` atau `server.js`)*.
   * *(Opsional)* Pada bagian **Environment variables**, Anda dapat menambahkan:
     * `BARAKA_MASTER_PIN` = *(PIN darurat rahasia pemilik, misal `BARAKA-OWNER-99`)*

3. **Langsung Jalankan Tanpa `npm install`**:
   * Anda **TIDAK PERLU** mengklik tombol **Run NPM Install** karena seluruh *library* sudah dibundel di dalam `cpanel-server.cjs`.
   * Cukup klik tombol **Save** lalu klik **Restart** (atau **Start App**).
   * Buka `https://neo.baraka.id` di browser — aplikasi langsung aktif!

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
