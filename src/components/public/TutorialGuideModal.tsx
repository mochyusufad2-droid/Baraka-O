import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FileDown,
  FileText,
  RefreshCw,
  Shield,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';

interface TutorialGuideModalProps {
  onClose: () => void;
}

const IMG_PESERTA_1 = '/src/assets/images/peserta_1_login_setup_1794880400721.jpg';
const IMG_PESERTA_2 = '/src/assets/images/peserta_2_kokpit_senter_1794880400738.jpg';
const IMG_PESERTA_3 = '/src/assets/images/peserta_3_peta_kunci_saku_1794880405398.jpg';
const IMG_PESERTA_4 = '/src/assets/images/peserta_4_finish_split_time_1794880407408.jpg';

const IMG_ORG_1 = '/src/assets/images/organizer_1_dashboard_peserta_1794880411083.jpg';
const IMG_ORG_2 = '/src/assets/images/organizer_2_peta_cetak_qr_1794880414737.jpg';
const IMG_ORG_3 = '/src/assets/images/organizer_3_monitoring_mass_start_1794880417530.jpg';
const IMG_ORG_4 = '/src/assets/images/organizer_4_leaderboard_split_tv_1794880419827.jpg';

export const PROMPT_NOTEBOOKLM_PPTX = `Bertindaklah sebagai Instruktur Teknis Senior Orienteering dan Desainer Presentasi Profesional. Berdasarkan sumber panduan ORIENTRA ini, buatkan struktur materi presentasi PowerPoint (PPTX) sebanyak 14 Slide yang sangat jelas, padat, dan siap dipresentasikan saat Technical Meeting.

Bagi menjadi 2 sesi:
- Slide 1 s/d 8: Panduan Teknis Peserta (Persiapan HP, Login & Scan Setup QR, Cara Kerja Mass Start vs Start QR, Kokpit Lari & Tombol Senter QR di Tempat Gelap, Navigasi Peta Topo/Satelit & Tombol GPS Saya/Semua Pos, Mode Kunci Saku OLED Hemat Baterai, Scan Finish & Cara Membaca Tabel Split Time Antar-Pos, serta Penanganan Kendala Offline di Hutan).
- Slide 9 s/d 14: Panduan Operasional Panitia / Marshal (Alur 4 Tab Dashboard Organizer, Perancangan Peta Pos & Cetak QR Massal, Prosedur Pelepasan Mass Start 1-Klik, Pemantauan Radar Live Monitoring & Override Estafet Darurat, serta Penentuan Juara & Penayangan Live TV Leaderboard).

Untuk setiap slide, tuliskan:
1. Judul Slide yang tegas dan menarik
2. Maksimal 4-5 poin peluru (bullet points) yang ringkas dan mudah dibaca dari jarak jauh
3. Rekomendasi Visual / Screenshot mana yang harus ditampilkan di slide tersebut
4. Naskah Pembicara (Speaker Notes) singkat untuk dibacakan oleh pemateri saat Technical Meeting.`;

export const PROMPT_NOTEBOOKLM_AUDIO = `Buat diskusi audio dalam Bahasa Indonesia yang santai, antusias, dan sangat jelas seperti dua orang Race Director Orienteering berpengalaman yang sedang memberikan pembekalan teknis (Technical Briefing) kepada para peserta dan panitia lomba menggunakan aplikasi ORIENTRA.

Fokuskan pembahasan pada:
1. Betapa mudahnya peserta memakai ORIENTRA tanpa takut hilang sinyal di tengah hutan (Offline-First) dan cara menghemat baterai dengan Mode Kunci Saku OLED.
2. Fitur-fitur baru yang sangat membantu di lapangan: Tombol Senter (Flashlight) saat scan QR di tempat gelap/rimbun, Tabel Rincian Split Time Antar-Pos saat Finish untuk evaluasi kecepatan tiap pos, serta Pengaman Anti-Manipulasi Jam HP yang menjaga kejujuran lomba.
3. Kemudahan bagi panitia di lapangan: fitur Mass Start 1-Klik agar ratusan peserta tidak perlu mengantre scan di garis Start, pantauan posisi peserta di Live Monitoring, dan Live Leaderboard dengan rincian Split Time.`;

export const PROMPT_NOTEBOOKLM_WA = `Berdasarkan panduan ORIENTRA ini, buatkan "PANDUAN CEPAT 1 MENIT PESERTA ORIENTRA" dalam format pesan WhatsApp yang rapi (menggunakan huruf tebal, ikon emoji yang tepat, dan poin bernomor singkat) untuk dikirimkan ke grup WhatsApp seluruh peserta H-1 sebelum lomba dimulai. Pastikan mencakup: Checklist HP sebelum ke garis Start, 4 langkah inti (Login -> Scan Setup QR -> Start/Mass Start -> Scan Pos dengan Senter bila gelap -> Scan Finish), cara pakai Mode Kunci Saku agar baterai awet, dan jaminan bahwa aplikasi tetap berfungsi 100% walau sinyal hilang di hutan.`;

