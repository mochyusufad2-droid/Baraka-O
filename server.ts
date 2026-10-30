import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import type {
  Checkpoint,
  CheckpointReport,
  Course,
  LastKnownLocation,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus as SessionStatusType,
  SyncStatus as SyncStatusType,
  ValidationMethod as ValidationMethodType,
} from './src/types.ts';

const ValidationMethod = {
  QR_ONLY: 'QR_ONLY' as ValidationMethodType,
  GPS_AUTO: 'GPS_AUTO' as ValidationMethodType,
  QR_AND_GPS: 'QR_AND_GPS' as ValidationMethodType,
  QR_OR_GPS: 'QR_OR_GPS' as ValidationMethodType,
};

const SessionStatus = {
  NOT_STARTED: 'NOT_STARTED' as SessionStatusType,
  ACTIVE: 'ACTIVE' as SessionStatusType,
  FINISHED: 'FINISHED' as SessionStatusType,
};

const SyncStatus = {
  SAVED_LOCAL: 'SAVED_LOCAL' as SyncStatusType,
  PENDING_SYNC: 'PENDING_SYNC' as SyncStatusType,
  SENDING: 'SENDING' as SyncStatusType,
  ACCEPTED_SERVER: 'ACCEPTED_SERVER' as SyncStatusType,
  REJECTED_SERVER: 'REJECTED_SERVER' as SyncStatusType,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'baraka-db.json');

// ============================================================================
// 1. UTILITAS KRIPTOGRAFI PIN & TOKEN (TANPA PLAINTEXT PIN)
// ============================================================================

export function hashPin(pin: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(String(pin).trim(), salt, 64).toString('hex');
  return { hash: derivedKey, salt };
}

