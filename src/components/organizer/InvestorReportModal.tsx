import React, { useMemo, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Mic,
  Presentation,
  Printer,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  AllTimePlatformStats,
  CheckpointReport,
  Course,
  ORIENTEERING_AGE_GROUPS,
  OrganizerPublic,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus,
} from '../../types';

interface InvestorReportModalProps {
  courses: Course[];
  organizers: OrganizerPublic[];
  participants: ParticipantPublic[];
  sessions: ParticipantSession[];
  reports: CheckpointReport[];
  allTimeStats?: AllTimePlatformStats;
  onClose: () => void;
}

type ModalTab = 'EXECUTIVE_REPORT' | 'NOTEBOOK_LM';

export function InvestorReportModal({
  courses,
  organizers,
  participants,
  sessions,
  reports,
  allTimeStats,
  onClose,
}: InvestorReportModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('EXECUTIVE_REPORT');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const triggerCopyFeedback = (key: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2500);
  };

  // Kalkulasi Komprehensif Metrik Investor (Menggabungkan All-Time Ledger + Data Aktif)
  const metrics = useMemo(() => {
    const totalOrganizersEver = Math.max(
      allTimeStats?.totalOrganizersEver || 0,
      organizers.length
    );
    const totalCoursesEver = Math.max(
      allTimeStats?.totalCoursesEver || 0,
      courses.length
    );
    const totalParticipantsEver = Math.max(
      allTimeStats?.totalParticipantsEver || 0,
      participants.length
    );
    const totalSessionsEver = Math.max(
      allTimeStats?.totalSessionsEver || 0,
      sessions.length
    );

    // Rekap Lokasi Lomba
    const locMap = new Map<
      string,
      { locationName: string; coursesCount: number; lastUsedDate?: string }
    >();

    if (allTimeStats?.locations && allTimeStats.locations.length > 0) {
      allTimeStats.locations.forEach((loc) => {
        if (loc.locationName?.trim()) {
          locMap.set(loc.locationName.trim().toLowerCase(), { ...loc });
        }
      });
    } else {
      courses.forEach((c) => {
        const cleanLoc = (c.locationName || '').trim();
        if (!cleanLoc) return;
        const key = cleanLoc.toLowerCase();
        const existing = locMap.get(key);
        if (!existing) {
          locMap.set(key, {
            locationName: cleanLoc,
            coursesCount: 1,
            lastUsedDate: c.date,
          });
        } else {
          existing.coursesCount += 1;
          if (
            c.date &&
            (!existing.lastUsedDate || c.date > existing.lastUsedDate)
          ) {
            existing.lastUsedDate = c.date;
          }
        }
      });
    }

    const locationsList = Array.from(locMap.values()).sort(
      (a, b) => b.coursesCount - a.coursesCount
    );

    // Rekap Organizer Historis + Aktif
    const rawOrgs =
      allTimeStats?.organizers && allTimeStats.organizers.length > 0
        ? allTimeStats.organizers
        : organizers;

    const orgList = rawOrgs.map((o, idx) => {
      const liveOrg = organizers.find((lo) => lo.id === o.id);
      const count = courses.filter((c) => c.createdByOrganizerId === o.id).length;
      return {
        id: o.id,
        code: liveOrg?.code || `ORG-${String(idx + 1).padStart(2, '0')}`,
        name: o.name,
        organization: o.organization || liveOrg?.organization,
        isActive: liveOrg ? liveOrg.isActive : o.isActive,
        coursesCount: count,
      };
    });

    // Metrik Operasional & Engagement
    const totalCheckpointsActive = courses.reduce(
      (sum, c) => sum + c.checkpoints.length,
      0
    );
    const validCheckpointScans = reports.filter((r) => r.serverVerified).length;
    const totalScansRecorded = Math.max(
      validCheckpointScans,
      sessions.reduce(
        (sum, s) => sum + (s.validatedCheckpointIds?.length || 0),
        0
      )
    );

    const startedSessions = sessions.filter(
      (s) =>
        s.status === SessionStatus.ACTIVE || s.status === SessionStatus.FINISHED
    );
    const finishedCleanSessions = sessions.filter(
      (s) => s.status === SessionStatus.FINISHED && !s.isDnf
    );
    const activeRunningSessions = sessions.filter(
      (s) => s.status === SessionStatus.ACTIVE && !s.isDnf
    );
    const completionRate =
      startedSessions.length > 0
        ? Math.round(
            (finishedCleanSessions.length / startedSessions.length) * 100
          )
        : 100;

    const avgParticipantsPerCourse =
      totalCoursesEver > 0
        ? (totalParticipantsEver / totalCoursesEver).toFixed(1)
        : '0';
    const avgCheckpointsPerCourse =
      courses.length > 0
        ? (totalCheckpointsActive / courses.length).toFixed(1)
        : '0';

    // Demografi Gender
    const genderCounts = {
      Male: participants.filter((p) => p.gender === 'Male').length,
      Female: participants.filter((p) => p.gender === 'Female').length,
      Other: participants.filter(
        (p) => !p.gender || (p.gender !== 'Male' && p.gender !== 'Female')
      ).length,
    };

    // Demografi Kelompok Umur
    const ageGroupCounts = ORIENTEERING_AGE_GROUPS.map((ag) => {
      const count = participants.filter(
        (p) => (p.ageGroup || 'Semua Umur') === ag
      ).length;
      const pct =
        participants.length > 0
          ? Math.round((count / participants.length) * 100)
          : 0;
      return { ageGroup: ag, count, pct };
    }).filter((item) => item.count > 0);

    const generatedDateStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return {
      totalOrganizersEver,
      activeOrganizersCount: organizers.filter((o) => o.isActive).length,
      totalCoursesEver,
      activeCoursesCount: courses.length,
      totalParticipantsEver,
      activeParticipantsCount: participants.length,
      totalSessionsEver,
      totalLocationsEver: locationsList.length,
      locationsList,
      orgList,
      totalCheckpointsActive,
      totalScansRecorded,
      startedSessionsCount: startedSessions.length,
      finishedCleanSessionsCount: finishedCleanSessions.length,
      activeRunningSessionsCount: activeRunningSessions.length,
      completionRate,
      avgParticipantsPerCourse,
      avgCheckpointsPerCourse,
      genderCounts,
      ageGroupCounts,
      generatedDateStr,
    };
  }, [allTimeStats, courses, organizers, participants, sessions, reports]);

  // Dokumen Sumber (Source Document) terstruktur untuk diunggah ke Google NotebookLM
  const notebookLmSourceDocument = useMemo(() => {
    const locLines =
      metrics.locationsList.length > 0
        ? metrics.locationsList
            .map(
              (l, idx) =>
                `  ${idx + 1}. ${l.locationName} (${l.coursesCount} Course diselenggarakan${
                  l.lastUsedDate ? `, terakhir: ${l.lastUsedDate}` : ''
                })`
            )
            .join('\n')
        : '  - Belum ada nama lokasi spesifik yang tercatat pada course.';

    const orgLines =
      metrics.orgList.length > 0
        ? metrics.orgList
            .map(
              (o, idx) =>
                `  ${idx + 1}. ${o.name} [Kode: ${o.code}]${
                  o.organization ? ` - Instansi/Klub: ${o.organization}` : ''
                } (${o.coursesCount} Course dibuat | Status: ${
                  o.isActive ? 'Aktif' : 'Nonaktif'
                })`
            )
            .join('\n')
        : '  - Seluruh course saat ini dikelola langsung oleh pusat (Superadmin).';

    const ageLines =
      metrics.ageGroupCounts.length > 0
        ? metrics.ageGroupCounts
            .map((a) => `  - Kategori ${a.ageGroup}: ${a.count} peserta (${a.pct}%)`)
            .join('\n')
        : '  - Belum ada rincian kategori umur.';

    return `# DOKUMEN EKSEKUTIF & DATA TRACTION: ORIENTRA (Digital Orienteering & Race Platform)
Tanggal Laporan Resmi: ${metrics.generatedDateStr}

## 1. PROFIL & VALUE PROPOSITION ORIENTRA
ORIENTRA adalah platform manajemen perlombaan orienteering, lintas alam (trail/adventure race), dan olahraga navigasi berbasis web & PWA (Progressive Web App) yang modern, tangguh di medan minim sinyal (Offline-First), dan dilengkapi sistem validasi anti-kecurangan (Hybrid QR Code + GPS Geolocation).

### Masalah Industri Orienteering & Lomba Navigasi Konvensional:
1. Rekapitulasi skor, waktu tempuh, dan split time antar-pos masih manual atau memakai perangkat keras impor yang sangat mahal.
2. Rawan kecurangan di lapangan (peserta memfoto QR code pos atau klaim tanpa benar-benar berada di titik koordinat pos).
3. Panitia dan penonton di garis finish "buta" terhadap posisi peserta yang sedang berlari di hutan/gunung karena tidak adanya sistem pelacakan hemat baterai.
4. Sulitnya skalabilitas bagi penyelenggara daerah/klub karena ketiadaan sistem manajemen multi-event yang praktis.

### Solusi & Keunggulan Teknologi ORIENTRA:
1. **Hybrid Anti-Cheat Validation (QR + GPS Radius)**: Memastikan peserta benar-benar berada di titik pos kontrol (Checkpoint) dengan validasi kode QR unik dan radius koordinat GPS secara simultan.
2. **Offline-First & Auto-Sync Queue**: Peserta tetap dapat melakukan scan Start, Pos CP, hingga Finish meskipun berada di tengah hutan/lembah tanpa sinyal internet; data tersinkronisasi otomatis begitu sinyal kembali.
3. **Real-Time 5-Minute Telemetry & Live Monitoring Map**: Mengirimkan titik koordinat terakhir peserta secara berkala setiap 5 menit dan setiap kali scan pos (sangat hemat baterai & kuota data) untuk dipantau langsung oleh panitia di peta interaktif.
4. **Instant Official Leaderboard & Split-Time Engine**: Menghitung peringkat otomatis berdasarkan status Finish, poin pos, penalti keterlambatan per menit (overtime penalty), waktu kumulatif, serta split time antar-pos (#1 s/d Finish), lengkap dengan layar Live TV Penonton.
5. **Arsitektur Multi-Organizer B2B/SaaS**: Superadmin dapat menerbitkan akun Organizer (kepanitiaan daerah, klub, sekolah, TNI/Polri, korporat) lengkap dengan pengaturan kuota jumlah Course dan masa aktif langganan (1–12 bulan atau Lifetime).

---

## 2. METRIK PERTUMBUHAN & TRACTION KUMULATIF (ALL-TIME PLATFORM LEDGER)
Data riil penggunaan platform ORIENTRA sejak awal dibuat hingga ${metrics.generatedDateStr}:

- **Total Mitra Penyelenggara (Organizer) Terdaftar**: ${metrics.totalOrganizersEver} Penyelenggara (${metrics.activeOrganizersCount} akun berstatus aktif saat ini)
- **Total Course / Lintasan Lomba Pernah Dibuat**: ${metrics.totalCoursesEver} Course (${metrics.activeCoursesCount} Course aktif di database saat ini dengan total ${metrics.totalCheckpointsActive} titik Pos Checkpoint)
- **Total Peserta / Tim Terdaftar Kumulatif**: ${metrics.totalParticipantsEver} Tim/Peserta
- **Total Sesi Lomba (Race Starts) Terekam**: ${metrics.totalSessionsEver} Sesi Lomba
- **Total Jangkauan Lokasi / Venue Unik**: ${metrics.totalLocationsEver} Lokasi Lomba
- **Total Aktivitas Validasi Pos (QR/GPS Scans)**: ${metrics.totalScansRecorded} kali scan pos tervalidasi
- **Tingkat Penyelesaian Lomba (Completion Rate)**: ${metrics.completionRate}% peserta berhasil mencapai garis Finish secara sah
- **Rata-rata Partisipan per Course**: ${metrics.avgParticipantsPerCourse} peserta/course
- **Rata-rata Titik Pos Kontrol per Course**: ${metrics.avgCheckpointsPerCourse} pos CP/course
- **Status Radar Live Saat Laporan Dicetak**: ${metrics.activeRunningSessionsCount} tim sedang berlari di lintasan, ${metrics.finishedCleanSessionsCount} sesi telah selesai (Finish).

---

## 3. JEJAK JANGKAUAN GEOGRAFIS (DAFTAR LOKASI YANG PERNAH MENGGUNAKAN ORIENTRA)
Total ${metrics.totalLocationsEver} lokasi/venue yang pernah menggelar perlombaan menggunakan ORIENTRA:
${locLines}

---

## 4. PORTOFOLIO MITRA PENYELENGGARA (ORGANIZER ADOPTION)
Daftar penyelenggara/instansi pengguna ekosistem ORIENTRA:
${orgLines}

---

## 5. DEMOGRAFI & SEGMEN PASAR PESERTA
Berdasarkan ${metrics.activeParticipantsCount} profil peserta aktif saat ini:
- **Komposisi Gender**: Putra (Male): ${metrics.genderCounts.Male} | Putri (Female): ${metrics.genderCounts.Female} | Umum/ Beregu (Other): ${metrics.genderCounts.Other}
- **Distribusi Kelompok Umur**:
${ageLines}

---

## 6. MODEL BISNIS & POTENSI EKSPANSI (UNTUK DISKUSI INVESTOR)
1. **B2B SaaS Subscription & Kuota Course**: Lisensi akun Organizer berbasis kuota Course (misal paket 1, 3, 5, 10 Course atau Unlimited) dan durasi masa aktif (1, 3, 6, 12 Bulan).
2. **Per-Participant / Event Ticketing Fee**: Biaya layanan platform per peserta terdaftar pada kejuaraan daerah maupun nasional.
3. **White-Label & Enterprise Self-Hosted Deployment**: Kesiapan penuh instalasi mandiri (Self-Hosted cPanel/Cloud) untuk instansi militer, pemerintah, federasi nasional (FONI), dan penyelenggara event olahraga skala besar.
`;
  }, [metrics]);

  // 3 Master Prompt untuk Google NotebookLM
  const notebookPrompts = useMemo(() => {
    return [
      {
        id: 'pitch-deck',
        badge: 'PROMPT 1 • PITCH DECK INVESTOR (10–12 SLIDE)',
        title: 'Prompt Pembuat Struktur Slide Presentasi Investor (Pitch Deck)',
        icon: Presentation,
        colorClass: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
        description:
          'Tempelkan prompt ini di kolom chat NotebookLM setelah Anda memasukkan Dokumen Sumber di atas. NotebookLM akan menyusun materi 12 slide lengkap dengan angka traction ORIENTRA dan catatan pembicara.',
        promptText: `Bertindaklah sebagai Konsultan Venture Capital & Startup Olahraga (SportsTech) senior. Berdasarkan dokumen sumber "DOKUMEN EKSEKUTIF & DATA TRACTION: ORIENTRA" yang tersedia di notebook ini, buatkan struktur materi presentasi Pitch Deck Investor yang sangat meyakinkan terdiri dari 12 Slide dalam Bahasa Indonesia yang profesional.

Untuk setiap slide, wajib tuliskan:
1. Judul Slide & Subjudul yang kuat (Headline)
2. Poin-Poin Utama di layar (Bullet points singkat, padat, dan berorientasi dampak)
3. Bukti Data / Angka Traction dari dokumen ORIENTRA (${metrics.totalOrganizersEver} Organizer, ${metrics.totalCoursesEver} Course, ${metrics.totalParticipantsEver} Peserta, ${metrics.totalLocationsEver} Lokasi Lomba, dan ${metrics.completionRate}% Completion Rate)
4. Saran Visual / Grafik yang sebaiknya ditampilkan di slide tersebut
5. Naskah Bicara Presenter (Speaker Notes) singkat selama 30-45 detik per slide.

Susunan 12 Slide yang harus dibuat:
- Slide 1: Cover & Positioning ORIENTRA ("The Digital Operating System for Orienteering & Adventure Races")
- Slide 2: Masalah Nyata di Industri Lomba Navigasi & Lintas Alam Saat Ini
- Slide 3: Solusi ORIENTRA (Ekosistem End-to-End dari Peta Pos hingga Live TV Leaderboard)
- Slide 4: Keunggulan Teknologi Utama (Hybrid QR+GPS Anti-Cheat & Offline-First di Hutan/Gunung)
- Slide 5: Fitur Keamanan & Penonton (5-Minute Live Telemetry Map & Split-Time Engine)
- Slide 6: Bukti Traction Kumulatif Sejak Awal (Highlight angka ${metrics.totalOrganizersEver} Organizer, ${metrics.totalCoursesEver} Course, ${metrics.totalParticipantsEver} Peserta, ${metrics.totalSessionsEver} Sesi)
- Slide 7: Jejak Geografis & Sebaran Lokasi Lomba (${metrics.totalLocationsEver} Lokasi yang pernah memakai ORIENTRA)
- Slide 8: Adopsi Mitra Penyelenggara & Demografi Pasar Peserta (Gender & Kelompok Umur)
- Slide 9: Model Bisnis B2B SaaS (Sistem Kuota Course, Masa Aktif Berlangganan 1–12 Bulan, & Paket Enterprise Self-Hosted)
- Slide 10: Peluang Pasar (Sekolah/Kampus, Klub Orienteering/FONI, Wisata Olahraga/Sport Tourism, TNI/Polri, Outbound Korporat)
- Slide 11: Roadmap Pengembangan Produk & Ekspansi Nasional
- Slide 12: Penutup & Ajakan Kemitraan / Investasi Strategis.`,
      },
      {
        id: 'sponsor-b2b',
        badge: 'PROMPT 2 • PROPOSAL SPONSOR, FEDERASI & PEMERINTAH',
        title: 'Prompt Presentasi Kemitraan Strategis (Sponsor / FONI / Dinas Pariwisata)',
        icon: Shield,
        colorClass: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
        description:
          'Gunakan prompt ini di NotebookLM jika audiens Anda adalah calon sponsor acara, pengurus federasi olahraga, atau instansi pemerintah/pariwisata.',
        promptText: `Berdasarkan dokumen sumber ORIENTRA di notebook ini, susunkan materi Presentasi & Proposal Kemitraan Strategis (8 Slide) yang ditujukan kepada Sponsor Utama, Federasi Orienteering (FONI/KONI), serta Dinas Pemuda, Olahraga & Pariwisata.

Tonjolkan poin-poin kunci berikut menggunakan data faktual dari sumber:
1. Rekam jejak nyata ORIENTRA yang telah digunakan oleh ${metrics.totalOrganizersEver} penyelenggara pada ${metrics.totalCoursesEver} lintasan course di ${metrics.totalLocationsEver} lokasi berbeda dengan total ${metrics.totalParticipantsEver} partisipan.
2. Transparansi & Fair-Play tingkat tinggi berkat validasi ganda QR Code + GPS Radius dan perhitungan Split-Time otomatis.
3. Daya tarik tinggi bagi penonton dan sponsor melalui fitur "Live TV Spectator Leaderboard" dan "Live Monitoring Pergerakan Peserta di Peta".
4. Rincian segmen usia dan gender peserta untuk menunjukkan kecocokan target audiens bagi brand sponsor.
5. Kemudahan bagi pengurus cabang/daerah untuk menggelar kejuaraan resmi melalui sistem akun Organizer terisolasi.`,
      },
      {
        id: 'audio-overview',
        badge: 'PROMPT 3 • CUSTOMIZE AUDIO OVERVIEW (PODCAST NOTEBOOKLM)',
        title: 'Prompt Instruksi "Customize Audio Overview" (Deep Dive Podcast)',
        icon: Mic,
        colorClass: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
        description:
          'Tempelkan teks ini ke tombol "Customize" pada fitur Audio Overview di NotebookLM agar kedua host AI mendiskusikan keunggulan & traction ORIENTRA secara memukau.',
        promptText: `Fokuskan diskusi mendalam (Deep Dive) ini untuk mengulas ORIENTRA sebagai inovasi teknologi olahraga (SportsTech) karya anak bangsa untuk lomba Orienteering dan Adventure Race. Bahas dengan antusias bagaimana ORIENTRA memecahkan masalah klasik lomba di alam bebas (seperti sinyal hilang di hutan dan kecurangan pos kontrol) menggunakan teknologi Offline-First dan Hybrid QR+GPS Validation. Sebutkan secara spesifik pencapaian traction ORIENTRA hingga saat ini: telah dipercaya oleh ${metrics.totalOrganizersEver} Organizer, menyelenggarakan ${metrics.totalCoursesEver} Course di ${metrics.totalLocationsEver} lokasi berbeda, dan melayani ${metrics.totalParticipantsEver} peserta. Akhiri dengan membahas mengapa model bisnis SaaS berbasis kuota Course pada ORIENTRA sangat menarik bagi investor dan masa depan Sport Tourism di Indonesia.`,
      },
    ];
  }, [metrics]);

  // Download Dokumen Sumber (.md) untuk di-upload ke NotebookLM
  const handleDownloadNotebookSource = (ext: 'md' | 'txt') => {
    const blob = new Blob([notebookLmSourceDocument], {
      type: 'text/plain;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateSlug = new Date().toISOString().slice(0, 10);
    link.download = `ORIENTRA-Investor-Source-NotebookLM-${dateSlug}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download CSV Ringkasan Investor
  const handleExportInvestorCsv = () => {
    const rows: string[][] = [
      ['LAPORAN EKSEKUTIF & TRACTION INVESTOR - ORIENTRA'],
      ['Tanggal Cetak', metrics.generatedDateStr],
      [],
      ['1. METRIK UTAMA KUMULATIF (SEJAK AWAL HINGGA SEKARANG)'],
      ['Metrik', 'Nilai', 'Keterangan'],
      [
        'Total Organizer Terdaftar (Kumulatif)',
        String(metrics.totalOrganizersEver),
        `${metrics.activeOrganizersCount} Organizer Aktif`,
      ],
      [
        'Total Course Pernah Dibuat (Kumulatif)',
        String(metrics.totalCoursesEver),
        `${metrics.activeCoursesCount} Course Aktif Saat Ini`,
      ],
      [
        'Total Peserta / Tim Terdaftar (Kumulatif)',
        String(metrics.totalParticipantsEver),
        'Akumulasi seluruh peserta sejak awal',
      ],
      [
        'Total Sesi Lomba / Race Starts (Kumulatif)',
        String(metrics.totalSessionsEver),
        `${metrics.finishedCleanSessionsCount} Finish Bersih`,
      ],
      [
        'Total Lokasi Lomba Unik',
        String(metrics.totalLocationsEver),
        'Jangkauan geografis pemakaian ORIENTRA',
      ],
      [
        'Total Validasi Scan Pos Checkpoint',
        String(metrics.totalScansRecorded),
        'Akumulasi scan QR + GPS valid',
      ],
      [
        'Completion Rate Peserta',
        `${metrics.completionRate}%`,
        'Rasio peserta Finish dibanding Start',
      ],
      [],
      ['2. DAFTAR LOKASI LOMBA YANG PERNAH DIPAKAI'],
      ['No', 'Nama Lokasi / Venue', 'Jumlah Course', 'Terakhir Dipakai'],
      ...metrics.locationsList.map((loc, i) => [
        String(i + 1),
        `"${loc.locationName.replace(/"/g, '""')}"`,
        String(loc.coursesCount),
        loc.lastUsedDate || '-',
      ]),
      [],
      ['3. PORTOFOLIO MITRA PENYELENGGARA (ORGANIZER)'],
      ['No', 'Kode', 'Nama Organizer', 'Instansi / Klub', 'Jumlah Course', 'Status'],
      ...metrics.orgList.map((o, i) => [
        String(i + 1),
        o.code,
        `"${o.name.replace(/"/g, '""')}"`,
        `"${(o.organization || '-').replace(/"/g, '""')}"`,
        String(o.coursesCount),
        o.isActive ? 'AKTIF' : 'NONAKTIF',
      ]),
    ];

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateSlug = new Date().toISOString().slice(0, 10);
    link.download = `ORIENTRA-Investor-Overview-Report-${dateSlug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Cetak / Simpan PDF (A4)
  const handlePrintExecutiveReport = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl border border-amber-500/40 bg-[#07162c] text-slate-100 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col print:max-h-none print:border-none print:bg-white print:text-slate-900 print:shadow-none">
        {/* Header Modal (Disembunyikan saat Print PDF) */}
        <div className="p-4 sm:p-5 bg-slate-950/90 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1 border border-amber-400/50 shrink-0 shadow">
              <img
                src="/orientra-logo.jpeg"
                alt="ORIENTRA Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  INVESTOR &amp; EXECUTIVE BRIEFING
                </span>
                <span className="text-xs font-mono text-slate-400">
                  • Per {metrics.generatedDateStr}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
                Laporan Overview Akumulasi Global ORIENTRA &amp; Generator Presentasi NotebookLM
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Tutup</span>
            </button>
          </div>
        </div>

        {/* Sub-Tab Selector (Disembunyikan saat Print PDF) */}
        <div className="px-4 sm:px-5 pt-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('EXECUTIVE_REPORT')}
              className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'EXECUTIVE_REPORT'
                  ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>1. Lembar Laporan Eksekutif Investor</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('NOTEBOOK_LM')}
              className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'NOTEBOOK_LM'
                  ? 'border-sky-400 text-sky-300 bg-sky-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>2. Generator Materi &amp; Prompt NotebookLM</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pb-2">
            <button
              type="button"
              onClick={handleExportInvestorCsv}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CSV Investor</span>
            </button>

            <button
              type="button"
              onClick={handlePrintExecutiveReport}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Simpan PDF (A4)</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* ================================================================
              TAB 1: LEMBAR LAPORAN EKSEKUTIF INVESTOR
             ================================================================ */}
          {activeTab === 'EXECUTIVE_REPORT' && (
            <div className="space-y-6">
              {/* Kop Surat / Banner Eksekutif */}
              <div className="rounded-2xl bg-gradient-to-r from-[#0a1f38] via-[#0e2a4c] to-[#0a1f38] border border-amber-500/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-1.5 border border-amber-400/50 shrink-0 shadow-md">
                    <img
                      src="/orientra-logo.jpeg"
                      alt="ORIENTRA"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">
                      ORIENTRA • DIGITAL ORIENTEERING &amp; RACE PLATFORM
                    </div>
                    <h3 className="text-lg sm:text-xl font-black text-white mt-0.5">
                      Executive Traction &amp; Platform Overview Report
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Rekam Jejak Kumulatif Penggunaan Platform Sejak Awal Dibuat s/d{' '}
                      <strong className="text-white">{metrics.generatedDateStr}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right font-mono text-xs bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 shrink-0">
                  <div className="text-slate-400 text-[10px] uppercase">
                    Status Operasional
                  </div>
                  <div className="text-emerald-400 font-bold mt-0.5">
                    ● PRODUCTION ACTIVE
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Ledger: All-Time Cumulative
                  </div>
                </div>
              </div>

              {/* BAGIAN 1: 4 Key Traction Headline Cards */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                  <TrendingUp className="w-4 h-4" />
                  <span>1. Key Traction Metrics (Akumulasi Pertumbuhan Sejak Awal)</span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>Total Mitra Organizer</span>
                      <Shield className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-3xl font-black font-mono text-white">
                      {metrics.totalOrganizersEver}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Instansi/Klub Penyelenggara ({metrics.activeOrganizersCount} aktif)
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>Total Course Dibuat</span>
                      <Compass className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-3xl font-black font-mono text-amber-400">
                      {metrics.totalCoursesEver}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Lintasan lomba ({metrics.totalCheckpointsActive} Pos CP aktif)
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>Total Peserta / Tim</span>
                      <Users className="w-4 h-4 text-sky-400" />
                    </div>
                    <div className="text-3xl font-black font-mono text-sky-400">
                      {metrics.totalParticipantsEver}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Partisipan terdaftar ({metrics.totalSessionsEver} total sesi lari)
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>Jangkauan Lokasi</span>
                      <MapPin className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-3xl font-black font-mono text-emerald-400">
                      {metrics.totalLocationsEver}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Venue / daerah unik pernah memakai ORIENTRA
                    </div>
                  </div>
                </div>
              </div>

              {/* BAGIAN 2: Indikator Keandalan Operasional & Engagement */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-sky-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>2. Keandalan Operasional &amp; Aktivitas Lapangan (Platform Engagement)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
                    <div className="text-slate-400">Total Validasi Scan Pos</div>
                    <div className="text-xl font-black font-mono text-emerald-300 mt-1">
                      {metrics.totalScansRecorded} Scan
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Validasi QR Code + GPS berhasil
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
                    <div className="text-slate-400">Completion Rate Peserta</div>
                    <div className="text-xl font-black font-mono text-amber-300 mt-1">
                      {metrics.completionRate}%
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {metrics.finishedCleanSessionsCount} Finish dari {metrics.startedSessionsCount} Start
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
                    <div className="text-slate-400">Rata-rata Peserta / Course</div>
                    <div className="text-xl font-black font-mono text-white mt-1">
                      {metrics.avgParticipantsPerCourse} Tim
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Kepadatan partisipasi per lintasan
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
                    <div className="text-slate-400">Rata-rata Pos / Course</div>
                    <div className="text-xl font-black font-mono text-purple-300 mt-1">
                      {metrics.avgCheckpointsPerCourse} CP
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Titik kontrol navigasi per course
                    </div>
                  </div>
                </div>
              </div>

              {/* BAGIAN 3 & 4: Tabel Sebaran Lokasi & Portofolio Mitra Organizer */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Tabel Lokasi Lomba */}
                <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>3. Jejak Lokasi Lomba ({metrics.totalLocationsEver} Venue)</span>
                    </div>
                  </div>

                  {metrics.locationsList.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-4 text-center">
                      Belum ada nama lokasi spesifik yang diisi pada Course.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                            <th className="py-2 px-2">No</th>
                            <th className="py-2 px-2">Nama Lokasi / Daerah</th>
                            <th className="py-2 px-2 text-center">Total Course</th>
                            <th className="py-2 px-2 text-right">Terakhir Dipakai</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {metrics.locationsList.map((loc, idx) => (
                            <tr key={loc.locationName}>
                              <td className="py-2 px-2 font-mono text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-2 font-semibold text-white">
                                {loc.locationName}
                              </td>
                              <td className="py-2 px-2 text-center font-mono text-emerald-300 font-bold">
                                {loc.coursesCount} Course
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-400">
                                {loc.lastUsedDate || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Tabel Portofolio Mitra Organizer */}
                <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="text-xs font-mono uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5" />
                      <span>
                        4. Portofolio Mitra Organizer ({metrics.orgList.length} Akun)
                      </span>
                    </div>
                  </div>

                  {metrics.orgList.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-4 text-center">
                      Belum ada akun Organizer mitra tambahan.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                            <th className="py-2 px-2">Kode</th>
                            <th className="py-2 px-2">Nama Organizer &amp; Instansi</th>
                            <th className="py-2 px-2 text-center">Course</th>
                            <th className="py-2 px-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {metrics.orgList.map((org) => (
                            <tr key={org.id}>
                              <td className="py-2 px-2 font-mono text-amber-300 font-bold">
                                {org.code}
                              </td>
                              <td className="py-2 px-2">
                                <div className="font-semibold text-white">
                                  {org.name}
                                </div>
                                {org.organization && (
                                  <div className="text-[10px] text-slate-400">
                                    {org.organization}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center font-mono text-sky-300 font-bold">
                                {org.coursesCount}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <span
                                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                    org.isActive
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-rose-500/15 text-rose-300'
                                  }`}
                                >
                                  {org.isActive ? 'AKTIF' : 'NONAKTIF'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* BAGIAN 5: Demografi Partisipan */}
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>5. Profil Demografi Peserta (Market Segment Analysis)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
                    <div className="font-semibold text-slate-300">
                      Komposisi Kategori Gender Peserta:
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-center">
                        <div className="text-slate-400 text-[11px]">Putra (Male)</div>
                        <div className="text-base font-black font-mono text-sky-300 mt-0.5">
                          {metrics.genderCounts.Male}
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-center">
                        <div className="text-slate-400 text-[11px]">Putri (Female)</div>
                        <div className="text-base font-black font-mono text-pink-300 mt-0.5">
                          {metrics.genderCounts.Female}
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-center">
                        <div className="text-slate-400 text-[11px]">Beregu / Umum</div>
                        <div className="text-base font-black font-mono text-amber-300 mt-0.5">
                          {metrics.genderCounts.Other}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
                    <div className="font-semibold text-slate-300">
                      Sebaran Kelompok Umur (Age Groups):
                    </div>
                    {metrics.ageGroupCounts.length === 0 ? (
                      <div className="text-slate-500 italic py-2">
                        Belum ada data peserta.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {metrics.ageGroupCounts.map((ag) => (
                          <span
                            key={ag.ageGroup}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs"
                          >
                            <strong className="text-amber-300 font-mono">
                              {ag.ageGroup}:
                            </strong>
                            <span className="text-white font-bold">
                              {ag.count} tim
                            </span>
                            <span className="text-slate-400 text-[10px] font-mono">
                              ({ag.pct}%)
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Banner Ajakan Buka Tab NotebookLM */}
              <div className="rounded-xl bg-sky-950/30 border border-sky-500/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>Ingin Mengubah Data Ini Menjadi Slide Presentasi di Google NotebookLM?</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Buka tab <strong>2. Generator Materi &amp; Prompt NotebookLM</strong> untuk menyalin dokumen sumber beserta prompt presentasi Pitch Deck Investor siap pakai.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('NOTEBOOK_LM')}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition cursor-pointer shrink-0 shadow"
                >
                  Buka Generator NotebookLM →
                </button>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 2: GENERATOR MATERI & PROMPT PRESENTASI NOTEBOOKLM
             ================================================================ */}
          {activeTab === 'NOTEBOOK_LM' && (
            <div className="space-y-6 print:hidden">
              {/* Panduan Singkat 2 Langkah */}
              <div className="rounded-xl bg-gradient-to-r from-sky-950/50 via-slate-900 to-purple-950/40 border border-sky-500/30 p-4 space-y-2">
                <div className="text-xs font-mono uppercase tracking-wider text-sky-300 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Cara Cepat Membuat Presentasi Investor di Google NotebookLM (2 Langkah)</span>
                </div>
                <ol className="text-xs text-slate-200 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>
                    <strong>Langkah 1 (Masukkan Sumber Data):</strong> Klik tombol{' '}
                    <strong className="text-emerald-300">Download File Sumber (.md / .txt)</strong> atau{' '}
                    <strong className="text-amber-300">Salin Dokumen Sumber</strong> di bawah, lalu masukkan sebagai <em>Source</em> di proyek <strong>NotebookLM</strong> Anda.
                  </li>
                  <li>
                    <strong>Langkah 2 (Tempel Prompt Presentasi):</strong> Pilih salah satu dari <strong>3 Master Prompt</strong> di bawah (Pitch Deck Investor / Proposal Sponsor / Audio Podcast), klik <strong>Salin Prompt</strong>, lalu tempel ke kolom chat NotebookLM.
                  </li>
                </ol>
              </div>

              {/* LANGKAH 1: DOKUMEN SUMBER DATA OTOMATIS (SOURCE DOCUMENT) */}
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-emerald-400 font-bold">
                      LANGKAH 1 • DOKUMEN SUMBER DATA OTOMATIS (NOTEBOOKLM SOURCE)
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Dokumen Fakta, Teknologi &amp; Angka Traction ORIENTRA (Otomatis dari Database)
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadNotebookSource('md')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .MD</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadNotebookSource('txt')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .TXT</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        triggerCopyFeedback(
                          'source-doc',
                          notebookLmSourceDocument
                        )
                      }
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow"
                    >
                      {copiedKey === 'source-doc' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Dokumen Sumber</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <textarea
                  readOnly
                  value={notebookLmSourceDocument}
                  rows={10}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs font-mono text-slate-200 focus:outline-none leading-relaxed"
                />
              </div>

              {/* LANGKAH 2: 3 PILIHAN MASTER PROMPT NOTEBOOKLM */}
              <div className="space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                  LANGKAH 2 • PILIH &amp; SALIN PROMPT UNTUK KOLOM CHAT NOTEBOOKLM:
                </div>

                <div className="space-y-4">
                  {notebookPrompts.map((item) => {
                    const Icon = item.icon;
                    const isCopied = copiedKey === item.id;
                    const isComboCopied = copiedKey === `${item.id}-combo`;

                    return (
                      <div
                        key={item.id}
                        className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border ${item.colorClass}`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              <span>{item.badge}</span>
                            </span>
                            <h4 className="text-sm font-bold text-white">
                              {item.title}
                            </h4>
                            <p className="text-xs text-slate-400">
                              {item.description}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                triggerCopyFeedback(
                                  `${item.id}-combo`,
                                  `${notebookLmSourceDocument}\n\n========================================\nINSTRUKSI TUGAS PRESENTASI:\n========================================\n${item.promptText}`
                                )
                              }
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                              title="Salin Dokumen Sumber + Prompt sekaligus dalam 1x klik"
                            >
                              {isComboCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Data + Prompt Tersalin!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Salin Gabungan (Data + Prompt)</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                triggerCopyFeedback(item.id, item.promptText)
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Prompt Tersalin!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Salin Prompt Saja</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <pre className="whitespace-pre-wrap rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto">
                          {item.promptText}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
