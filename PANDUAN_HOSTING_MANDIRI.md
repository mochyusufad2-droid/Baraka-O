# 🚀 PANDUAN DEPLOY MANDIRI KE DOMAIN & HOSTING PRIBADI
### Aplikasi BARAKA ADVENTURE — 100% Bebas GitHub, Vercel, & Firebase

Dokumen ini adalah panduan lengkap langkah-demi-langkah bagi Anda untuk memasang dan menjalankan aplikasi **BARAKA ADVENTURE** di hosting dan domain milik Anda sendiri.

---

## 📋 Keuntungan Menjalankan di Hosting Sendiri
1. **Bebas Kuota Selamanya (Rp 0)**: Tidak ada batas 20.000 *write* harian Firebase. Mau 1.000 peserta kirim GPS tiap menit, semuanya gratis.
2. **Data Permanen & Anti-Reset**: Disimpan langsung di harddisk server Anda (`/data/baraka-db.json`) dengan kecepatan baca RAM 0,1 milidetik.
3. **Branding Profesional**: Menggunakan domain Anda sendiri (misal: `https://lomba.namadomain.com` atau `https://barakaadventure.id`).
4. **Privasi Penuh**: Seluruh data nama atlet, nomor kontak, koordinat lintasan rahasia, dan nomor BIB berada 100% di tangan Anda.

---

## 🛠️ Syarat Hosting yang Dibutuhkan
1. **Dukungan Node.js**: Minimal **Node.js v18 atau v20 LTS**.
   * Jika menggunakan **Shared Hosting (cPanel / DirectAdmin)**: Pastikan di cPanel ada menu **"Setup Node.js App"**.
   * Jika menggunakan **VPS (Virtual Private Server)**: Semua VPS (Ubuntu / Debian / AlmaLinux) 100% didukung.
2. **Sertifikat SSL (Wajib HTTPS)**:
   * Fitur **AutoSSL / Let's Encrypt (Gratis)** harus aktif di domain Anda.
   * *Mengapa Wajib?* Browser modern di HP (Chrome di Android, Safari di iPhone) hanya mengizinkan **Kamera Scanner QR** dan **Sensor Lokasi GPS** jika web diakses melalui alamat aman `https://`.

---

## 📦 CARA A: DEPLOY DI CPANEL (SHARED HOSTING) — PALING PRAKTIS

### Langkah 1: Build Aplikasi di Laptop / Komputer
1. Buka folder proyek aplikasi di laptop Anda.
2. Buka terminal, lalu jalankan:
   ```bash
   npm install
   npm run build
   ```
   *(Perintah ini menghasilkan folder `dist/` yang berisi antarmuka peserta & organizer siap pakai)*.
3. Kompres folder berikut ke dalam 1 file `.zip` (misal: `baraka-deploy.zip`):
   * Folder `dist/`
   * Folder `src/`
   * File `server.ts` (atau `server.js`)
   * File `package.json`
   * File `tsconfig.json`
   *(Catatan: Folder `node_modules` **TIDAK PERLU** dimasukkan ke dalam zip agar file kecil dan cepat diupload)*.

---

### Langkah 2: Buat Node.js App di cPanel
1. Login ke **cPanel** hosting Anda.
2. Cari dan klik menu **"Setup Node.js App"**.
3. Klik tombol **"Create Application"**:
   * **Node.js version**: Pilih versi **18.x** atau **20.x**.
   * **Application mode**: Pilih **Production**.
   * **Application root**: Isi nama folder, misalnya `baraka` atau `subdomain/lomba`.
   * **Application URL**: Pilih domain atau subdomain Anda (misal `lomba.domainanda.com`).
   * **Application startup file**: Isi `server.ts` (atau `server.js`).
4. Klik **Create**.

---