export function verifyPin(pin: string, expectedHash: string, salt: string): boolean {
  const { hash } = hashPin(pin, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

// ============================================================================
// 2. RUMUS JARAK GPS HAVERSINE (DALAM METER)
// ============================================================================

export function calculateHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius bumi dalam meter
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================================
// 3. STRUKTUR DATABASE PERSISTEN (JSON STORAGE — COURSE UNIFIED)
// ============================================================================

interface StoredParticipant extends ParticipantPublic {
  pinHash: string;
  pinSalt: string;
}

interface DatabaseSchema {
  organizerAuth: {
    pinHash: string;
    pinSalt: string;
  };
  organizerTokens: string[];
  participantTokens: Record<string, string>; // token -> participantId
  courses: Course[];
  participants: StoredParticipant[];
  sessions: ParticipantSession[];
  reports: CheckpointReport[];
}

function createInitialDatabase(): DatabaseSchema {
  // Default PIN Organizer: "123456" (Disimpan dalam bentuk HASH + SALT)
  const orgPin = hashPin('123456');

  // Default Peserta contoh dengan PIN "1111" (Disimpan dalam bentuk HASH + SALT)
  const sampleParticipantPin = hashPin('1111');

  const courseSprintId = 'crs-sprint-01';
  const courseRaceId = 'crs-amazing-02';

  const initialCourses: Course[] = [
    {
      id: courseSprintId,
      name: 'BARAKA SPRINT ORIENTEERING — TAHURA A',
      description:
        'Wajib mengunjungi Pos 1 sampai Pos 4 secara berurutan. Validasi menggunakan QR Code.',
      locationName: 'Tahura Ir. H. Djuanda, Bandung',
      date: '2026-11-15',
      isActive: true,
      scoringEnabled: true,
      createdAt: new Date().toISOString(),
      validationMethod: ValidationMethod.QR_ONLY,
      defaultGpsRadiusMeters: 35,
      enforceOrder: true,
      allowParticipantMapVisibility: true,
      setupQrCode: 'BARAKA:SETUP:crs-sprint-01',
      startQrCode: 'BARAKA:START:crs-sprint-01',
      finishQrCode: 'BARAKA:FINISH:crs-sprint-01',
      checkpoints: [
        {
          id: 'cp-sprint-1',
          courseId: courseSprintId,
          code: 'CP1',
          name: 'Pos 1 — Gerbang Utama Tahura',
          orderIndex: 1,
          qrSecret: 'BARAKA:CP:crs-sprint-01:CP1:7F9A',
          latitude: -6.8586,
          longitude: 107.6305,
          radiusMeters: 35,
          points: 100,
        },
        {
          id: 'cp-sprint-2',
          courseId: courseSprintId,
          code: 'CP2',
          name: 'Pos 2 — Gua Jepang',
          orderIndex: 2,
          qrSecret: 'BARAKA:CP:crs-sprint-01:CP2:3C8B',
          latitude: -6.8562,
          longitude: 107.6328,
          radiusMeters: 35,
          points: 150,
        },
        {
          id: 'cp-sprint-3',
          courseId: courseSprintId,
          code: 'CP3',
          name: 'Pos 3 — Gua Belanda',
          orderIndex: 3,
          qrSecret: 'BARAKA:CP:crs-sprint-01:CP3:9D1E',
          latitude: -6.8539,
          longitude: 107.6361,
          radiusMeters: 40,
          points: 200,
        },
        {
          id: 'cp-sprint-4',
          courseId: courseSprintId,
          code: 'CP4',
          name: 'Pos 4 — Jembatan Gantung Penangkaran',
          orderIndex: 4,
          qrSecret: 'BARAKA:CP:crs-sprint-01:CP4:5A4F',
          latitude: -6.8505,
          longitude: 107.6402,
          radiusMeters: 40,
          points: 250,
        },
      ],
    },
    {
      id: courseRaceId,
      name: 'BARAKA AMAZING RACE EXPLORER — TAHURA B',
      description:
        'Urutan pos bebas (Score Orienteering). Validasi mewajibkan Scan QR sekaligus berada di dalam radius GPS.',
      locationName: 'Tahura Ir. H. Djuanda, Bandung',
      date: '2026-11-15',
      isActive: true,
      scoringEnabled: true,
      createdAt: new Date().toISOString(),
      validationMethod: ValidationMethod.QR_AND_GPS,
      defaultGpsRadiusMeters: 50,
      enforceOrder: false,
      allowParticipantMapVisibility: true,
      setupQrCode: 'BARAKA:SETUP:crs-amazing-02',
      startQrCode: 'BARAKA:START:crs-amazing-02',
      finishQrCode: 'BARAKA:FINISH:crs-amazing-02',
      checkpoints: [
        {
          id: 'cp-race-1',
          courseId: courseRaceId,
          code: 'AR1',
          name: 'Pos Tantangan 1 — Plaza Monumen',
          orderIndex: 1,
          qrSecret: 'BARAKA:CP:crs-amazing-02:AR1:11AA',
          latitude: -6.8581,
          longitude: 107.6312,
          radiusMeters: 50,
          points: 200,
        },
        {
          id: 'cp-race-2',
          courseId: courseRaceId,
          code: 'AR2',
          name: 'Pos Tantangan 2 — Tebing Keraton View',
          orderIndex: 2,
          qrSecret: 'BARAKA:CP:crs-amazing-02:AR2:22BB',
          latitude: -6.8548,
          longitude: 107.6345,
          radiusMeters: 50,
          points: 300,
        },
        {
          id: 'cp-race-3',
          courseId: courseRaceId,
          code: 'AR3',
          name: 'Pos Tantangan 3 — Curug Omas',
          orderIndex: 3,
          qrSecret: 'BARAKA:CP:crs-amazing-02:AR3:33CC',
          latitude: -6.8492,
          longitude: 107.6421,
          radiusMeters: 60,
          points: 400,
        },
      ],
    },
  ];

  return {
    organizerAuth: {
      pinHash: orgPin.hash,
      pinSalt: orgPin.salt,
    },
    organizerTokens: [],
    participantTokens: {},
    courses: initialCourses,
    participants: [
      {
        id: 'ptc-demo-01',
        name: 'Budi Santoso',
        teamName: 'Garuda Rimba',
        phone: '081234567890',
        bibNumber: 'BRK-101',
        registeredAt: new Date().toISOString(),
        pinHash: sampleParticipantPin.hash,
        pinSalt: sampleParticipantPin.salt,
      },
    ],
    sessions: [],
    reports: [],
  };
}

function loadDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!Array.isArray(parsed.courses)) {
      const initial = createInitialDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    return parsed;
  } catch {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

function saveDb(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

const db: DatabaseSchema = loadDb();

function toPublicParticipant(p: StoredParticipant): ParticipantPublic {
  return {
    id: p.id,
    name: p.name,
    teamName: p.teamName,
    phone: p.phone,
    bibNumber: p.bibNumber,
    registeredAt: p.registeredAt,
  };
}

// ============================================================================
// 4. MIDDLEWARE OTORISASI ORGANIZER & PARTICIPANT
// ============================================================================

function requireOrganizer(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || !db.organizerTokens.includes(token)) {
    res.status(401).json({
      error: 'Akses ditolak. Silakan login sebagai Organizer terlebih dahulu.',
    });
    return;
  }
  next();
}

function requireParticipant(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const participantId = db.participantTokens[token];
  if (!token || !participantId) {
    res.status(401).json({
      error: 'Sesi peserta tidak valid. Silakan masuk atau registrasi ulang.',
    });
    return;
  }
  (req as Request & { participantId?: string }).participantId = participantId;
  next();
}

// ============================================================================
// 5. LOGIKA VALIDASI RESMI CHECKPOINT & SESI DI SERVER (IDEMPOTENT)
// ============================================================================

interface IncomingReportPayload {
  reportId: string;
  courseId: string;
  sessionId: string;
  participantId: string;
  checkpointId: string;
  reportType: 'START' | 'CHECKPOINT' | 'FINISH';
  validationUsed: 'QR' | 'GPS' | 'QR_AND_GPS';
  qrPayloadScanned?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  measuredAt: string;
}

function isSetupQrPayload(qr?: string, course?: Course): boolean {
  if (!qr) return false;
  const trimmed = qr.trim();
  return (
    trimmed.startsWith('BARAKA:SETUP:') ||
    (course !== undefined && trimmed === course.setupQrCode)
  );
}

function processSingleReport(
  payload: IncomingReportPayload,
  authenticatedParticipantId: string
): { report: CheckpointReport; session: ParticipantSession | null; isDuplicate: boolean } {
  const serverNow = new Date().toISOString();

  // 1. CEK IDEMPOTENSI (PENCEGAHAN LAPORAN GANDA)
  const existingReport = db.reports.find((r) => r.reportId === payload.reportId);
  if (existingReport) {
    const existingSession =
      db.sessions.find((s) => s.id === existingReport.sessionId) || null;
    return {
      report: existingReport,
      session: existingSession,
      isDuplicate: true,
    };
  }

  // 2. CEGAH PEMALSUAN IDENTITAS PESERTA
  if (payload.participantId !== authenticatedParticipantId) {
    const rejected: CheckpointReport = {
      ...payload,
      receivedAt: serverNow,
      syncStatus: SyncStatus.REJECTED_SERVER,
      serverVerified: false,
      rejectionReason: 'Identitas peserta pada laporan tidak sesuai dengan akun yang login.',
      pointsAwarded: 0,
    };
    db.reports.push(rejected);
    saveDb(db);
    return { report: rejected, session: null, isDuplicate: false };
  }

  // 3. PERIKSA KEBERADAAN SESI DAN COURSE
  const session = db.sessions.find(
    (s) => s.id === payload.sessionId && s.participantId === authenticatedParticipantId
  );
  if (!session) {
    const rejected: CheckpointReport = {
      ...payload,
      receivedAt: serverNow,
      syncStatus: SyncStatus.REJECTED_SERVER,
      serverVerified: false,
      rejectionReason: 'Sesi peserta tidak ditemukan. Pastikan Setup QR sudah dipindai.',
      pointsAwarded: 0,
    };
    db.reports.push(rejected);
    saveDb(db);
    return { report: rejected, session: null, isDuplicate: false };
  }

  const course = db.courses.find((c) => c.id === session.courseId);

  if (!course || payload.courseId !== course.id) {
    const rejected: CheckpointReport = {
      ...payload,
      receivedAt: serverNow,
      syncStatus: SyncStatus.REJECTED_SERVER,
      serverVerified: false,
      rejectionReason: 'Course tidak sesuai dengan sesi aktif peserta.',
      pointsAwarded: 0,
    };
    db.reports.push(rejected);
    saveDb(db);
    return { report: rejected, session, isDuplicate: false };
  }

  const measuredTimeMs = Date.parse(payload.measuredAt);
  const safeMeasuredAt = Number.isNaN(measuredTimeMs) ? serverNow : payload.measuredAt;

  // 4. CEK JIKA PESERTA TIDAK SENGAJA MEMINDAI SETUP QR (KONDISI A & KONDISI B)
  if (isSetupQrPayload(payload.qrPayloadScanned, course)) {
    const setupErrorMsg =
      session.status === SessionStatus.NOT_STARTED
        ? 'Anda sudah scan Setup, silakan scan Start.'
        : 'Ditolak: Silakan scan Check Point atau Finish.';
    const rejectedSetup: CheckpointReport = {
      ...payload,
      measuredAt: safeMeasuredAt,
      receivedAt: serverNow,
      syncStatus: SyncStatus.REJECTED_SERVER,
      serverVerified: false,
      rejectionReason: setupErrorMsg,
      pointsAwarded: 0,
    };
    db.reports.push(rejectedSetup);
    saveDb(db);
    return { report: rejectedSetup, session, isDuplicate: false };
  }

  // ==========================================================================
  // A. LAPORAN START QR
  // ==========================================================================
  if (payload.reportType === 'START') {
    if (session.status !== SessionStatus.NOT_STARTED) {
      const acceptedAlready: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.ACCEPTED_SERVER,
        serverVerified: true,
        pointsAwarded: 0,
      };
      db.reports.push(acceptedAlready);
      saveDb(db);
      return { report: acceptedAlready, session, isDuplicate: false };
    }

    if ((payload.qrPayloadScanned || '').trim() !== course.startQrCode) {
      const rejected: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.REJECTED_SERVER,
        serverVerified: false,
        rejectionReason: 'Kode Start QR tidak cocok dengan Course ini.',
        pointsAwarded: 0,
      };
      db.reports.push(rejected);
      saveDb(db);
      return { report: rejected, session, isDuplicate: false };
    }

    session.status = SessionStatus.ACTIVE;
    session.startedAt = safeMeasuredAt;
    session.startedReceivedAt = serverNow;

    const acceptedStart: CheckpointReport = {
      ...payload,
      measuredAt: safeMeasuredAt,
      receivedAt: serverNow,
      syncStatus: SyncStatus.ACCEPTED_SERVER,
      serverVerified: true,
      pointsAwarded: 0,
    };
    db.reports.push(acceptedStart);
    saveDb(db);
    return { report: acceptedStart, session, isDuplicate: false };
  }

  // ==========================================================================
  // B. LAPORAN CHECKPOINT
  // ==========================================================================
  if (payload.reportType === 'CHECKPOINT') {
    if (session.status !== SessionStatus.ACTIVE) {
      const rejected: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.REJECTED_SERVER,
        serverVerified: false,
        rejectionReason:
          session.status === SessionStatus.NOT_STARTED
            ? 'Sesi belum dimulai. Peserta wajib memindai Start QR terlebih dahulu.'
            : 'Sesi sudah selesai (Finished). Tidak dapat menambah laporan checkpoint baru.',
        pointsAwarded: 0,
      };
      db.reports.push(rejected);
      saveDb(db);
      return { report: rejected, session, isDuplicate: false };
    }

    const checkpoint = course.checkpoints.find((cp) => cp.id === payload.checkpointId);
    if (!checkpoint) {
      const rejected: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.REJECTED_SERVER,
        serverVerified: false,
        rejectionReason: 'Checkpoint tidak ditemukan pada Course ini.',
        pointsAwarded: 0,
      };
      db.reports.push(rejected);
      saveDb(db);
      return { report: rejected, session, isDuplicate: false };
    }

    // Cegah klaim poin ganda untuk checkpoint yang sama pada sesi yang sama
    if (session.validatedCheckpointIds.includes(checkpoint.id)) {
      const duplicateCpReport: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.ACCEPTED_SERVER,
        serverVerified: true,
        rejectionReason: 'Checkpoint ini sudah tervalidasi sebelumnya (tidak dihitung ganda).',
        pointsAwarded: 0,
      };
      db.reports.push(duplicateCpReport);
      saveDb(db);
      return { report: duplicateCpReport, session, isDuplicate: true };
    }

    // Periksa aturan urutan pos (enforceOrder)
    if (course.enforceOrder) {
      const sortedCheckpoints = [...course.checkpoints].sort(
        (a, b) => a.orderIndex - b.orderIndex
      );
      const expectedNextIndex = session.validatedCheckpointIds.length;
      const expectedCp = sortedCheckpoints[expectedNextIndex];
      if (expectedCp && expectedCp.id !== checkpoint.id) {
        const rejected: CheckpointReport = {
          ...payload,
          measuredAt: safeMeasuredAt,
          receivedAt: serverNow,
          syncStatus: SyncStatus.REJECTED_SERVER,
          serverVerified: false,
          rejectionReason: `Urutan checkpoint tidak sesuai. Peserta wajib menyelesaikan ${expectedCp.code} (${expectedCp.name}) terlebih dahulu.`,
          pointsAwarded: 0,
        };
        db.reports.push(rejected);
        saveDb(db);
        return { report: rejected, session, isDuplicate: false };
      }
    }

    // Evaluasi QR & GPS sesuai aturan Course
    const qrMatch =
      Boolean(payload.qrPayloadScanned) &&
      payload.qrPayloadScanned?.trim() === checkpoint.qrSecret;

    let gpsMatch = false;
    let distanceMeters: number | null = null;
    const allowedRadius = checkpoint.radiusMeters || course.defaultGpsRadiusMeters || 35;
    const maxAcceptableAccuracy = 150;

    if (
      typeof payload.latitude === 'number' &&
      typeof payload.longitude === 'number' &&
      !Number.isNaN(payload.latitude) &&
      !Number.isNaN(payload.longitude)
    ) {
      distanceMeters = Math.round(
        calculateHaversineMeters(
          checkpoint.latitude,
          checkpoint.longitude,
          payload.latitude,
          payload.longitude
        )
      );
      const accuracyOk =
        payload.accuracyMeters === undefined || payload.accuracyMeters <= maxAcceptableAccuracy;
      gpsMatch = distanceMeters <= allowedRadius && accuracyOk;
    }

    let isValid = false;
    let failureDetail = '';

    switch (course.validationMethod) {
      case ValidationMethod.QR_ONLY:
        isValid = qrMatch;
        if (!isValid) {
          failureDetail = 'Kode QR Checkpoint tidak sesuai dengan pos yang dituju.';
        }
        break;

      case ValidationMethod.GPS_AUTO:
        isValid = gpsMatch;
        if (!isValid) {
          if (distanceMeters === null) {
            failureDetail = 'Data koordinat GPS tidak ditemukan pada laporan.';
          } else if (
            payload.accuracyMeters !== undefined &&
            payload.accuracyMeters > maxAcceptableAccuracy
          ) {
            failureDetail = `Akurasi GPS terlalu rendah (±${Math.round(payload.accuracyMeters)}m > batas ${maxAcceptableAccuracy}m).`;
          } else {
            failureDetail = `Posisi peserta berada di luar radius pos (Jarak: ${distanceMeters}m, Maksimal: ${allowedRadius}m).`;
          }
        }
        break;

      case ValidationMethod.QR_AND_GPS:
        isValid = qrMatch && gpsMatch;
        if (!qrMatch && !gpsMatch) {
          failureDetail = `Wajib QR + GPS: QR tidak cocok dan jarak GPS di luar radius (${distanceMeters ?? '?'}m > ${allowedRadius}m).`;
        } else if (!qrMatch) {
          failureDetail = 'Wajib QR + GPS: Lokasi GPS sesuai, tetapi kode QR tidak cocok.';
        } else if (!gpsMatch) {
          failureDetail = `Wajib QR + GPS: Kode QR cocok, tetapi posisi GPS berada di luar radius (${distanceMeters ?? '?'}m, batas ${allowedRadius}m).`;
        }
        break;

      case ValidationMethod.QR_OR_GPS:
        isValid = qrMatch || gpsMatch;
        if (!isValid) {
          failureDetail = `Metode QR atau GPS: Baik kode QR maupun jarak GPS (${distanceMeters ?? '?'}m > ${allowedRadius}m) belum memenuhi syarat.`;
        }
        break;
    }

    if (!isValid) {
      const rejected: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.REJECTED_SERVER,
        serverVerified: false,
        rejectionReason: failureDetail,
        pointsAwarded: 0,
      };
      db.reports.push(rejected);
      saveDb(db);
      return { report: rejected, session, isDuplicate: false };
    }

    // Jika sah, langsung perbarui progres dan skor sesi peserta (tanpa menunggu Finish!)
    session.validatedCheckpointIds.push(checkpoint.id);
    const points = course.scoringEnabled ? checkpoint.points : 0;
    session.totalScore += points;

    if (
      course.allowParticipantMapVisibility &&
      typeof payload.latitude === 'number' &&
      typeof payload.longitude === 'number'
    ) {
      session.lastLocation = {
        participantId: session.participantId,
        sessionId: session.id,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracyMeters: payload.accuracyMeters ?? 15,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
      };
    }

    const acceptedCp: CheckpointReport = {
      ...payload,
      measuredAt: safeMeasuredAt,
      receivedAt: serverNow,
      syncStatus: SyncStatus.ACCEPTED_SERVER,
      serverVerified: true,
      pointsAwarded: points,
    };
    db.reports.push(acceptedCp);
    saveDb(db);
    return { report: acceptedCp, session, isDuplicate: false };
  }

  // ==========================================================================
  // C. LAPORAN FINISH QR
  // ==========================================================================
  if (payload.reportType === 'FINISH') {
    if (session.status === SessionStatus.NOT_STARTED) {
      const rejected: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.REJECTED_SERVER,
        serverVerified: false,
        rejectionReason: 'Peserta belum memulai sesi (Start QR belum dipindai).',
        pointsAwarded: 0,
      };
      db.reports.push(rejected);
      saveDb(db);
      return { report: rejected, session, isDuplicate: false };
    }

    if ((payload.qrPayloadScanned || '').trim() !== course.finishQrCode) {
      const rejected: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.REJECTED_SERVER,
        serverVerified: false,
        rejectionReason: 'Kode Finish QR tidak cocok dengan Course ini.',
        pointsAwarded: 0,
      };
      db.reports.push(rejected);
      saveDb(db);
      return { report: rejected, session, isDuplicate: false };
    }

    if (
      course.enforceOrder &&
      session.validatedCheckpointIds.length < course.checkpoints.length
    ) {
      const rejected: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.REJECTED_SERVER,
        serverVerified: false,
        rejectionReason: `Course ini mewajibkan seluruh pos selesai secara berurutan (${session.validatedCheckpointIds.length}/${course.checkpoints.length} pos tervalidasi).`,
        pointsAwarded: 0,
      };
      db.reports.push(rejected);
      saveDb(db);
      return { report: rejected, session, isDuplicate: false };
    }

    if (session.status !== SessionStatus.FINISHED) {
      session.status = SessionStatus.FINISHED;
      session.finishedAt = safeMeasuredAt;
      session.finishedReceivedAt = serverNow;
      if (session.startedAt) {
        const diffSec = Math.max(
          0,
          Math.round((Date.parse(safeMeasuredAt) - Date.parse(session.startedAt)) / 1000)
        );
        session.durationSeconds = diffSec;
      }
    }

    const acceptedFinish: CheckpointReport = {
      ...payload,
      measuredAt: safeMeasuredAt,
      receivedAt: serverNow,
      syncStatus: SyncStatus.ACCEPTED_SERVER,
      serverVerified: true,
      pointsAwarded: 0,
    };
    db.reports.push(acceptedFinish);
    saveDb(db);
    return { report: acceptedFinish, session, isDuplicate: false };
  }

  const fallbackRejected: CheckpointReport = {
    ...payload,
    measuredAt: safeMeasuredAt,
    receivedAt: serverNow,
    syncStatus: SyncStatus.REJECTED_SERVER,
    serverVerified: false,
    rejectionReason: 'Tipe laporan tidak dikenali oleh server.',
    pointsAwarded: 0,
  };
  db.reports.push(fallbackRejected);
  saveDb(db);
  return { report: fallbackRejected, session, isDuplicate: false };
}