export function buildFullMarkdownContent(originUrl: string): string {
  return `# BUKU PANDUAN & TUTORIAL LENGKAP ORIENTRA
**Platform Digital Orienteering & Adventure Race — Panduan Resmi Peserta, Panitia (Organizer), & Superadmin (Siap Diolah ke NotebookLM & PowerPoint / PPTX)**

---

# BAGIAN 1: TUTORIAL LENGKAP UNTUK PESERTA (RUNNER / TIM)

---

## MODUL PESERTA — LANGKAH 1: PERSIAPAN HP, REGISTRASI / LOGIN TIM, & SCAN SETUP QR
### Tujuan Langkah Ini:
Memastikan perangkat smartphone peserta siap berlomba di medan terbuka/hutan, masuk ke akun tim resmi, dan mengunduh paket lintasan (*Course*) ke memori lokal HP agar **100% tahan hilang sinyal (*Offline-First*)**.

![Tutorial Peserta Langkah 1: Login Tim & Scan Setup QR Course](${originUrl}${IMG_PESERTA_1})

### Checklist Persiapan HP (Sebelum ke Meja Registrasi):
1. **Daya Baterai Minimal 80%**: Pastikan baterai mencukupi untuk durasi lomba (gunakan *Mode Kunci Saku OLED* saat berlari agar hemat baterai hingga 70%).
2. **Aktifkan Lokasi GPS Akurasi Tinggi**: Nyalakan layanan Lokasi (*Location / GPS*) di pengaturan HP Anda.
3. **Buka Browser Utama & Izinkan Kamera + Lokasi**:
   - Gunakan **Google Chrome** (Android) atau **Safari** (iPhone).
   - Saat muncul jendela izin (*"Allow ORIENTRA to access your Camera and Location"*), pilih **Allow / Izinkan Saat Aplikasi Digunakan**.
   - **Tips PWA (Opsional)**: Ketuk tombol **\`Pasang Aplikasi (Install)\`** di bagian atas layar agar ORIENTRA terpasang sebagai aplikasi layar penuh di HP Anda.
4. **Satu HP Utama per Tim**: Gunakan 1 perangkat HP yang sama dari *Scan Setup QR*, *Start*, seluruh *Pos Checkpoint*, hingga *Finish*.

### Urutan Langkah 1A — Registrasi Mandiri atau Login Tim:
1. **Jika Mendaftar Mandiri di Aplikasi (Tab \`Daftar Baru\`)**:
   - Isi **Nama Pendaftar**, **Nama Tim** (wajib; jika individu, samakan dengan Nama Pendaftar), **Gender**, **Kelompok Umur**, **Nomor WhatsApp Aktif**, dan buat **Password Tim (minimal 6 karakter)**, lalu tekan **\`Daftar & Masuk\`**.
2. **Jika Akun Sudah Didaftarkan Panitia (Tab \`Login Tim\`)**:
   - Masukkan **Nama Tim** (contoh: \`GARUDA RIMBA\`) dan **Password Tim** yang diberikan panitia, lalu tekan tombol oranye **\`Masuk ke Sesi Lomba\`**.

### Urutan Langkah 1B — Scan Setup QR Course (Di Meja Registrasi / Marshalling Area):
1. Setelah berhasil login, tekan tombol hijau besar **\`1. SCAN SETUP QR COURSE\`**.
2. Arahkan kamera HP ke lembar **SETUP QR CODE** milik panitia.
3. Begitu terbaca, HP Anda otomatis menyimpan seluruh data titik pos, koordinat peta, dan aturan penalti ke memori internal HP (*IndexedDB*).
4. **Khusus Lomba Mode Estafet (*Relay*)**:
   - Pelari Pertama (**Sub-Team #1**) mengetik **Nama Tim Induk** baru (contoh: \`GARUDA NUSANTARA\`), memilih **\`Sub-Team #1\`**, lalu menekan **\`Simpan Identitas Sub-Team\`**.
   - Pelari Kedua & Ketiga (**Sub-Team #2 & #3**) cukup **mengetuk daftar Nama Tim Induk yang sudah ada** (fitur *Anti-Typo*), memilih urutan **\`Sub-Team #2\`** atau **\`#3\`**, lalu menekan **\`Simpan Identitas Sub-Team\`**.

---

## MODUL PESERTA — LANGKAH 2: MEMULAI LOMBA (START), KOKPIT PELARI, & FITUR SENTER QR
### Tujuan Langkah Ini:
Memulai perhitungan waktu lomba (*Stopwatch*), memahami elemen pada **Kokpit Pelari Hybrid V4**, serta memindai QR Code Pos menggunakan bantuan **Tombol Senter (Flashlight)** di tempat gelap/rimbun.

![Tutorial Peserta Langkah 2: Kokpit Pelari Hybrid V4 & Kamera Scanner dengan Senter Aktif](${originUrl}${IMG_PESERTA_2})

### Cara Memulai Waktu Lomba (2 Metode Start):
1. **Metode A — Scan Start QR Mandiri (*Interval / Staggered Start*)**:
   - Saat panitia memberi aba-aba di garis Start, tekan tombol hijau **\`▶ SCAN START QR\`** dan arahkan ke papan **START QR**.
   - HP akan berbunyi *"BEEP-BEEP"* dan bergetar 2 kali — *Stopwatch* langsung berjalan!
2. **Metode B — Pelepasan Serentak oleh Panitia (*Mass Start*)**:
   - Peserta cukup berkumpul di garis Start dalam kondisi sudah *Scan Setup QR* (status **\`Siap Start\`**).
   - Saat panitia menekan tombol **Mass Start** di komputer pusat, layar HP seluruh peserta otomatis berubah menjadi **\`ACTIVE\`**, memunculkan notifikasi **\`🚀 MASS START DIMULAI!\`**, dan *Stopwatch* langsung berjalan serentak tanpa perlu mengantre scan di gerbang Start!

### Anatomi Layar Kokpit Pelari (Terkunci di Atas Layar):
1. **Baris Atas Kokpit**:
   - **Kiri (\`Logo ORIENTRA\`)**: Penanda identitas resmi.
   - **Tengah (\`00:18:42\` & \`Sisa 41:18\`)**: *Stopwatch* waktu tempuh berjalan & penghitung mundur (*Countdown*) sisa batas waktu lomba (*Cut-Off Time*).
   - **Kanan (\`🔒 Kunci Layar\`)**: Tombol satu sentuhan untuk mengaktifkan **Mode Kunci Saku Hitam (OLED)**.
2. **Baris Status Ringkas**: Menampilkan \`Tim\`, \`Course\`, \`Pos Tercapai (misal 3/10)\`, dan \`Skor Sementara\`.
3. **Tombol Hijau Ekstra Besar (\`📷 SCAN QR POS / FINISH\`)**:
   - Satu-satunya tombol yang perlu ditekan setiap kali tiba di Pos Checkpoint maupun di Garis Finish.
4. **Kartu Daftar Pos & Lencana Split Time**:
   - Setiap pos yang berhasil di-scan langsung berubah menjadi **Hijau (\`✅ Sah\`)** dan menampilkan **\`+Split Antar-Pos • Waktu Kumulatif\`** (contoh: \`+00:04:12 • 00:04:12\`).

### Cara Menggunakan Tombol 🔦 Senter (Flashlight) Saat Scan QR di Area Gelap:
1. Saat kamera *scanner* terbuka di area hutan lebat, di bawah pohon rimbun, di dalam gua, atau saat lomba malam (*Night Orienteering*), ketuk tombol kapsul besar **\`🔦 Nyalakan Senter / Flash Kamera\`** di bawah kotak bidik (atau tombol **\`🔦 SENTER\`** di kanan atas).
2. Lampu LED *flash* kamera belakang HP akan menyala sekaligus mengaktifkan **Screen Light Ring** (cahaya putih terang di sekeliling kotak bidik) sehingga stiker QR Code langsung terbaca.

---

## MODUL PESERTA — LANGKAH 3: NAVIGASI PETA DIGITAL (TAB \`MAP\`) & MODE KUNCI SAKU (OLED)
### Tujuan Langkah Ini:
Menggunakan peta topografi/satelit interaktif untuk bernavigasi antar-pos serta mengunci layar HP saat berlari agar hemat baterai dan anti-terpencet (*anti-ghost touch*).

![Tutorial Peserta Langkah 3: Navigasi Peta Interaktif & Mode Kunci Saku OLED Hitam](${originUrl}${IMG_PESERTA_3})

### Cara Menggunakan Peta Interaktif (Tab \`Map\`):
1. Ketuk tab **\`🗺️ Map\`** di kokpit peserta (jika fitur peta diaktifkan oleh panitia).
2. **3 Pilihan Lapisan Peta (Pojok Kiri Atas)**:
   - **\`Peta Jalan\`**: Peta jalan raya, pemukiman, dan bangunan (OpenStreetMap).
   - **\`Satelit\`**: Citra foto satelit untuk mengenali bukaan lahan, lapangan, dan batas vegetasi.
   - **\`Topo\`**: Peta garis kontur ketinggian tanah (elevasi) dan jalur setapak gunung/hutan.
3. **2 Tombol Taktis Cepat (Pojok Kanan Atas)**:
   - **\`🎯 GPS Saya\`**: Memperbarui pembacaan satelit GPS dan langsung memusatkan layar peta ke titik biru posisi Anda saat ini (\`ANDA\`).
   - **\`⛶ Semua Pos\`**: Mengatur skala *zoom* otomatis agar seluruh titik **Start (△)**, **Pos CP (⭕)**, dan **Finish (◎)** terlihat utuh dalam satu layar.
4. **Cara Menggunakan Mode Kunci Saku (\`🔒 Kunci Layar\`)**:
   - Ketuk tombol biru **\`🔒 Kunci Layar\`** di kanan atas kokpit sebelum memasukkan HP ke saku/rompi lari.
   - Layar berubah menjadi **Hitam Pekat (OLED 0-Watt)** anti-terpencet keringat.
   - Saat tiba di pos berikutnya, cukup **tekan dan tahan selama 1 detik** tombol hijau **\`Tahan 1 Detik: Buka & Langsung Scan QR\`** di bagian bawah layar hitam.

---

## MODUL PESERTA — LANGKAH 4: SCAN FINISH, TABEL SPLIT TIME ANTAR-POS, & UNDUH BUKTI HASIL
### Tujuan Langkah Ini:
Menghentikan waktu lomba secara resmi di garis Finish, mengevaluasi waktu tempuh dari pos ke pos (*Split Time*), dan menyimpan kartu bukti digital ke galeri HP.

![Tutorial Peserta Langkah 4: Kartu Selesai Lomba & Tabel Rincian Split Time Antar-Pos](${originUrl}${IMG_PESERTA_4})

### Urutan di Garis Finish:
1. Saat tiba di gerbang Finish, ketuk tombol hijau **\`📷 SCAN QR POS / FINISH\`** dan arahkan ke papan **FINISH QR**.
2. Begitu **FINISH QR** terbaca:
   - *Stopwatch* langsung **BERHENTI** dan terkunci.
   - Muncul kartu **\`Selamat! Anda Telah Menyelesaikan Lomba\`** beserta **Tabel Rincian Split Time Antar-Pos** yang menampilkan \`Urutan\`, \`Pos\`, \`Split Antar-Pos\` (dengan lencana **\`⚡ Tercepat\`** pada segmen terbaik), dan \`Waktu Kumulatif\`.
3. Ketuk tombol biru **\`Unduh Kartu Bukti Hasil (PNG)\`** untuk menyimpan bukti waktu & skor ke galeri HP.
4. **Pengaman Anti-Manipulasi Jam HP (*Monotonic Clock Guard*)**: Aplikasi mengikat waktu lari pada detak silikon perangkat keras (\`performance.now()\`). Memundurkan jam manual di Pengaturan HP saat *offline* tidak akan mengurangi durasi lari sedikit pun.

---
---

# BAGIAN 2: TUTORIAL LENGKAP UNTUK ORGANIZER (PANITIA) & SUPERADMIN

---

## MODUL ORGANIZER — LANGKAH 1: LOGIN PANITIA, KELOLA AKUN PESERTA, & RINGKASAN COURSE (TAB 1)
![Tutorial Organizer Langkah 1: Dashboard Ringkasan Course, Mass Start, & Registrasi Peserta](${originUrl}${IMG_ORG_1})

1. **4 Kartu Indikator Utama**: Menampilkan **Total Peserta Terdaftar**, **Sedang Berlomba (\`ACTIVE\`)** + jumlah **\`Siap Start\`**, **Sudah Finish (\`FINISHED\`)**, serta **Total Course & Pos CP**.
2. **Kartu Ringkasan Course Aktif (Panel Kiri)**:
   - Dilengkapi tombol hijau **\`▶ Mass Start (N Siap)\`** untuk pelepasan serentak 1-klik dan tombol **\`🖨️ Buka Lembar QR Massal\`**.
3. **Panel Registrasi & Manajemen Peserta (Panel Kanan)**:
   - Mendaftarkan akun tim sebelum hari-H, mereset password tim yang lupa, atau menghapus akun uji coba.

---

## MODUL ORGANIZER — LANGKAH 2: MERANCANG PETA COURSE, ATURAN LOMBA, & CETAK QR MASSAL (TAB 2)
![Tutorial Organizer Langkah 2: Perancang Peta Course Interaktif & Cetak Lembar QR Massal A4](${originUrl}${IMG_ORG_2})

1. **Atur Konfigurasi Course**: Tentukan *Metode Validasi* (\`QR_ONLY\`, \`QR_AND_GPS\`, \`QR_OR_GPS\`, \`GPS_AUTO\`), *Aturan Urutan Pos* (\`Wajib Berurutan\` vs \`Bebas Score-O\`), *Batas Waktu & Penalti Overtime*, *Visibilitas Peta Peserta*, serta *Mode Reguler vs Relay Estafet*.
2. **Tempatkan Titik di Peta Interaktif**: Klik atau geser (*drag*) pin **Start (△)**, **Pos CP1..CPn (⭕)**, dan **Finish (◎)** di atas peta Jalan, Topografi, atau Satelit.
3. **Cetak Semua QR Code**: Klik **\`🖨️ Cetak Semua QR (2–8 per Hal)\`** untuk mencetak lembar A4 berisi **SETUP QR**, **START QR**, seluruh **POS CP QR**, dan **FINISH QR**.

---

## MODUL ORGANIZER — LANGKAH 3: PELEPASAN SERENTAK (MASS START), LIVE MONITORING, & OVERRIDE DARURAT (TAB 3)
![Tutorial Organizer Langkah 3: Peta Radar Live Monitoring, Konfirmasi Mass Start, & Override Panitia](${originUrl}${IMG_ORG_3})

1. **Tombol 🚀 Mass Start (Pelepasan Serentak 1-Klik)**:
   - Klik **\`▶ Mass Start Course Ini\`** -> **\`Lepas Serentak Sekarang\`**. Seluruh tim yang sudah *Scan Setup QR* langsung berubah menjadi \`ACTIVE\` dengan detik waktu Start yang persis sama.
2. **Peta Radar Live Monitoring**:
   - Memantau pergerakan posisi terakhir setiap tim di lapangan beserta indikator peringatan **\`⚠️ >5m\`** jika tim berada di lembah tanpa sinyal.
3. **Tombol \`🔓 Override\` (Penanganan Darurat Mode Estafet)**:
   - Membuka kunci giliran Sub-Team berikutnya (\`Unlock Sub-Team\`), memaksa selesai (\`Force Finish\`), atau menandai \`Force DNF\` bila HP pelari sebelumnya mati total di lapangan.

---

## MODUL ORGANIZER — LANGKAH 4: KLASEMEN RESMI, TABEL SPLIT TIME, LIVE TV PENONTON, & EXPORT CSV (TAB 4)
![Tutorial Organizer Langkah 4: Tabel Leaderboard Resmi dengan Kolom Split Time Antar-Pos & Mode Live TV](${originUrl}${IMG_ORG_4})

1. **Peringkat Otomatis & Filter Kategori**: Saring pemenang berdasarkan **Gender** dan **Kelompok Umur**.
2. **Kolom Rincian Split Time (\`Show Split #1..#N\`)**: Menampilkan kode pos, poin, waktu kumulatif, dan waktu tempuh antar-pos setiap tim. Klik **Nama Tim** untuk membuka *Pop-Up Detail Peserta & Nomor WhatsApp*.
3. **Live TV Penonton & Export CSV**:
   - Klik **\`📺 Layar Penuh Penonton (Live TV)\`** untuk tayangan layar proyektor/TV di tenda Finish (lengkap dengan *Auto-Scroll*).
   - Klik **\`📡 Bagikan Link Penonton\`** untuk membagikan QR Code klasemen publik ke penonton.
   - Klik **\`📊 Export Hasil (CSV)\`** untuk mengunduh laporan lengkap ke Microsoft Excel.

---
---

# BAGIAN 3: KUMPULAN PROMPT SIAP PAKAI UNTUK NOTEBOOKLM

### PROMPT 1: Untuk Membuat Kerangka Slide Presentasi PowerPoint (PPTX)
\`\`\`text
${PROMPT_NOTEBOOKLM_PPTX}
\`\`\`

### PROMPT 2: Untuk Membuat Naskah Audio Overview / Podcast Briefing
\`\`\`text
${PROMPT_NOTEBOOKLM_AUDIO}
\`\`\`

### PROMPT 3: Untuk Membuat Lembar Saku "Cheat Sheet" WhatsApp Peserta
\`\`\`text
${PROMPT_NOTEBOOKLM_WA}
\`\`\`
`;
}

