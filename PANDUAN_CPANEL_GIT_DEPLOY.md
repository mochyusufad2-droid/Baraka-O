# 🚀 PANDUAN TEKNIS DEPLOY KE CPANEL DENGAN GIT & NODE.JS
### Aplikasi BARAKA ADVENTURE (React SPA + Express Standalone)

Panduan teknis ini berisi instruksi lengkap untuk melakukan deployment aplikasi **BARAKA ADVENTURE** ke shared hosting berbasis **cPanel** (seperti Gapurahoster, Niagahoster, DomaiNesia, dll.) yang memiliki fasilitas **Node.js** dan **Git Version Control**.

---

## 📑 DAFTAR ISI
1. [Arsitektur Deployment di cPanel](#1-arsitektur-deployment-di-cpanel)
2. [Instruksi Menjalankan Build Secara Mandiri](#2-instruksi-menjalankan-build-secara-mandiri)
3. [Panduan Setup 'Deployment from Git' di cPanel](#3-panduan-setup-deployment-from-git-di-cpanel)
4. [Konfigurasi File .cpanel.yml (Auto-Deploy & Auto-Restart)](#4-konfigurasi-file-cpanelyml-auto-deploy--auto-restart)
5. [Konfigurasi File .htaccess (Anti Error 404 & Wajib HTTPS)](#5-konfigurasi-file-htaccess-anti-error-404--wajib-https)
6. [Setup Aplikasi di Menu 'Setup Node.js App' cPanel](#6-setup-aplikasi-di-menu-setup-nodejs-app-cpanel)
7. [Alur Kerja Update Berkala (Cukup 1 Baris Perintah)](#7-alur-kerja-update-berkala-cukup-1-baris-perintah)
8. [Checklist Verifikasi Paska-Deploy](#8-checklist-verifikasi-paska-deploy)

---

## 1. ARSITEKTUR DEPLOYMENT DI CPANEL

Di lingkungan shared hosting cPanel:
* **Node.js App Selector**: Menggunakan modul **Phusion Passenger / CloudLinux** untuk mengelola siklus hidup proses Node.js (`server.js`).
* **Git Version Control**: Berfungsi sebagai server Git mandiri (remote repository) tanpa perlu akun GitHub publik.
* **Unified SPA + Backend**:
  * Folder `dist/` berisi antarmuka peserta dan panitia hasil kompilasi React.
  * File `server.js` mengelola validasi pos, kalkulasi skor, live GPS tracking, dan penyajian file statis.
  * File database persisten otomatis disimpan di `/data/baraka-db.json`.

---

## 2. INSTRUKSI MENJALANKAN BUILD SECARA MANDIRI

### Mengapa Proses Build Dilakukan di Laptop?
Shared hosting menerapkan batas kuota memori (*CloudLinux LVE RAM Limit*, biasanya 1–2 GB). Proses kompilasi Vite (`vite build`) dan bundling esbuild dapat memakan lonjakan RAM tinggi sesaat. Menjalankan build di laptop menjamin proses 100% lancar dan server hosting tetap stabil.

### Langkah Build di Laptop:
1. Buka terminal di folder proyek BARAKA di laptop Anda.
2. Pastikan dependensi terpasang:
   ```bash
   npm install
   ```
3. Jalankan perintah kompilasi mandiri:
   ```bash
   npm run build:all
   ```
4. **Output yang Dihasilkan**:
   * **`dist/`**: Berisi aset frontend terkompresi (`index.html`, `assets/index-[hash].js`, `assets/index-[hash].css`, icon PWA).
   * **`server.js`**: Berkas backend Express tunggal yang siap dieksekusi oleh Node.js cPanel tanpa butuh compiler TypeScript lagi.

---

## 3. PANDUAN SETUP 'DEPLOYMENT FROM GIT' DI CPANEL

### A. Buat Git Repository di cPanel
1. Login ke akun **cPanel** Anda.
2. Buka menu **Git™ Version Control** (di kelompok menu *Files*).
3. Klik tombol biru **Create**.
4. Atur konfigurasi berikut:
   * **Clone a Repository**: Matikan toggle ini (posisi **OFF**), karena kita membuat repository baru di server Anda sendiri, bukan mengambil dari GitHub.
   * **Repository Path**: Isi folder untuk menyimpan repo Git, misalnya: `repositories/baraka.git` (folder ini otomatis berada di luar `public_html` sehingga aman).
   * **Repository Name**: Ketik `baraka`.
5. Klik **Create**.

### B. Dapatkan URL Remote Git SSH
Setelah dibuat, cPanel akan menampilkan baris **Clone URL**. Formatnya seperti:
```text
ssh://usercpanel@namadomain.com:PORT/home/usercpanel/repositories/baraka.git
```
*(Catatan: Jika provider menggunakan port non-standar, port akan otomatis tercantum, misal `:2222` atau `:64000`)*.

### C. Sambungkan Git Laptop ke Git cPanel
Di terminal laptop Anda pada folder proyek:
1. Inisialisasi git (jika belum):
   ```bash
   git init
   git branch -M main
   ```
2. Daftarkan repository cPanel sebagai remote bernama `cpanel`:
   ```bash
   git remote add cpanel ssh://usercpanel@namadomain.com:PORT/home/usercpanel/repositories/baraka.git
   ```
3. Masukkan SSH Key laptop Anda ke menu **SSH Access** di cPanel agar proses *push* tidak meminta password setiap saat (opsional namun sangat disarankan).

---

## 4. KONFIGURASI FILE `.cpanel.yml` (AUTO-DEPLOY & AUTO-RESTART)

File `.cpanel.yml` bertindak sebagai *deployer hook* otomatis. Setiap kali Anda melakukan `git push`, cPanel otomatis menyalin file ke folder kerja aplikasi dan me-restart server Node.js.

Pastikan file `.cpanel.yml` ada di root folder proyek:
```yaml
---
deployment:
  tasks:
    # 1. Tentukan folder target aplikasi Node.js Anda
    - export DEPLOYPATH=/home/$USER/baraka/
    - /bin/mkdir -p $DEPLOYPATH
    - /bin/mkdir -p $DEPLOYPATH/dist
    - /bin/mkdir -p $DEPLOYPATH/data
    - /bin/mkdir -p $DEPLOYPATH/tmp

    # 2. Salin aset statis hasil build dan file server
    - /bin/cp -R dist/* $DEPLOYPATH/dist/
    - /bin/cp server.js $DEPLOYPATH/
    - /bin/cp package.json $DEPLOYPATH/
    - /bin/cp .htaccess $DEPLOYPATH/ 2>/dev/null || :

    # 3. Trigger Auto-Restart Phusion Passenger
    # Menyentuh restart.txt membuat Node.js otomatis me-reload kode baru tanpa downtime
    - /bin/touch $DEPLOYPATH/tmp/restart.txt
```

---

## 5. KONFIGURASI FILE `.htaccess` (ANTI ERROR 404 & WAJIB HTTPS)

Aplikasi React adalah Single Page Application (SPA). Jika pengunjung me-refresh URL seperti `https://domainanda.com/participant` atau `https://domainanda.com/organizer`, web server fisik Apache akan mencari folder `/participant`. Karena folder tersebut tidak ada, Apache akan mengeluarkan error **404 Not Found**.

File `.htaccess` berikut telah kami sertakan di root proyek untuk mengatasi masalah tersebut:

```apache
# ==============================================================================
# BARAKA ADVENTURE - cPanel .htaccess Configuration
# ==============================================================================

# 1. PAKSA KONEKSI HTTPS (WAJIB untuk Kamera Scanner QR & Geolocation GPS)
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

# 2. PENANGANAN ROUTING CLIENT-SIDE (REACT SPA FALLBACK — ANTI ERROR 404)
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # A. Jika request mengarah ke file/direktori fisik nyata (.js, .css, .svg, gambar), sajikan langsung
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    # B. Jangan arahkan request API (/api/*) ke index.html agar data JSON tidak tertimpa HTML
    RewriteCond %{REQUEST_URI} ^/api/ [NC]
    RewriteRule ^ - [L]

    # C. Semua rute navigasi browser lainnya dialihkan ke index.html untuk ditangani React Router
    RewriteRule ^ index.html [L]
</IfModule>

# 3. KOMPRESI GZIP (Menghemat kuota data seluler peserta di lokasi lomba)
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json image/svg+xml
</IfModule>

# 4. BROWSER CACHING (Aset JavaScript dan CSS di-cache 1 bulan agar akses instan)
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
    ExpiresByType image/svg+xml "access plus 1 month"
    ExpiresByType image/png "access plus 1 month"
    ExpiresByType text/html "access plus 0 seconds"
</IfModule>
```

---

## 6. SETUP APLIKASI DI MENU 'SETUP NODE.JS APP' CPANEL

Lakukan langkah ini satu kali saat pertama kali menyiapkan server:

1. Di cPanel, cari dan buka menu **Setup Node.js App**.
2. Klik tombol **Create Application**:
   * **Node.js version**: Pilih versi **18.x** atau **20.x**.
   * **Application mode**: Pilih **Production**.
   * **Application root**: Isi nama folder yang sama dengan di `.cpanel.yml`, yaitu `baraka`.
   * **Application URL**: Pilih domain atau subdomain Anda (misal `lomba.domainanda.com`).
   * **Application startup file**: Ketik `server.js`.
3. Klik **Create**.
4. **Install Dependencies Backend**:
   * Di baris aplikasi yang baru dibuat, klik tombol **Run NPM Install** (tunggu ~1 menit hingga selesai).
5. **Konfigurasi Environment Variables**:
   * Scroll ke bagian **Environment variables**, klik **Add Variable**:
     * `STANDALONE_MODE` = `true`
     * `NODE_ENV` = `production`
   * Klik **Save**.
6. Klik tombol **Restart**.

---

## 7. ALUR KERJA UPDATE BERKALA (CUKUP 1 BARIS PERINTAH)

Setelah konfigurasi awal di atas selesai, setiap kali Anda selesai memperbarui kode atau menambah fitur di laptop, alur kerjanya menjadi sangat cepat dan otomatis:

```bash
# 1. Lakukan build mandiri di laptop
npm run build:all

# 2. Rekam perubahan ke Git
git add .
git commit -m "Update fitur lomba dan rute"

# 3. Kirim langsung ke hosting cPanel Anda
git push cpanel main
```

**Apa yang terjadi di server secara otomatis?**
1. cPanel menerima kode baru.
2. Skrip `.cpanel.yml` menyalin `dist/` dan `server.js` baru ke folder aplikasi `baraka/`.
3. Skrip menyentuh file `tmp/restart.txt`.
4. Node.js me-restart secara *graceful* tanpa mematikan koneksi pengguna.
5. Fitur baru langsung aktif dalam 3–5 detik!

---

## 8. CHECKLIST VERIFIKASI PASKA-DEPLOY

Setelah aplikasi berjalan di domain hosting Anda, lakukan pengujian berikut:

- [ ] **Uji HTTPS (Gembok Hijau)**: Buka `https://lomba.domainanda.com`.
- [ ] **Uji Kamera QR**: Masuk ke form peserta atau panitia, klik icon scan QR. Pastikan browser meminta izin kamera dan video scanner terbuka normal.
- [ ] **Uji GPS**: Pastikan browser meminta izin lokasi (Geolocation) dan radius titik pos terbaca.
- [ ] **Uji Anti-404 Refresh**: Buka URL rute non-root (misal `https://lomba.domainanda.com/?tab=organizer`), lalu tekan tombol Refresh (F5) di browser. Pastikan halaman tetap termuat dengan sempurna tanpa error 404 Apache.
- [ ] **Uji Database Persisten**: Buat Course dan Checkpoint uji coba, restart Node.js di cPanel, lalu buka kembali. Pastikan data tidak hilang (tersimpan di `/data/baraka-db.json`).