### Langkah 3: Upload File via File Manager cPanel
1. Buka menu **File Manager** di cPanel.
2. Masuk ke folder aplikasi yang tadi dibuat (misal folder `baraka`).
3. Klik tombol **Upload**, lalu pilih file `baraka-deploy.zip`.
4. Setelah ter-upload, klik kanan pada file zip tersebut lalu klik **Extract (Ekstrak)**.
5. Hapus file `.zip` agar menghemat ruang hosting.

---

### Langkah 4: Jalankan NPM Install & Nyalakan Aplikasi
1. Kembali ke menu **"Setup Node.js App"** di cPanel.
2. Klik tombol **"Run NPM Install"** (tunggu ~1-2 menit hingga cPanel selesai mengunduh paket pendukung).
3. Di bagian **Environment Variables** (opsional), tambahkan:
   * Name: `STANDALONE_MODE` -> Value: `true`
   * Name: `NODE_ENV` -> Value: `production`
4. Klik tombol **"Restart"** (Mulai Ulang Aplikasi).
5. Buka domain Anda di browser: `https://lomba.domainanda.com`.
6. **Aplikasi BARAKA ADVENTURE sudah 100% online di hosting Anda!** 🎉

---

## 🖥️ CARA B: DEPLOY DI VPS (UBUNTU / DEBIAN + NGINX + PM2)

Jika Anda menggunakan VPS (seperti DigitalOcean, Contabo, Linode, IDCloudHost, atau Niagahoster VPS):

### 1. Install Node.js & PM2 di VPS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2 tsx
```

### 2. Upload Kode ke VPS & Install
```bash
mkdir -p /var/www/baraka
cd /var/www/baraka
# Upload file aplikasi Anda ke folder ini
npm install
npm run build
```

### 3. Jalankan Aplikasi dengan PM2 (Auto-Restart 24 Jam)
```bash
STANDALONE_MODE=true PORT=3000 pm2 start "npx tsx server.ts" --name baraka
pm2 save
pm2 startup
```

### 4. Konfigurasi Nginx Reverse Proxy & SSL Gratis
Tambahkan konfigurasi di `/etc/nginx/sites-available/baraka`:
```nginx
server {
    server_name lomba.domainanda.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Aktifkan konfigurasi & nyalakan SSL Certbot:
```bash
sudo ln -s /etc/nginx/sites-available/baraka /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d lomba.domainanda.com
```

---

## 💾 CARA MEMINDAHKAN DATA DARI VERSI INI KE HOSTING ANDA (1-KLIK)

Semua Course, titik pos, nomor BIB peserta, dan skor yang sudah kita uji coba saat ini **tidak perlu dibuat ulang**!

1. Buka Dashboard Organizer di sini sebagai **Superadmin** (PIN: `123456`).
2. Masuk ke Tab **Kelola Akun Organizer & Pengaturan**.
3. Di kartu **Pencadangan & Pemulihan Database Penuh**, klik tombol:
   👉 **`Download Full Database (.json)`**
   *(File `.json` akan tersimpan di laptop Anda)*.
4. Buka aplikasi BARAKA ADVENTURE di domain/hosting baru Anda.
5. Login ke Dashboard sebagai Superadmin di hosting baru.
6. Klik tombol **`Upload & Pulihkan Database (.json)`**, lalu pilih file yang tadi Anda unduh.
7. Muncul ringkasan data -> Klik **"Ya, Pulihkan Database Sekarang"**.
8. **Detik itu juga, seluruh Course dan peserta Anda langsung muncul lengkap di domain pribadi Anda!**

---

## 🔄 CARA UPDATE DI KEMUDIAN HARI (HANYA BUTUH 1 MENIT)

Jika suatu saat ada penambahan fitur baru:
1. Klik **Download Full Database (.json)** sebagai cadangan di laptop Anda.
2. Upload folder `dist/` dan file `server.ts` hasil update ke hosting Anda (timpa file lama).
3. **PENTING**: File database permanen di `/data/baraka-db.json` **JANGAN DIHAPUS**.
4. Klik **Restart** di cPanel atau `pm2 restart baraka` di VPS.
5. Seluruh data lomba Anda tetap utuh dan fitur baru langsung aktif!