// ============================================================================
// GENERATOR FILE PDF NATIVE (TANPA WINDOW.PRINT / TANPA LIBRARY EKSTERNAL)
// Menghasilkan file Buku_Panduan_Lengkap_ORIENTRA.pdf yang berisi teks asli
// (bisa dibaca Google NotebookLM) + 8 gambar screenshot tersemat!
// ============================================================================

interface LoadedJpegAsset {
  bytes: Uint8Array;
  width: number;
  height: number;
}

async function loadImageAsBaselineJpeg(url: string): Promise<LoadedJpegAsset | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const maxW = 1100;
        const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#051224';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        const base64 = dataUrl.split(',')[1];
        if (!base64) {
          resolve(null);
          return;
        }
        const binStr = atob(base64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        resolve({ bytes, width: w, height: h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function sanitizePdfText(str: string): string {
  // Ganti karakter non-ASCII / simbol khusus ke padanan ASCII bersih agar 100% aman di WinAnsiEncoding PDF
  return str
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, '*')
    .replace(/→/g, '->')
    .replace(/±/g, '+/-')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapTextLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxCharsPerLine) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface PdfPageSpec {
  badge: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  bullets: Array<{ heading: string; body: string }>;
}

async function generateIllustratedPdfBlob(): Promise<Blob> {
  const pagesSpec: PdfPageSpec[] = [
    {
      badge: 'PANDUAN RESMI PESERTA & ORGANIZER',
      title: 'BUKU PANDUAN & TUTORIAL LENGKAP ORIENTRA',
      subtitle:
        'Digital Orienteering & Adventure Race Platform (Siap Diunggah ke Google NotebookLM & PPTX)',
      bullets: [
        {
          heading: '1. Keunggulan Utama Platform ORIENTRA:',
          body: 'Aplikasi Web/PWA tanpa instalasi rumit yang 100% tahan hilang sinyal di tengah hutan (Offline-First IndexedDB). Mendukung lomba Point-to-Point (Wajib Urut), Score Orienteering (Acak), maupun Mode Estafet (Relay Akumulasi).',
        },
        {
          heading: '2. Empat Fitur Lapangan Terbaru:',
          body: '(a) Tombol Senter / Flashlight + Screen Light Ring di kamera scanner QR untuk malam hari/hutan rimbun; (b) Tabel Rincian Split Time Antar-Pos otomatis di Kartu Finish & Leaderboard; (c) Pengaman Anti-Manipulasi Jam HP (Monotonic Clock Guard); (d) Tombol Mass Start 1-Klik di Dashboard Panitia.',
        },
        {
          heading: '3. Checklist Wajib HP Peserta Sebelum Masuk Garis Start:',
          body: 'Pastikan baterai HP minimal 80%, nyalakan GPS Akurasi Tinggi, buka di Google Chrome (Android) atau Safari (iPhone), dan pilih Allow / Izinkan untuk akses Kamera serta Lokasi. Gunakan 1 HP utama yang sama untuk 1 tim dari Scan Setup QR, Start, Pos CP, hingga Finish.',
        },
        {
          heading: '4. Struktur Buku Panduan Ini:',
          body: 'Halaman 2-5 membahas Tutorial Lengkap Peserta (Langkah 1 s/d 4 beserta gambar screenshot). Halaman 6-9 membahas Tutorial Operasional Panitia/Organizer (Tab 1 s/d 4 beserta gambar screenshot). Halaman 10 memuat 3 Prompt Siap Pakai untuk Google NotebookLM.',
        },
      ],
    },
    {
      badge: 'MODUL PESERTA - LANGKAH 1',
      title: 'Langkah 1: Login Tim & Scan Setup QR Course',
      subtitle:
        'Masuk ke akun tim resmi dan mengunduh data rute lomba ke memori lokal HP (Offline-Ready)',
      imageUrl: IMG_PESERTA_1,
      bullets: [
        {
          heading: 'A. Daftar Mandiri atau Login Tim:',
          body: 'Jika belum punya akun, pilih tab Daftar Baru lalu isi Nama Pendaftar, Nama Tim, Gender, Kelompok Umur, No. WhatsApp, dan Password Tim (minimal 6 karakter). Jika sudah didaftarkan panitia, pilih tab Login Tim lalu masukkan Nama Tim dan Password Tim.',
        },
        {
          heading: 'B. Scan Setup QR Course di Meja Registrasi:',
          body: 'Ketuk tombol hijau 1. SCAN SETUP QR COURSE dan arahkan kamera ke lembar SETUP QR milik panitia. Seluruh koordinat titik pos dan aturan lomba langsung tersimpan di memori internal HP Anda.',
        },
        {
          heading: 'C. Khusus Lomba Mode Estafet (Relay):',
          body: 'Setelah Scan Setup QR, Pelari ke-1 mengetik Nama Tim Induk baru dan memilih Sub-Team #1. Pelari ke-2 dan ke-3 cukup mengetuk daftar Nama Tim Induk yang sudah ada (fitur Anti-Typo) dan memilih urutan Sub-Team masing-masing.',
        },
      ],
    },
    {
      badge: 'MODUL PESERTA - LANGKAH 2',
      title: 'Langkah 2: Mulai Lomba, Kokpit Hybrid V4, & Senter QR',
      subtitle:
        'Memulai waktu lomba (Start QR / Mass Start), menggunakan Kokpit Pelari, dan Senter Kamera di tempat gelap',
      imageUrl: IMG_PESERTA_2,
      bullets: [
        {
          heading: 'A. Dua Cara Memulai Waktu Lomba (Start):',
          body: '(1) Scan Start QR Mandiri: Ketuk tombol SCAN START QR di gerbang pelepasan; atau (2) Mass Start Panitia: Cukup berstatus Siap Start, dan ketika panitia menekan tombol Mass Start, stopwatch di HP Anda otomatis berjalan serentak.',
        },
        {
          heading: 'B. Anatomi Kokpit Pelari Hybrid V4:',
          body: 'Bagian atas menampilkan Logo ORIENTRA, Stopwatch waktu berjalan & Countdown sisa batas waktu (Cut-Off), tombol biru Kunci Layar, serta tombol hijau ekstra besar SCAN QR POS / FINISH. Kartu pos di bawahnya langsung menampilkan waktu +Split Antar-Pos dan Waktu Kumulatif.',
        },
        {
          heading: 'C. Tombol Senter (Flashlight) Saat Scan di Tempat Gelap:',
          body: 'Ketuk tombol kapsul kuning Nyalakan Senter / Flash Kamera di bawah kotak bidik untuk menyalakan lampu LED kamera belakang sekaligus Screen Light Ring putih terang agar QR Pos mudah terbaca di malam hari atau di bawah pohon rimbun.',
        },
      ],
    },
    {
      badge: 'MODUL PESERTA - LANGKAH 3',
      title: 'Langkah 3: Navigasi Peta Digital & Mode Kunci Saku OLED',
      subtitle:
        'Membaca peta kontur/satelit interaktif dan mengunci layar hitam hemat baterai saat berlari',
      imageUrl: IMG_PESERTA_3,
      bullets: [
        {
          heading: 'A. Tiga Lapisan Peta & Dua Tombol Taktis Cepat:',
          body: 'Pada tab Map, pilih Peta Jalan, Satelit, atau Topo (Kontur) di pojok kiri atas. Gunakan tombol GPS Saya di kanan atas untuk memusatkan peta ke titik biru posisi Anda (ANDA), atau tombol Semua Pos untuk melihat seluruh area lintasan.',
        },
        {
          heading: 'B. Arti Warna Simbol di Peta:',
          body: 'Segitiga Hijau = Titik Start; Lingkaran Hijau Centang = Pos sudah sah tercatat; Lingkaran Oranye = Target pos berikutnya (mode Wajib Urut); Lingkaran Ungu = Pos belum dikunjungi; Lingkaran Ganda = Garis Finish; Titik Biru = Posisi GPS Anda.',
        },
        {
          heading: 'C. Mode Kunci Saku OLED (Hemat Baterai & Anti-Terpencet):',
          body: 'Ketuk tombol biru Kunci Layar sebelum memasukkan HP ke saku/rompi lari. Layar berubah menjadi hitam pekat (0-Watt). Saat tiba di pos berikutnya, cukup tahan 1 detik tombol hijau di bawah layar untuk langsung membuka kamera scanner QR.',
        },
      ],
    },
    {
      badge: 'MODUL PESERTA - LANGKAH 4',
      title: 'Langkah 4: Scan Finish, Tabel Split Time, & Bukti PNG',
      subtitle:
        'Menghentikan waktu di garis Finish, menganalisis Split Time antar-pos, dan menyimpan bukti hasil',
      imageUrl: IMG_PESERTA_4,
      bullets: [
        {
          heading: 'A. Menghentikan Waktu di Garis Finish:',
          body: 'Ketuk tombol hijau SCAN QR POS / FINISH dan arahkan ke papan FINISH QR. Stopwatch langsung berhenti dan menampilkan Kartu Selesai Lomba berisi Total Waktu, Pos Tercapai, Potongan Penalti (jika overtime), dan Skor Akhir Bersih.',
        },
        {
          heading: 'B. Tabel Rincian Split Time Antar-Pos:',
          body: 'Menampilkan waktu tempuh murni dari satu pos ke pos berikutnya (+Split Antar-Pos) beserta Waktu Kumulatif sejak Start dan penanda Tercepat pada segmen terbaik Anda.',
        },
        {
          heading: 'C. Unduh Bukti PNG & Pengaman Anti-Manipulasi Jam HP:',
          body: 'Ketuk Unduh Kartu Bukti Hasil (PNG) untuk menyimpan bukti ke galeri HP. Sistem Monotonic Clock Guard secara otomatis mencegah kecurangan memundurkan jam HP saat berlari dalam keadaan offline.',
        },
      ],
    },
    {
      badge: 'MODUL ORGANIZER - LANGKAH 1 (TAB 1)',
      title: 'Organizer Tab 1: Ringkasan Course & Registrasi Peserta',
      subtitle:
        'Memantau kesiapan lomba, mendaftarkan akun tim, dan mengakses kontrol cepat Mass Start & Cetak QR',
      imageUrl: IMG_ORG_1,
      bullets: [
        {
          heading: 'A. Empat Indikator Kesiapan Lomba:',
          body: 'Menampilkan secara real-time jumlah Total Peserta Terdaftar, Sedang Berlomba (ACTIVE) beserta jumlah tim Siap Start, Sudah Finish (FINISHED), serta Total Course & Pos Checkpoint.',
        },
        {
          heading: 'B. Kartu Ringkasan Course Aktif:',
          body: 'Menampilkan parameter aturan Course yang sedang dipilih, dilengkapi tombol hijau Mass Start (N Siap) untuk pelepasan serentak dan tombol Buka Lembar QR Massal.',
        },
        {
          heading: 'C. Manajemen Akun Peserta & Kontrol Superadmin:',
          body: 'Panitia dapat mendaftarkan akun tim sebelum hari-H atau mereset password tim yang lupa. Khusus Superadmin, tersedia tab Kelola Akun Organizer untuk mengatur kuota Course, masa aktif, Backup Database JSON, dan unduh paket cPanel (.zip).',
        },
      ],
    },
    {
      badge: 'MODUL ORGANIZER - LANGKAH 2 (TAB 2)',
      title: 'Organizer Tab 2: Perancang Peta Pos & Cetak QR Massal',
      subtitle:
        'Menentukan aturan Course, menempatkan titik Start/CP/Finish di peta, dan mencetak lembar QR A4',
      imageUrl: IMG_ORG_2,
      bullets: [
        {
          heading: 'A. Pengaturan Aturan Course & Mode Estafet (Relay):',
          body: 'Pilih Metode Validasi (QR_ONLY, QR_AND_GPS, QR_OR_GPS, GPS_AUTO), Urutan Pos (Wajib Berurutan vs Score-O), Batas Waktu & Penalti Overtime per menit, Visibilitas Peta Peserta, serta Mode Lomba (Reguler vs Relay Estafet 2-10 Sub-Team).',
        },
        {
          heading: 'B. Menempatkan Titik Start, Pos CP, dan Finish di Peta:',
          body: 'Klik langsung pada peta interaktif (Jalan / Topo / Satelit) atau geser pin untuk meletakkan Segitiga Start, Lingkaran Pos CP1..CPn (beserta nilai poin & radius GPS), dan Lingkaran Ganda Finish.',
        },
        {
          heading: 'C. Cetak Lembar QR Massal A4 (2 s/d 8 QR per Halaman):',
          body: 'Klik tombol Cetak Semua QR untuk menghasilkan lembar siap cetak berisi SETUP QR, START QR, seluruh POS CP QR, dan FINISH QR dalam satu dokumen A4 rapi.',
        },
      ],
    },
    {
      badge: 'MODUL ORGANIZER - LANGKAH 3 (TAB 3)',
      title: 'Organizer Tab 3: Mass Start 1-Klik, Radar Monitoring, & Override',
      subtitle:
        'Melepas ratusan peserta serentak, memantau posisi tim di lapangan, dan intervensi darurat estafet',
      imageUrl: IMG_ORG_3,
      bullets: [
        {
          heading: 'A. Pelepasan Serentak 1-Klik (Tombol Mass Start):',
          body: 'Klik tombol hijau Mass Start Course Ini lalu konfirmasi Lepas Serentak Sekarang. Seluruh tim yang berstatus Siap Start (sudah Scan Setup QR) langsung berubah menjadi ACTIVE dengan waktu Start yang persis sama detik itu juga.',
        },
        {
          heading: 'B. Peta Radar Live Monitoring Hemat Baterai:',
          body: 'Menampilkan posisi terakhir setiap tim di atas peta lintasan (diperbarui berkala setiap 5 menit dan instan setiap kali peserta scan QR pos) lengkap dengan indikator peringatan jika sinyal tim belum diperbarui >5 menit.',
        },
        {
          heading: 'C. Tombol Override Darurat Panitia (Khusus Mode Relay):',
          body: 'Jika HP pelari estafet mati total di lapangan, panitia dapat menekan tombol Override untuk Membuka Kunci Giliran Sub-Team berikutnya (Unlock), Force Finish, atau Force DNF.',
        },
      ],
    },
    {
      badge: 'MODUL ORGANIZER - LANGKAH 4 (TAB 4)',
      title: 'Organizer Tab 4: Leaderboard, Split Time, Live TV, & CSV',
      subtitle:
        'Klasemen resmi otomatis, analisis Split Time antar-pos, tayangan Live TV penonton, dan Export Excel',
      imageUrl: IMG_ORG_4,
      bullets: [
        {
          heading: 'A. Pemeringkatan Otomatis & Filter Kategori:',
          body: 'Urutan juara dihitung otomatis berdasarkan Status FINISHED -> Skor Akhir Bersih Tertinggi -> Waktu Tempuh Tercepat. Tersedia filter instan berdasarkan Gender dan Kelompok Umur.',
        },
        {
          heading: 'B. Tabel Split Time Antar-Pos & Pop-Up Detail Peserta:',
          body: 'Tombol Show Split (#1..#N) menampilkan waktu kumulatif dan waktu tempuh antar-pos setiap tim hingga Finish Split. Klik Nama Tim untuk melihat Pop-Up Detail Peserta beserta nomor WhatsApp dan tabel split individu.',
        },
        {
          heading: 'C. Layar Penuh Live TV Penonton & Export CSV:',
          body: 'Gunakan Layar Penuh Penonton (Live TV) dengan fitur Auto-Scroll untuk layar monitor di tenda Finish, Bagikan Link QR Penonton untuk diakses publik dari HP, dan Export Hasil (CSV) untuk laporan resmi Excel.',
        },
      ],
    },
    {
      badge: 'LAMPIRAN KHUSUS NOTEBOOKLM',
      title: 'Kumpulan Prompt Siap Pakai untuk Google NotebookLM',
      subtitle:
        'Unggah file PDF atau Markdown panduan ini ke notebooklm.google.com lalu gunakan prompt berikut',
      bullets: [
        {
          heading: 'PROMPT 1 - Membuat Slide Presentasi PowerPoint (PPTX 14 Slide):',
          body: PROMPT_NOTEBOOKLM_PPTX.replace(/\n+/g, ' '),
        },
        {
          heading: 'PROMPT 2 - Membuat Audio Overview / Podcast Briefing Teknis:',
          body: PROMPT_NOTEBOOKLM_AUDIO.replace(/\n+/g, ' '),
        },
        {
          heading: 'PROMPT 3 - Membuat Pesan Broadcast WhatsApp Peserta (H-1 Lomba):',
          body: PROMPT_NOTEBOOKLM_WA.replace(/\n+/g, ' '),
        },
      ],
    },
  ];

  // Muat ke-8 gambar secara paralel dan konversi ke baseline JPEG
  const uniqueUrls = Array.from(
    new Set(pagesSpec.map((p) => p.imageUrl).filter((u): u is string => Boolean(u)))
  );
  const loadedImagesMap = new Map<string, LoadedJpegAsset>();
  await Promise.all(
    uniqueUrls.map(async (u) => {
      const asset = await loadImageAsBaselineJpeg(u);
      if (asset) {
        loadedImagesMap.set(u, asset);
      }
    })
  );

  // Susun objek-objek PDF 1.4
  // Obj 1: Catalog, Obj 2: Pages, Obj 3: Helvetica, Obj 4: Helvetica-Bold
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;
  const objOffsets: number[] = [0]; // 1-indexed

  const pushStr = (s: string) => {
    const arr = encoder.encode(s);
    chunks.push(arr);
    byteOffset += arr.byteLength;
  };
  const pushBytes = (arr: Uint8Array) => {
    chunks.push(arr);
    byteOffset += arr.byteLength;
  };

  pushStr('%PDF-1.4\n');
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // Reserve IDs:
  // 1: Catalog
  // 2: Pages
  // 3: Font F1 (Helvetica)
  // 4: Font F2 (Helvetica-Bold)
  let nextObjId = 5;
  const imageObjIds = new Map<string, number>();
  for (const u of uniqueUrls) {
    if (loadedImagesMap.has(u)) {
      imageObjIds.set(u, nextObjId++);
    }
  }

  const pageEntries = pagesSpec.map((spec) => {
    const pageObjId = nextObjId++;
    const contentObjId = nextObjId++;
    return { spec, pageObjId, contentObjId };
  });

  // Obj 1: Catalog
  objOffsets[1] = byteOffset;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  objOffsets[2] = byteOffset;
  const kidsRef = pageEntries.map((p) => `${p.pageObjId} 0 R`).join(' ');
  pushStr(
    `2 0 obj\n<< /Type /Pages /Kids [ ${kidsRef} ] /Count ${pageEntries.length} >>\nendobj\n`
  );

  // Obj 3: Font F1 (Helvetica)
  objOffsets[3] = byteOffset;
  pushStr(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n'
  );

  // Obj 4: Font F2 (Helvetica-Bold)
  objOffsets[4] = byteOffset;
  pushStr(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n'
  );

  // Image XObjects
  for (const [url, objId] of imageObjIds.entries()) {
    const asset = loadedImagesMap.get(url)!;
    objOffsets[objId] = byteOffset;
    pushStr(
      `${objId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${asset.width} /Height ${asset.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${asset.bytes.byteLength} >>\nstream\n`
    );
    pushBytes(asset.bytes);
    pushStr('\nendstream\nendobj\n');
  }

  // Page & Content Objects (A4: 595.28 x 841.89 pt)
  const pageW = 595.28;
  const pageH = 841.89;
  const marginX = 36;
  const usableW = pageW - marginX * 2;

  pageEntries.forEach(({ spec, pageObjId, contentObjId }, pageIdx) => {
    const ops: string[] = [];

    // Header Banner Navy (#061529)
    ops.push('0.024 0.082 0.161 rg');
    ops.push(`0 ${pageH - 78} ${pageW} 78 re f`);

    // Garis Aksen Oranye (#ff6b00) di bawah banner
    ops.push('1 0.42 0 rg');
    ops.push(`0 ${pageH - 81} ${pageW} 3 re f`);

    // Badge Atas (Kuning Emas)
    ops.push('0.98 0.75 0.14 rg');
    ops.push(
      `BT /F2 9 Tf ${marginX} ${pageH - 24} Td (${sanitizePdfText(
        spec.badge
      )}) Tj ET`
    );

    // Judul Halaman (Putih)
    ops.push('1 1 1 rg');
    ops.push(
      `BT /F2 15 Tf ${marginX} ${pageH - 45} Td (${sanitizePdfText(
        spec.title
      )}) Tj ET`
    );

    // Subjudul Halaman (Biru Muda)
    ops.push('0.75 0.88 0.98 rg');
    ops.push(
      `BT /F1 9.5 Tf ${marginX} ${pageH - 63} Td (${sanitizePdfText(
        spec.subtitle
      )}) Tj ET`
    );

    let cursorY = pageH - 100;

    // Gambar Screenshot jika ada
    const imgObjId = spec.imageUrl ? imageObjIds.get(spec.imageUrl) : undefined;
    const imgAsset = spec.imageUrl ? loadedImagesMap.get(spec.imageUrl) : undefined;
    if (imgObjId && imgAsset) {
      const maxImgH = 265;
      const maxImgW = usableW;
      const scale = Math.min(maxImgW / imgAsset.width, maxImgH / imgAsset.height);
      const drawW = Math.round(imgAsset.width * scale);
      const drawH = Math.round(imgAsset.height * scale);
      const drawX = Math.round(marginX + (usableW - drawW) / 2);
      const drawY = Math.round(cursorY - drawH);

      // Bingkai Latar Gambar
      ops.push('0.94 0.96 0.98 rg');
      ops.push(`${drawX - 4} ${drawY - 4} ${drawW + 8} ${drawH + 8} re f`);

      ops.push('q');
      ops.push(`${drawW} 0 0 ${drawH} ${drawX} ${drawY} cm`);
      ops.push(`/Im1 Do`);
      ops.push('Q');

      cursorY = drawY - 22;
    } else {
      cursorY -= 8;
    }

    // Kotak Poin Penjelasan
    for (const item of spec.bullets) {
      if (cursorY < 75) break;

      // Sub-heading (Biru Tua Tebal)
      ops.push('0.04 0.16 0.32 rg');
      ops.push(
        `BT /F2 11 Tf ${marginX} ${cursorY} Td (${sanitizePdfText(
          item.heading
        )}) Tj ET`
      );
      cursorY -= 15;

      // Isi paragraf terbungkus rapi
      const bodyLines = wrapTextLines(item.body, 92);
      ops.push('0.15 0.2 0.28 rg');
      for (const line of bodyLines) {
        if (cursorY < 52) break;
        ops.push(
          `BT /F1 9.8 Tf ${marginX + 8} ${cursorY} Td (${sanitizePdfText(
            line
          )}) Tj ET`
        );
        cursorY -= 13.5;
      }
      cursorY -= 9;
    }

    // Footer Halaman
    ops.push('0.45 0.52 0.6 rg');
    ops.push(
      `BT /F1 8.5 Tf ${marginX} 24 Td (ORIENTRA Digital Orienteering & Race Platform - Halaman ${
        pageIdx + 1
      } dari ${pageEntries.length}) Tj ET`
    );

    const contentStream = ops.join('\n');
    const contentBytes = encoder.encode(contentStream);

    // Page Object
    objOffsets[pageObjId] = byteOffset;
    const xObjectDict = imgObjId ? `/XObject << /Im1 ${imgObjId} 0 R >>` : '';
    pushStr(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjectDict} >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // Content Object
    objOffsets[contentObjId] = byteOffset;
    pushStr(
      `${contentObjId} 0 obj\n<< /Length ${contentBytes.byteLength} >>\nstream\n`
    );
    pushBytes(contentBytes);
    pushStr('\nendstream\nendobj\n');
  });

  // XREF Table
  const xrefStart = byteOffset;
  const totalObjs = nextObjId;
  pushStr(`xref\n0 ${totalObjs}\n0000000000 65535 f \n`);
  for (let i = 1; i < totalObjs; i++) {
    const offStr = String(objOffsets[i] || 0).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  return new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
}

export function TutorialGuideModal({ onClose }: TutorialGuideModalProps) {
  const [activeSection, setActiveSection] = useState<
    'PESERTA' | 'ORGANIZER' | 'NOTEBOOKLM'
  >('PESERTA');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2200);
  };

  const handleDownloadMarkdown = () => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const mdContent = buildFullMarkdownContent(origin);
    const blob = new Blob([mdContent], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'panduan_peserta_orientra_pptx.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const pdfBlob = await generateIllustratedPdfBlob();
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Buku_Panduan_Lengkap_ORIENTRA.pdf';
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadSingleImage = (imgUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = filename;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2.5 sm:p-5 overflow-y-auto">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-sky-500/40 bg-[#061529] text-slate-100 shadow-2xl overflow-hidden">
        {/* HEADER MODAL */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#040f1e] px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">
                Buku Panduan Bergambar &amp; Prompt NotebookLM (PPTX)
              </h2>
              <p className="text-[11px] text-sky-300/90">
                Tutorial Lengkap Peserta + Organizer (8 Screenshot UI) • Siap Diunduh (.PDF &amp; .MD)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-950/50 transition cursor-pointer disabled:opacity-60"
              title="Unduh langsung file Buku_Panduan_Lengkap_ORIENTRA.pdf (10 Halaman Lengkap dengan 8 Gambar Screenshot)"
            >
              {isGeneratingPdf ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Menyiapkan PDF Bergambar...</span>
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  <span>Download Buku Panduan (.PDF Bergambar)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-500 hover:from-emerald-400 hover:to-lime-400 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
              title="Unduh file Markdown (.md) untuk Google NotebookLM"
            >
              <Download className="h-4 w-4" />
              <span>Download (.MD)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 p-2 text-slate-300 hover:text-white transition cursor-pointer"
              title="Tutup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* NAVIGASI SUB-TAB */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/90 px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSection('PESERTA')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                activeSection === 'PESERTA'
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>1. Tutorial Peserta (4 Gambar)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('ORGANIZER')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                activeSection === 'ORGANIZER'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>2. Tutorial Organizer / Panitia (4 Gambar)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('NOTEBOOKLM')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                activeSection === 'NOTEBOOKLM'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>3. Prompt NotebookLM (PPTX / Audio / WA)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              handleCopyText(
                'FULL_MD',
                buildFullMarkdownContent(
                  typeof window !== 'undefined' ? window.location.origin : ''
                )
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 cursor-pointer"
          >
            {copiedKey === 'FULL_MD' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Tersalin ke Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Salin Semua Teks (.md)</span>
              </>
            )}
          </button>
        </div>

        {/* ISI PANDUAN (BISA DI-SCROLL) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* BAGIAN 1: TUTORIAL PESERTA */}
          {activeSection === 'PESERTA' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-slate-200 leading-relaxed flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong className="text-amber-300">
                    Unduh Langsung PDF Bergambar (10 Halaman A4):
                  </strong>{' '}
                  Klik tombol oranye{' '}
                  <strong>Download Buku Panduan (.PDF Bergambar)</strong> di kanan
                  atas untuk mengunduh file PDF yang sudah memuat seluruh teks dan
                  ke-8 gambar <em>screenshot</em> di bawah ini!
                </div>
              </div>

              {/* LANGKAH 1 PESERTA */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-emerald-400 font-bold">
                      Langkah 1 Peserta
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Persiapan HP, Login Tim, &amp; Scan Setup QR Course
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleImage(
                        IMG_PESERTA_1,
                        'Peserta_Langkah_1_Login_Setup_QR.jpg'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-sky-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Unduh Gambar Langkah 1
                  </button>
                </div>

                <img
                  src={IMG_PESERTA_1}
                  alt="Langkah 1 Peserta: Login Tim & Scan Setup QR"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl border border-slate-800 bg-slate-950"
                />

                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>Checklist HP di Garis Start:</strong> Baterai minimal 80%, aktifkan GPS Akurasi Tinggi, buka Chrome/Safari dan pilih <strong>Allow / Izinkan</strong> untuk Kamera &amp; Lokasi.
                  </li>
                  <li>
                    <strong>Daftar Mandiri / Login Tim:</strong> Masukkan <strong>Nama Tim</strong> dan <strong>Password Tim (min. 6 karakter)</strong> lalu ketuk <strong>Masuk ke Sesi Lomba</strong>.
                  </li>
                  <li>
                    <strong>Scan Setup QR Course (Di Meja Registrasi):</strong> Ketuk tombol hijau <strong>1. SCAN SETUP QR COURSE</strong> untuk menyimpan seluruh titik pos &amp; peta ke memori lokal HP (siap 100% <em>Offline</em> di tengah hutan).
                  </li>
                  <li>
                    <strong>Khusus Mode Estafet (Relay):</strong> Pilih <strong>Nama Tim Induk</strong> (fitur <em>Anti-Typo</em>) dan nomor urut <strong>Sub-Team (#1, #2, #3)</strong>.
                  </li>
                </ul>
              </div>

              {/* LANGKAH 2 PESERTA */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-emerald-400 font-bold">
                      Langkah 2 Peserta
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Mulai Lomba (Start / Mass Start), Kokpit Hybrid V4, &amp; Tombol 🔦 Senter QR
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleImage(
                        IMG_PESERTA_2,
                        'Peserta_Langkah_2_Kokpit_dan_Senter_QR.jpg'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-sky-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Unduh Gambar Langkah 2
                  </button>
                </div>

                <img
                  src={IMG_PESERTA_2}
                  alt="Langkah 2 Peserta: Kokpit Pelari Hybrid V4 & Senter QR"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl border border-slate-800 bg-slate-950"
                />

                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>2 Metode Mulai Waktu (Start):</strong> Bisa dengan memindai papan <strong>START QR</strong> di gerbang pelepasan, atau otomatis berjalan serentak ketika panitia menekan tombol <strong>🚀 Mass Start</strong>.
                  </li>
                  <li>
                    <strong>Kokpit Pelari Hybrid V4:</strong> Menampilkan Stopwatch kuning besar, sisa waktu mundur (<em>Cut-Off</em>), tombol <strong>🔒 Kunci Layar</strong>, dan tombol hijau ekstra besar <strong>📷 SCAN QR POS / FINISH</strong>.
                  </li>
                  <li>
                    <strong>Tombol 🔦 Senter (Flashlight + Screen Light Ring):</strong> Saat scan QR di tempat gelap/rimbun/gua/malam hari, ketuk tombol kuning <strong>🔦 Nyalakan Senter / Flash Kamera</strong> di bawah kotak bidik untuk menyalakan lampu LED kamera + ring cahaya layar.
                  </li>
                </ul>
              </div>

              {/* LANGKAH 3 PESERTA */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-emerald-400 font-bold">
                      Langkah 3 Peserta
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Navigasi Peta Digital Interaktif &amp; Mode Kunci Saku OLED (Hemat Baterai)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleImage(
                        IMG_PESERTA_3,
                        'Peserta_Langkah_3_Peta_dan_Kunci_Saku.jpg'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-sky-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Unduh Gambar Langkah 3
                  </button>
                </div>

                <img
                  src={IMG_PESERTA_3}
                  alt="Langkah 3 Peserta: Navigasi Peta & Mode Kunci Saku OLED"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl border border-slate-800 bg-slate-950"
                />

                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>3 Mode Peta &amp; 2 Tombol Taktis:</strong> Beralih antara <strong>Peta Jalan</strong>, <strong>Satelit</strong>, dan <strong>Topo (Kontur)</strong> di kiri atas; gunakan tombol <strong>🎯 GPS Saya</strong> dan <strong>⛶ Semua Pos</strong> di kanan atas.
                  </li>
                  <li>
                    <strong>Mode Kunci Saku OLED (0-Watt):</strong> Ketuk <strong>🔒 Kunci Layar</strong> saat berlari menuju pos berikutnya agar layar hitam pekat, hemat baterai hingga 70%, dan anti-terpencet keringat. Tahan 1 detik tombol bawah untuk langsung membuka kamera QR.
                  </li>
                </ul>
              </div>

              {/* LANGKAH 4 PESERTA */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-emerald-400 font-bold">
                      Langkah 4 Peserta
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Scan Finish, Tabel Rincian Split Time Antar-Pos, &amp; Bukti PNG
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleImage(
                        IMG_PESERTA_4,
                        'Peserta_Langkah_4_Finish_dan_Split_Time.jpg'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-sky-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Unduh Gambar Langkah 4
                  </button>
                </div>

                <img
                  src={IMG_PESERTA_4}
                  alt="Langkah 4 Peserta: Kartu Selesai Lomba & Rincian Split Time"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl border border-slate-800 bg-slate-950"
                />

                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>Tabel Rincian Split Time Antar-Pos:</strong> Begitu memindai <strong>FINISH QR</strong>, kartu selesai lomba otomatis menyajikan waktu tempuh murni dari pos ke pos (<em>+Split Antar-Pos</em>), lencana <strong>⚡ Tercepat</strong> pada leg terbaik, serta <em>Waktu Kumulatif</em>.
                  </li>
                  <li>
                    <strong>Anti-Manipulasi Jam HP:</strong> Dilindungi pengaman <em>Monotonic Clock</em> (<code>performance.now()</code>) sehingga memundurkan jam HP saat <em>offline</em> tidak dapat memotong durasi lari.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* BAGIAN 2: TUTORIAL ORGANIZER / PANITIA */}
          {activeSection === 'ORGANIZER' && (
            <div className="space-y-6">
              {/* LANGKAH 1 ORGANIZER */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-amber-400 font-bold">
                      Langkah 1 Organizer (Tab 1)
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Ringkasan Course, Kelola Akun Peserta, &amp; Akses Cepat Mass Start
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleImage(
                        IMG_ORG_1,
                        'Organizer_Tab_1_Dashboard_dan_Peserta.jpg'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-amber-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Unduh Gambar Tab 1
                  </button>
                </div>

                <img
                  src={IMG_ORG_1}
                  alt="Langkah 1 Organizer: Dashboard & Peserta"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl border border-slate-800 bg-slate-950"
                />

                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>4 Indikator Utama:</strong> Pantau langsung jumlah peserta terdaftar, sesi sedang aktif berlomba (beserta jumlah tim <em>Siap Start</em>), sesi sudah Finish, dan jumlah titik pos.
                  </li>
                  <li>
                    <strong>Manajemen Akun Tim:</strong> Daftarkan tim peserta sebelum lomba, reset password tim yang lupa, atau buka lembar cetak QR massal dalam 1 klik.
                  </li>
                </ul>
              </div>

              {/* LANGKAH 2 ORGANIZER */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-amber-400 font-bold">
                      Langkah 2 Organizer (Tab 2)
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Perancang Peta Course Interaktif, Pengaturan Relay/Penalti, &amp; Cetak QR A4
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleImage(
                        IMG_ORG_2,
                        'Organizer_Tab_2_Peta_Course_dan_Cetak_QR.jpg'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-amber-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Unduh Gambar Tab 2
                  </button>
                </div>

                <img
                  src={IMG_ORG_2}
                  alt="Langkah 2 Organizer: Course & Peta Pos"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl border border-slate-800 bg-slate-950"
                />

                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>Aturan Course Fleksibel:</strong> Pilih metode validasi (<code>QR_ONLY</code>, <code>QR_AND_GPS</code>, <code>QR_OR_GPS</code>, <code>GPS_AUTO</code>), urutan pos (Wajib Urut vs Bebas Score-O), batas waktu &amp; potongan penalti per menit, serta Mode Reguler atau Relay Estafet.
                  </li>
                  <li>
                    <strong>Klik Peta &amp; Cetak QR Massal:</strong> Tempatkan pin Start (△), Pos CP (⭕), dan Finish (◎) langsung di atas peta, lalu cetak seluruh QR Code dalam format lembar A4 (2–8 QR per halaman).
                  </li>
                </ul>
              </div>

              {/* LANGKAH 3 ORGANIZER */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-amber-400 font-bold">
                      Langkah 3 Organizer (Tab 3)
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Pelepasan Serentak (🚀 Mass Start 1-Klik), Radar Live Monitoring, &amp; Override
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleImage(
                        IMG_ORG_3,
                        'Organizer_Tab_3_Monitoring_dan_Mass_Start.jpg'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-amber-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Unduh Gambar Tab 3
                  </button>
                </div>

                <img
                  src={IMG_ORG_3}
                  alt="Langkah 3 Organizer: Live Monitoring & Mass Start"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl border border-slate-800 bg-slate-950"
                />

                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>Tombol 🚀 Mass Start (1-Klik):</strong> Melepas seluruh peserta yang sudah Scan Setup QR secara serentak tanpa perlu antre scan di gerbang Start.
                  </li>
                  <li>
                    <strong>Radar Telemetri &amp; Override Estafet:</strong> Pantau posisi terakhir setiap tim di peta dan gunakan tombol <strong>🔓 Override</strong> jika ada HP pelari estafet yang kehabisan baterai di lapangan.
                  </li>
                </ul>
              </div>

              {/* LANGKAH 4 ORGANIZER */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-amber-400 font-bold">
                      Langkah 4 Organizer (Tab 4)
                    </span>
                    <h3 className="text-base font-extrabold text-white">
                      Klasemen Resmi, Tabel Split Time Antar-Pos, Live TV Arena, &amp; Export CSV
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleImage(
                        IMG_ORG_4,
                        'Organizer_Tab_4_Leaderboard_Split_Time.jpg'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-amber-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Unduh Gambar Tab 4
                  </button>
                </div>

                <img
                  src={IMG_ORG_4}
                  alt="Langkah 4 Organizer: Leaderboard & Split Time"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-96 object-contain rounded-xl border border-slate-800 bg-slate-950"
                />

                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>
                    <strong>Kolom Rincian Split Time:</strong> Menampilkan waktu kumulatif dan <em>split time</em> dari pos ke pos hingga garis Finish untuk setiap tim.
                  </li>
                  <li>
                    <strong>Live TV Arena &amp; Link Penonton:</strong> Tayangkan klasemen layar penuh dengan <em>Auto-Scroll</em> di layar TV tenda Finish, bagikan QR Link Penonton, atau unduh laporan CSV/Excel.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* BAGIAN 3: PROMPT NOTEBOOKLM */}
          {activeSection === 'NOTEBOOKLM' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-purple-500/40 bg-purple-950/25 p-4 text-xs text-purple-100 space-y-1.5">
                <div className="font-bold text-sm text-purple-200 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-300" />
                  <span>Cara Menggunakan di Google NotebookLM:</span>
                </div>
                <ol className="list-decimal pl-5 space-y-1 text-slate-200">
                  <li>
                    Klik tombol oranye{' '}
                    <strong>Download Buku Panduan (.PDF Bergambar)</strong> atau
                    tombol hijau <strong>Download (.MD)</strong> di pojok kanan
                    atas jendela ini.
                  </li>
                  <li>
                    Buka{' '}
                    <strong className="text-amber-300">
                      notebooklm.google.com
                    </strong>
                    , buat Notebook baru, lalu unggah file{' '}
                    <code>Buku_Panduan_Lengkap_ORIENTRA.pdf</code> atau{' '}
                    <code>panduan_peserta_orientra_pptx.md</code> tersebut sebagai{' '}
                    <strong>Source (Sumber)</strong>.
                  </li>
                  <li>
                    Salin salah satu <strong>Prompt</strong> di bawah ini dan
                    tempelkan ke kolom chat NotebookLM.
                  </li>
                </ol>
              </div>

              {/* PROMPT 1 */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs sm:text-sm font-extrabold text-amber-300">
                    Prompt 1: Struktur Slide Presentasi PowerPoint (PPTX — 14 Slide Lengkap)
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText('P1', PROMPT_NOTEBOOKLM_PPTX)
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-slate-950 cursor-pointer"
                  >
                    {copiedKey === 'P1' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Prompt PPTX</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] font-mono text-slate-200 border border-slate-800">
                  {PROMPT_NOTEBOOKLM_PPTX}
                </pre>
              </div>

              {/* PROMPT 2 */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs sm:text-sm font-extrabold text-sky-300">
                    Prompt 2: Customize Audio Overview / Podcast Briefing Teknis
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText('P2', PROMPT_NOTEBOOKLM_AUDIO)
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 px-3 py-1.5 text-xs font-extrabold text-slate-950 cursor-pointer"
                  >
                    {copiedKey === 'P2' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Prompt Audio</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] font-mono text-slate-200 border border-slate-800">
                  {PROMPT_NOTEBOOKLM_AUDIO}
                </pre>
              </div>

              {/* PROMPT 3 */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs sm:text-sm font-extrabold text-emerald-300">
                    Prompt 3: Broadcast WhatsApp "Panduan Cepat 1 Menit Peserta" (H-1 Lomba)
                  </h4>
                  <button
                    type="button"
                    onClick={() => handleCopyText('P3', PROMPT_NOTEBOOKLM_WA)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-extrabold text-slate-950 cursor-pointer"
                  >
                    {copiedKey === 'P3' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Prompt WA</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] font-mono text-slate-200 border border-slate-800">
                  {PROMPT_NOTEBOOKLM_WA}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