// ============================================================================
// 6. INISIALISASI EXPRESS SERVER & ENDPOINT API
// ============================================================================

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'BARAKA ADVENTURE',
      serverTime: new Date().toISOString(),
    });
  });

  // --------------------------------------------------------------------------
  // AUTENTIKASI ORGANIZER (PIN HASHED DI SERVER)
  // --------------------------------------------------------------------------
  app.post('/api/organizer/login', (req, res) => {
    const { pin } = req.body as { pin?: string };
    if (!pin) {
      res.status(400).json({ error: 'PIN Organizer wajib diisi.' });
      return;
    }
    const isValid = verifyPin(pin, db.organizerAuth.pinHash, db.organizerAuth.pinSalt);
    if (!isValid) {
      res.status(401).json({ error: 'PIN Organizer salah.' });
      return;
    }
    const token = generateToken();
    db.organizerTokens.push(token);
    saveDb(db);
    res.json({ token, role: 'ORGANIZER' });
  });

  app.post('/api/organizer/change-pin', requireOrganizer, (req, res) => {
    const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };
    if (!currentPin || !newPin || String(newPin).trim().length < 4) {
      res.status(400).json({ error: 'PIN baru minimal 4 karakter.' });
      return;
    }
    if (!verifyPin(currentPin, db.organizerAuth.pinHash, db.organizerAuth.pinSalt)) {
      res.status(401).json({ error: 'PIN Organizer saat ini tidak sesuai.' });
      return;
    }
    const updated = hashPin(newPin);
    db.organizerAuth = { pinHash: updated.hash, pinSalt: updated.salt };
    saveDb(db);
    res.json({ message: 'PIN Organizer berhasil diperbarui dengan aman (hashed).' });
  });

  // --------------------------------------------------------------------------
  // AUTENTIKASI & REGISTRASI PESERTA (NAMA TIM WAJIB DIISI & PIN HASHED)
  // --------------------------------------------------------------------------
  app.post('/api/participant/register', (req, res) => {
    const { name, teamName, phone, pin } = req.body as {
      name?: string;
      teamName?: string;
      phone?: string;
      pin?: string;
    };

    if (!name || !name.trim() || !teamName || !teamName.trim() || !pin || String(pin).trim().length < 4) {
      res.status(400).json({
        error: 'Nama peserta, Nama Tim, dan PIN (minimal 4 digit) wajib diisi.',
      });
      return;
    }

    const { hash, salt } = hashPin(pin);
    const nextNumber = 101 + db.participants.length;
    const newParticipant: StoredParticipant = {
      id: `ptc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      teamName: teamName.trim(),
      phone: phone?.trim() || '',
      bibNumber: `BRK-${nextNumber}`,
      registeredAt: new Date().toISOString(),
      pinHash: hash,
      pinSalt: salt,
    };

    db.participants.push(newParticipant);
    const token = generateToken();
    db.participantTokens[token] = newParticipant.id;
    saveDb(db);

    res.status(201).json({
      token,
      participant: toPublicParticipant(newParticipant),
    });
  });

  app.post('/api/participant/login', (req, res) => {
    const { bibOrName, pin } = req.body as { bibOrName?: string; pin?: string };
    if (!bibOrName || !pin) {
      res.status(400).json({ error: 'Nomor dada (BIB) / Nama dan PIN wajib diisi.' });
      return;
    }

    const query = bibOrName.trim().toLowerCase();
    const found = db.participants.find(
      (p) =>
        p.bibNumber.toLowerCase() === query ||
        p.name.toLowerCase() === query ||
        p.teamName.toLowerCase() === query
    );

    if (!found || !verifyPin(pin, found.pinHash, found.pinSalt)) {
      res.status(401).json({ error: 'Nomor peserta/Nama atau PIN tidak cocok.' });
      return;
    }

    const token = generateToken();
    db.participantTokens[token] = found.id;
    saveDb(db);

    const activeSessions = db.sessions.filter((s) => s.participantId === found.id);
    const latestSession =
      activeSessions.length > 0 ? activeSessions[activeSessions.length - 1] : null;
    const matchedCourse = latestSession
      ? db.courses.find((c) => c.id === latestSession.courseId) || null
      : null;

    const sanitizedCourse: Course | null = matchedCourse
      ? {
          ...matchedCourse,
          startQrCode: 'HIDDEN_ON_CLIENT',
          finishQrCode: 'HIDDEN_ON_CLIENT',
          checkpoints: matchedCourse.checkpoints.map((cp) => ({
            ...cp,
            qrSecret: 'VERIFIED_BY_SERVER',
          })),
        }
      : null;

    res.json({
      token,
      participant: toPublicParticipant(found),
      sessions: activeSessions,
      latestSession,
      activeCourse: sanitizedCourse,
    });
  });

  // --------------------------------------------------------------------------
  // ALUR PESERTA: LOAD COURSE MELALUI SETUP QR
  // --------------------------------------------------------------------------
  app.post('/api/participant/load-event', requireParticipant, (req, res) => {
    const participantId = (req as Request & { participantId: string }).participantId;
    const { setupQrCode } = req.body as { setupQrCode?: string };

    if (!setupQrCode) {
      res.status(400).json({ error: 'Setup QR Code wajib dipindai.' });
      return;
    }

    const trimmedSetup = setupQrCode.trim();
    // Dukung format baru BARAKA:SETUP:<courseId> maupun format lama BARAKA:SETUP:<eventId>:<courseId>
    const matchedCourse = db.courses.find(
      (c) =>
        c.setupQrCode === trimmedSetup ||
        trimmedSetup.endsWith(`:${c.id}`)
    );

    if (!matchedCourse) {
      res.status(404).json({
        error: 'Setup QR Code tidak dikenali. Pastikan Anda memindai Setup QR resmi dari panitia.',
      });
      return;
    }

    let session = db.sessions.find(
      (s) => s.participantId === participantId && s.courseId === matchedCourse.id
    );

    if (!session) {
      session = {
        id: `ses-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        courseId: matchedCourse.id,
        participantId,
        status: SessionStatus.NOT_STARTED,
        loadedAt: new Date().toISOString(),
        validatedCheckpointIds: [],
        totalScore: 0,
      };
      db.sessions.push(session);
      saveDb(db);
    }

    // Demi keamanan, jangan kirimkan qrSecret ke perangkat peserta
    const sanitizedCourse: Course = {
      ...matchedCourse,
      startQrCode: 'HIDDEN_ON_CLIENT',
      finishQrCode: 'HIDDEN_ON_CLIENT',
      checkpoints: matchedCourse.checkpoints.map((cp) => ({
        ...cp,
        qrSecret: 'VERIFIED_BY_SERVER',
      })),
    };

    res.json({
      course: sanitizedCourse,
      session,
    });
  });

  // --------------------------------------------------------------------------
  // ALUR PESERTA: SINKRONISASI LAPORAN CHECKPOINT / START / FINISH (SINGLE & BATCH)
  // --------------------------------------------------------------------------
  app.post('/api/participant/reports/sync', requireParticipant, (req, res) => {
    const participantId = (req as Request & { participantId: string }).participantId;
    const { reports } = req.body as { reports?: IncomingReportPayload[] };

    if (!Array.isArray(reports) || reports.length === 0) {
      res.status(400).json({ error: 'Daftar laporan kosong.' });
      return;
    }

    const sortedIncoming = [...reports].sort(
      (a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt)
    );

    const results = sortedIncoming.map((item) =>
      processSingleReport(item, participantId)
    );

    const latestSession =
      results[results.length - 1]?.session ||
      db.sessions.find((s) => s.participantId === participantId) ||
      null;

    res.json({
      processedAt: new Date().toISOString(),
      results: results.map((r) => ({
        report: r.report,
        isDuplicate: r.isDuplicate,
      })),
      session: latestSession,
    });
  });

  // --------------------------------------------------------------------------
  // ALUR PESERTA: PEMBARUAN LOKASI GPS BERKALA (~5 MENIT, HANYA POSISI TERAKHIR)
  // --------------------------------------------------------------------------
  app.post('/api/participant/location', requireParticipant, (req, res) => {
    const participantId = (req as Request & { participantId: string }).participantId;
    const { sessionId, latitude, longitude, accuracyMeters, measuredAt } = req.body as {
      sessionId?: string;
      latitude?: number;
      longitude?: number;
      accuracyMeters?: number;
      measuredAt?: string;
    };

    if (
      !sessionId ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number'
    ) {
      res.status(400).json({ error: 'Data sessionId, latitude, dan longitude wajib valid.' });
      return;
    }

    const session = db.sessions.find(
      (s) => s.id === sessionId && s.participantId === participantId
    );
    if (!session) {
      res.status(404).json({ error: 'Sesi aktif tidak ditemukan.' });
      return;
    }

    const course = db.courses.find((c) => c.id === session.courseId);
    if (course && !course.allowParticipantMapVisibility) {
      res.status(403).json({
        error: 'Course ini menonaktifkan tampilan lokasi peserta pada peta monitoring.',
      });
      return;
    }

    const receivedAt = new Date().toISOString();
    const safeMeasuredAt =
      measuredAt && !Number.isNaN(Date.parse(measuredAt)) ? measuredAt : receivedAt;

    const lastLocation: LastKnownLocation = {
      participantId,
      sessionId: session.id,
      latitude,
      longitude,
      accuracyMeters: typeof accuracyMeters === 'number' ? accuracyMeters : 20,
      measuredAt: safeMeasuredAt,
      receivedAt,
    };

    session.lastLocation = lastLocation;
    saveDb(db);

    res.json({
      status: 'ok',
      lastLocation,
    });
  });

  app.get('/api/participant/session/:sessionId', requireParticipant, (req, res) => {
    const participantId = (req as Request & { participantId: string }).participantId;
    const session = db.sessions.find(
      (s) => s.id === req.params.sessionId && s.participantId === participantId
    );
    if (!session) {
      res.status(404).json({ error: 'Sesi tidak ditemukan.' });
      return;
    }
    const sessionReports = db.reports.filter((r) => r.sessionId === session.id);
    res.json({ session, reports: sessionReports });
  });

  // --------------------------------------------------------------------------
  // ENDPOINT DASHBOARD ORGANIZER (COURSE MANAGEMENT, LIVE MONITORING, RESULT)
  // --------------------------------------------------------------------------
  app.get('/api/organizer/dashboard', requireOrganizer, (_req, res) => {
    res.json({
      serverTime: new Date().toISOString(),
      courses: db.courses,
      participants: db.participants.map(toPublicParticipant),
      sessions: db.sessions,
      reports: db.reports,
    });
  });

  // Buat Course Baru (Hasil Penyatuan Event & Course)
  app.post('/api/organizer/courses', requireOrganizer, (req, res) => {
    const {
      name,
      description,
      locationName,
      date,
      scoringEnabled,
      validationMethod,
      defaultGpsRadiusMeters,
      enforceOrder,
      allowParticipantMapVisibility,
    } = req.body as Partial<Course>;

    if (!name || !name.trim() || !locationName || !locationName.trim() || !date) {
      res.status(400).json({ error: 'Nama Course, Lokasi, dan Tanggal wajib diisi.' });
      return;
    }

    const courseId = `crs-${Date.now()}`;
    const newCourse: Course = {
      id: courseId,
      name: name.trim(),
      description: description?.trim() || '',
      locationName: locationName.trim(),
      date,
      isActive: true,
      scoringEnabled: scoringEnabled !== undefined ? Boolean(scoringEnabled) : true,
      createdAt: new Date().toISOString(),
      validationMethod: validationMethod || ValidationMethod.QR_ONLY,
      defaultGpsRadiusMeters: Number(defaultGpsRadiusMeters) || 35,
      enforceOrder: enforceOrder !== undefined ? Boolean(enforceOrder) : true,
      allowParticipantMapVisibility:
        allowParticipantMapVisibility !== undefined
          ? Boolean(allowParticipantMapVisibility)
          : true,
      setupQrCode: `BARAKA:SETUP:${courseId}`,
      startQrCode: `BARAKA:START:${courseId}`,
      finishQrCode: `BARAKA:FINISH:${courseId}`,
      checkpoints: [],
    };

    db.courses.push(newCourse);
    saveDb(db);
    res.status(201).json({ course: newCourse });
  });

  // Perbarui Pengaturan Course
  app.put('/api/organizer/courses/:courseId', requireOrganizer, (req, res) => {
    const course = db.courses.find((c) => c.id === req.params.courseId);
    if (!course) {
      res.status(404).json({ error: 'Course tidak ditemukan.' });
      return;
    }

    const {
      name,
      description,
      locationName,
      date,
      scoringEnabled,
      validationMethod,
      defaultGpsRadiusMeters,
      enforceOrder,
      allowParticipantMapVisibility,
    } = req.body as Partial<Course>;

    if (name !== undefined) course.name = name.trim();
    if (description !== undefined) course.description = description.trim();
    if (locationName !== undefined) course.locationName = locationName.trim();
    if (date !== undefined) course.date = date;
    if (scoringEnabled !== undefined) course.scoringEnabled = Boolean(scoringEnabled);
    if (validationMethod !== undefined) course.validationMethod = validationMethod;
    if (defaultGpsRadiusMeters !== undefined) {
      course.defaultGpsRadiusMeters = Number(defaultGpsRadiusMeters) || 35;
    }
    if (enforceOrder !== undefined) course.enforceOrder = Boolean(enforceOrder);
    if (allowParticipantMapVisibility !== undefined) {
      course.allowParticipantMapVisibility = Boolean(allowParticipantMapVisibility);
    }

    saveDb(db);
    res.json({ course });
  });

  // Tambah Checkpoint ke dalam Course
  app.post(
    '/api/organizer/courses/:courseId/checkpoints',
    requireOrganizer,
    (req, res) => {
      const course = db.courses.find((c) => c.id === req.params.courseId);
      if (!course) {
        res.status(404).json({ error: 'Course tidak ditemukan.' });
        return;
      }

      const { code, name, latitude, longitude, radiusMeters, points } =
        req.body as Partial<Checkpoint>;
      if (!code || !name || typeof latitude !== 'number' || typeof longitude !== 'number') {
        res.status(400).json({
          error: 'Kode pos, nama pos, serta koordinat latitude & longitude wajib diisi.',
        });
        return;
      }

      const nextOrder = course.checkpoints.length + 1;
      const secretSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
      const newCp: Checkpoint = {
        id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        courseId: course.id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        orderIndex: nextOrder,
        qrSecret: `BARAKA:CP:${course.id}:${code.trim().toUpperCase()}:${secretSuffix}`,
        latitude,
        longitude,
        radiusMeters: Number(radiusMeters) || course.defaultGpsRadiusMeters || 35,
        points: Number(points) || 100,
      };

      course.checkpoints.push(newCp);
      saveDb(db);
      res.status(201).json({ checkpoint: newCp });
    }
  );

  // Hapus Checkpoint
  app.delete(
    '/api/organizer/courses/:courseId/checkpoints/:checkpointId',
    requireOrganizer,
    (req, res) => {
      const course = db.courses.find((c) => c.id === req.params.courseId);
      if (!course) {
        res.status(404).json({ error: 'Course tidak ditemukan.' });
        return;
      }

      course.checkpoints = course.checkpoints
        .filter((cp) => cp.id !== req.params.checkpointId)
        .map((cp, index) => ({ ...cp, orderIndex: index + 1 }));

      saveDb(db);
      res.json({ course });
    }
  );

  // Tambah Peserta oleh Organizer (Nama Tim Wajib & PIN di-hash)
  app.post('/api/organizer/participants', requireOrganizer, (req, res) => {
    const { name, teamName, phone, pin } = req.body as {
      name?: string;
      teamName?: string;
      phone?: string;
      pin?: string;
    };

    if (!name || !name.trim() || !teamName || !teamName.trim() || !pin || String(pin).trim().length < 4) {
      res.status(400).json({
        error: 'Nama peserta, Nama Tim, dan PIN (minimal 4 digit) wajib diisi.',
      });
      return;
    }

    const { hash, salt } = hashPin(pin);
    const nextNumber = 101 + db.participants.length;
    const newParticipant: StoredParticipant = {
      id: `ptc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      teamName: teamName.trim(),
      phone: phone?.trim() || '',
      bibNumber: `BRK-${nextNumber}`,
      registeredAt: new Date().toISOString(),
      pinHash: hash,
      pinSalt: salt,
    };

    db.participants.push(newParticipant);
    saveDb(db);

    res.status(201).json({
      participant: toPublicParticipant(newParticipant),
    });
  });

  // --------------------------------------------------------------------------
  // VITE MIDDLEWARE (DEVELOPMENT) ATAU STATIC FILES (PRODUCTION)
  // --------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });

    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result && result.code) {
          const safeClientCode = result.code
            .replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* HMR WebSocket disabled in preview */'
            )
            .replace(
              'else throw new SendBeforeConnectError("send was called before connect");',
              'else return;'
            )
            .replace(
              'else throw new SendBeforeConnectError("invoke was called before connect");',
              'else return;'
            )
            .replace('throw e;', 'return;');
          res.status(200).set({ 'Content-Type': 'application/javascript' }).send(safeClientCode);
          return;
        }
      } catch {
        // Lanjutkan ke middleware standar jika gagal transformasi
      }
      next();
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BARAKA ADVENTURE Server berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer();
