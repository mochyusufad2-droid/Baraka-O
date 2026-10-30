/**
 * End-to-End Verification Script for BARAKA ADVENTURE
 * Verifying Unified Course + All Approved Discussion Refinements
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ GAGAL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ LULUS: ${message}`);
  }
}

async function runVerification() {
  console.log('=== MEMULAI VERIFIKASI END-TO-END BARAKA ADVENTURE ===\n');

  // 1. Organizer Login (Default PIN: 123456)
  const orgLoginRes = await fetch(`${BASE_URL}/api/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '123456' }),
  });
  await assert(orgLoginRes.ok, 'Kriteria 1: Login Organizer berhasil');
  const { token: orgToken } = await orgLoginRes.json();

  // 2. Organizer Dashboard Fetch (Unified Course Management)
  const dashRes = await fetch(`${BASE_URL}/api/organizer/dashboard`, {
    headers: { Authorization: `Bearer ${orgToken}` },
  });
  await assert(
    dashRes.ok,
    'Kriteria 2: Dashboard Organizer mengembalikan Courses, Participants, Sessions, Reports'
  );
  const dashData = await dashRes.json();
  await assert(
    Array.isArray(dashData.courses) && dashData.courses.length >= 2,
    'Terdapat Course bawaan pada sistem'
  );

  // 3. Organizer Creates a New Unified Course + Checkpoint
  const newCourseRes = await fetch(`${BASE_URL}/api/organizer/courses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orgToken}`,
    },
    body: JSON.stringify({
      name: 'Sprint Verifikasi E2E',
      description: 'Course khusus pengujian E2E',
      locationName: 'Hutan Kota E2E',
      date: '2026-11-20',
      scoringEnabled: true,
      validationMethod: 'QR_AND_GPS',
      defaultGpsRadiusMeters: 50,
      enforceOrder: true,
      allowParticipantMapVisibility: true,
    }),
  });
  await assert(newCourseRes.ok, 'Kriteria 3a: Organizer berhasil membuat Course terpadu baru');
  const { course: createdCourse } = await newCourseRes.json();

  const cp1Res = await fetch(
    `${BASE_URL}/api/organizer/courses/${createdCourse.id}/checkpoints`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgToken}`,
      },
      body: JSON.stringify({
        code: 'CP1',
        name: 'Pos Verifikasi 1',
        points: 150,
        latitude: -6.715,
        longitude: 106.731,
        radiusMeters: 50,
      }),
    }
  );
  await assert(
    cp1Res.ok,
    'Kriteria 3b: Organizer berhasil menambahkan Checkpoint ke Course'
  );
  const { checkpoint: cp1 } = await cp1Res.json();

  // 4. Participant Registration (Mandatory teamName + PIN Hashing)
  const missingTeamRes = await fetch(`${BASE_URL}/api/participant/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Atlet Tanpa Tim',
      teamName: '',
      pin: '5678',
    }),
  });
  await assert(
    missingTeamRes.status === 400,
    'Kriteria 4a: Registrasi tanpa Nama Tim wajib ditolak (HTTP 400)'
  );

  const rawPin = '9876';
  const regRes = await fetch(`${BASE_URL}/api/participant/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Atlet Verifikasi',
      teamName: 'Tim E2E Baraka',
      phone: '081299998888',
      pin: rawPin,
    }),
  });
  await assert(
    regRes.ok,
    'Kriteria 4b: Registrasi Peserta baru dengan Nama Tim wajib berhasil'
  );
  const { token: partToken, participant: registeredParticipant } = await regRes.json();

  // Check database file directly to verify PIN is hashed and not plaintext
  const dbRaw = fs.readFileSync(
    path.join(process.cwd(), 'data', 'baraka-db.json'),
    'utf-8'
  );
  await assert(
    !dbRaw.includes(`"pin":"${rawPin}"`) && dbRaw.includes('pinHash'),
    'Kriteria 4c: PIN tersimpan sebagai hash + salt di database (bukan plaintext)'
  );

  // Verify wrong PIN login fails
  const wrongLogin = await fetch(`${BASE_URL}/api/participant/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bibOrName: registeredParticipant.bibNumber,
      pin: '0000',
    }),
  });
  await assert(
    wrongLogin.status === 401,
    'Kriteria 4d: Login dengan PIN salah ditolak dengan HTTP 401'
  );

  // 5. Participant Loads Course via Setup QR Code
  const loadCourseRes = await fetch(`${BASE_URL}/api/participant/load-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${partToken}`,
    },
    body: JSON.stringify({ setupQrCode: createdCourse.setupQrCode }),
  });
  await assert(
    loadCourseRes.ok,
    'Kriteria 5a: Peserta berhasil memuat Course dengan Setup QR Code'
  );
  const loadCourseData = await loadCourseRes.json();
  const activeSession = loadCourseData.session;
  await assert(
    activeSession.status === 'NOT_STARTED',
    'Kriteria 5b: Status sesi awal adalah NOT_STARTED'
  );

  // 6. Test Kondisi A (Accidental Setup QR scan while NOT_STARTED)
  const kondisiARes = await fetch(`${BASE_URL}/api/participant/reports/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${partToken}`,
    },
    body: JSON.stringify({
      reports: [
        {
          reportId: `rep-kondisi-a-${Date.now()}`,
          courseId: createdCourse.id,
          sessionId: activeSession.id,
          participantId: registeredParticipant.id,
          checkpointId: cp1.id,
          reportType: 'CHECKPOINT',
          validationUsed: 'QR',
          qrPayloadScanned: createdCourse.setupQrCode,
          measuredAt: new Date().toISOString(),
        },
      ],
    }),
  });
  const kondisiAData = await kondisiARes.json();
  const kondisiAReport = kondisiAData.results[0].report;
  await assert(
    kondisiAReport.serverVerified === false &&
      kondisiAReport.rejectionReason.includes(
        'Anda sudah scan Setup, silakan scan Start'
      ),
    `Kriteria 6a (Kondisi A): Scan Setup QR saat NOT_STARTED memberi info "${kondisiAReport.rejectionReason}"`
  );

  // 7. Try scanning Checkpoint BEFORE Start -> Must be rejected
  const prematureCpRes = await fetch(`${BASE_URL}/api/participant/reports/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${partToken}`,
    },
    body: JSON.stringify({
      reports: [
        {
          reportId: `rep-premature-${Date.now()}`,
          courseId: createdCourse.id,
          sessionId: activeSession.id,
          participantId: registeredParticipant.id,
          checkpointId: cp1.id,
          reportType: 'CHECKPOINT',
          validationUsed: 'QR_AND_GPS',
          qrPayloadScanned: cp1.qrSecret,
          latitude: -6.715,
          longitude: 106.731,
          measuredAt: new Date().toISOString(),
        },
      ],
    }),
  });
  const prematureCpData = await prematureCpRes.json();
  await assert(
    prematureCpData.results[0].report.serverVerified === false,
    'Kriteria 6b: Scan Checkpoint sebelum Start ditolak oleh server'
  );

  // 8. Scan START QR Code -> Session becomes ACTIVE
  const startTimeIso = new Date(Date.now() - 120000).toISOString();
  const startRes = await fetch(`${BASE_URL}/api/participant/reports/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${partToken}`,
    },
    body: JSON.stringify({
      reports: [
        {
          reportId: `rep-start-${Date.now()}`,
          courseId: createdCourse.id,
          sessionId: activeSession.id,
          participantId: registeredParticipant.id,
          checkpointId: 'START',
          reportType: 'START',
          validationUsed: 'QR',
          qrPayloadScanned: createdCourse.startQrCode,
          measuredAt: startTimeIso,
        },
      ],
    }),
  });
  const startData = await startRes.json();
  await assert(
    startData.results[0].report.serverVerified === true &&
      startData.session.status === 'ACTIVE',
    'Kriteria 7: Scan Start QR mengaktifkan timer & mengubah status menjadi ACTIVE'
  );

  // 9. Test Kondisi B (Accidental Setup QR scan while ACTIVE)
  const kondisiBRes = await fetch(`${BASE_URL}/api/participant/reports/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${partToken}`,
    },
    body: JSON.stringify({
      reports: [
        {
          reportId: `rep-kondisi-b-${Date.now()}`,
          courseId: createdCourse.id,
          sessionId: activeSession.id,
          participantId: registeredParticipant.id,
          checkpointId: cp1.id,
          reportType: 'CHECKPOINT',
          validationUsed: 'QR',
          qrPayloadScanned: createdCourse.setupQrCode,
          measuredAt: new Date().toISOString(),
        },
      ],
    }),
  });
  const kondisiBData = await kondisiBRes.json();
  const kondisiBReport = kondisiBData.results[0].report;
  await assert(
    kondisiBReport.serverVerified === false &&
      kondisiBReport.rejectionReason.includes(
        'Silakan scan Check Point atau Finish'
      ),
    `Kriteria 8 (Kondisi B): Scan Setup QR saat ACTIVE langsung ditolak dengan pesan "${kondisiBReport.rejectionReason}"`
  );

  // 10. Scan Checkpoint with Valid QR + Valid GPS
  const validCpRes = await fetch(`${BASE_URL}/api/participant/reports/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${partToken}`,
    },
    body: JSON.stringify({
      reports: [
        {
          reportId: `rep-valid-cp-${Date.now()}`,
          courseId: createdCourse.id,
          sessionId: activeSession.id,
          participantId: registeredParticipant.id,
          checkpointId: cp1.id,
          reportType: 'CHECKPOINT',
          validationUsed: 'QR_AND_GPS',
          qrPayloadScanned: cp1.qrSecret,
          latitude: -6.71505,
          longitude: 106.73105,
          accuracyMeters: 8,
          measuredAt: new Date(Date.now() - 60000).toISOString(),
        },
      ],
    }),
  });
  const validCpData = await validCpRes.json();
  await assert(
    validCpData.results[0].report.serverVerified === true &&
      validCpData.session.totalScore === 150,
    'Kriteria 9: Scan Checkpoint valid menambah skor (+150 poin)'
  );

  // 11. Periodic Location Update (~5-minute last location overwrite)
  const loc1Res = await fetch(`${BASE_URL}/api/participant/location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${partToken}`,
    },
    body: JSON.stringify({
      sessionId: activeSession.id,
      latitude: -6.716,
      longitude: 106.732,
      accuracyMeters: 10,
      measuredAt: new Date(Date.now() - 30000).toISOString(),
    }),
  });
  const loc1Data = await loc1Res.json();
  await assert(
    loc1Data.lastLocation && loc1Data.lastLocation.latitude === -6.716,
    'Kriteria 10: Lokasi berkala berhasil disimpan pada field tunggal lastLocation'
  );

  // 12. Finish QR Scan via Sync Endpoint
  const finishRepId = `rep-finish-${Date.now()}`;
  const syncRes = await fetch(`${BASE_URL}/api/participant/reports/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${partToken}`,
    },
    body: JSON.stringify({
      reports: [
        {
          reportId: finishRepId,
          courseId: createdCourse.id,
          sessionId: activeSession.id,
          participantId: registeredParticipant.id,
          checkpointId: 'FINISH',
          reportType: 'FINISH',
          validationUsed: 'QR',
          qrPayloadScanned: createdCourse.finishQrCode,
          measuredAt: new Date().toISOString(),
        },
      ],
    }),
  });
  const syncData = await syncRes.json();
  await assert(
    syncRes.ok &&
      syncData.results[0].report.serverVerified === true &&
      syncData.session.status === 'FINISHED',
    'Kriteria 11: Sinkronisasi antrean memproses laporan FINISH dengan sukses'
  );

  console.log('\n🎉 SEMUA VERIFIKASI END-TO-END LULUS DENGAN SEMPURNA!');
}

runVerification().catch((err) => {
  console.error('Verifikasi gagal karena error:', err);
  process.exit(1);
});
