import crypto from 'crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Checkpoint,
  CheckpointReport,
  Course,
  GeoPointLocation,
  LastKnownLocation,
  OrganizerPublic,
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

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'baraka-data')
  : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'baraka-db.json');
const TOKEN_SECRET =
  process.env.BARAKA_TOKEN_SECRET || 'baraka-adventure-hmac-secret-2026';

// ============================================================================
// 1. UTILITAS KRIPTOGRAFI PIN & TOKEN (TANPA PLAINTEXT PIN + STATELESS HMAC)
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

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('hex')
    .slice(0, 32);
}

export interface OrganizerAuthContext {
  organizerId: string;
  isSuperAdmin: boolean;
  code: string;
  username: string;
  name: string;
  organization?: string;
}

function createOrganizerToken(organizerId = 'SUPERADMIN', isSuperAdmin = true): string {
  const ts = Date.now().toString(36);
  const roleFlag = isSuperAdmin ? 'SA' : 'ORG';
  const body = `otk.${organizerId}.${roleFlag}.${ts}`;
  return `${body}.${signPayload(body)}`;
}

function parseOrganizerTokenPayload(
  token: string,
  validList: string[]
): { organizerId: string; isSuperAdmin: boolean } | null {
  if (!token) return null;
  const parts = token.split('.');
  // Format baru 5 bagian: otk.<organizerId>.<SA|ORG>.<ts>.<sig>
  if (parts.length === 5 && parts[0] === 'otk') {
    const body = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`;
    if (signPayload(body) === parts[4]) {
      return {
        organizerId: parts[1],
        isSuperAdmin: parts[2] === 'SA',
      };
    }
  }
  // Format lama 4 bagian (backward compatibility -> dianggap Superadmin)
  if (parts.length === 4 && parts[0] === 'otk') {
    const body = `${parts[0]}.${parts[1]}.${parts[2]}`;
    if (signPayload(body) === parts[3]) {
      return {
        organizerId: 'SUPERADMIN',
        isSuperAdmin: true,
      };
    }
  }
  if (validList.includes(token)) {
    return {
      organizerId: 'SUPERADMIN',
      isSuperAdmin: true,
    };
  }
  return null;
}

function createParticipantToken(participantId: string): string {
  const ts = Date.now().toString(36);
  const body = `ptk.${participantId}.${ts}`;
  return `${body}.${signPayload(body)}`;
}

function verifyParticipantToken(
  token: string,
  tokenMap: Record<string, string>
): string | null {
  if (!token) return null;
  if (tokenMap[token]) return tokenMap[token];
  const parts = token.split('.');
  if (parts.length === 4 && parts[0] === 'ptk') {
    const body = `${parts[0]}.${parts[1]}.${parts[2]}`;
    if (signPayload(body) === parts[3]) {
      return parts[1];
    }
  }
  return null;
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

interface StoredOrganizer extends OrganizerPublic {
  pinHash: string;
  pinSalt: string;
}

interface DatabaseSchema {
  organizerAuth: {
    pinHash: string;
    pinSalt: string;
  };
  organizers?: StoredOrganizer[];
  organizerTokens: string[];
  participantTokens: Record<string, string>; // token -> participantId
  courses: Course[];
  deletedCourseIds?: string[];
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
      durationMinutes: 60,
      overtimePenaltyEnabled: true,
      overtimePenaltyPointsPerMinute: 10,
      startLocation: {
        latitude: -6.8595,
        longitude: 107.6295,
        name: 'Garis Start Gerbang Tahura',
      },
      finishLocation: {
        latitude: -6.8495,
        longitude: 107.6412,
        name: 'Garis Finish Lapangan Utama',
      },
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
      durationMinutes: 90,
      overtimePenaltyEnabled: true,
      overtimePenaltyPointsPerMinute: 15,
      startLocation: {
        latitude: -6.8588,
        longitude: 107.6302,
        name: 'Basecamp Start & Finish',
      },
      finishLocation: {
        latitude: -6.8588,
        longitude: 107.6302,
        name: 'Basecamp Start & Finish',
      },
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
    deletedCourseIds: [],
    sessions: [],
    reports: [],
  };
}

function normalizeRestoredCourse(raw: Course): Course {
  const courseId = raw.id;
  return {
    ...raw,
    setupQrCode:
      raw.setupQrCode && !raw.setupQrCode.includes('HIDDEN')
        ? raw.setupQrCode
        : `BARAKA:SETUP:${courseId}`,
    startQrCode:
      raw.startQrCode && !raw.startQrCode.includes('HIDDEN')
        ? raw.startQrCode
        : `BARAKA:START:${courseId}`,
    finishQrCode:
      raw.finishQrCode && !raw.finishQrCode.includes('HIDDEN')
        ? raw.finishQrCode
        : `BARAKA:FINISH:${courseId}`,
    checkpoints: Array.isArray(raw.checkpoints)
      ? raw.checkpoints.map((cp, idx) => ({
          ...cp,
          courseId,
          orderIndex: cp.orderIndex ?? idx + 1,
          qrSecret:
            cp.qrSecret && cp.qrSecret !== 'VERIFIED_BY_SERVER'
              ? cp.qrSecret
              : `BARAKA:CP:${courseId}:${cp.code.toUpperCase()}`,
        }))
      : [],
  };
}

function parseAndMigrateDbContent(raw: string): DatabaseSchema | null {
  try {
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!Array.isArray(parsed.courses)) return null;
    if (!Array.isArray(parsed.deletedCourseIds)) {
      parsed.deletedCourseIds = [];
    }
    if (!Array.isArray(parsed.organizers)) {
      parsed.organizers = [];
    }
    const defaults = createInitialDatabase();
    parsed.courses.forEach((c) => {
      const matchDefault = defaults.courses.find((dc) => dc.id === c.id);
      if (matchDefault) {
        if (!c.startLocation && matchDefault.startLocation) {
          c.startLocation = matchDefault.startLocation;
        }
        if (!c.finishLocation && matchDefault.finishLocation) {
          c.finishLocation = matchDefault.finishLocation;
        }
        if (c.durationMinutes === undefined && matchDefault.durationMinutes !== undefined) {
          c.durationMinutes = matchDefault.durationMinutes;
          c.overtimePenaltyEnabled = matchDefault.overtimePenaltyEnabled;
          c.overtimePenaltyPointsPerMinute = matchDefault.overtimePenaltyPointsPerMinute;
        }
      }
    });
    return parsed;
  } catch {
    return null;
  }
}

function loadDb(): DatabaseSchema {
  const backupFile = `${DB_FILE}.bak`;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const fromMain = parseAndMigrateDbContent(fs.readFileSync(DB_FILE, 'utf-8'));
      if (fromMain) return fromMain;
    }
    if (fs.existsSync(backupFile)) {
      const fromBackup = parseAndMigrateDbContent(fs.readFileSync(backupFile, 'utf-8'));
      if (fromBackup) {
        saveDb(fromBackup);
        return fromBackup;
      }
    }
    const initial = createInitialDatabase();
    saveDb(initial);
    return initial;
  } catch {
    return createInitialDatabase();
  }
}

function saveDb(dbToSave: DatabaseSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const serialized = JSON.stringify(dbToSave, null, 2);
    const tmpFile = `${DB_FILE}.tmp`;
    const backupFile = `${DB_FILE}.bak`;
    fs.writeFileSync(tmpFile, serialized, 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
    fs.writeFileSync(backupFile, serialized, 'utf-8');
  } catch {
    // Abaikan kegagalan tulis di filesystem read-only pada serverless
  }
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
    createdByOrganizerId: p.createdByOrganizerId,
  };
}

function toPublicOrganizer(o: StoredOrganizer): OrganizerPublic {
  return {
    id: o.id,
    code: o.code,
    username: o.username,
    name: o.name,
    organization: o.organization,
    isSuperAdmin: Boolean(o.isSuperAdmin),
    isActive: o.isActive !== false,
    createdAt: o.createdAt,
  };
}

function getSuperAdminPublicProfile(): OrganizerPublic {
  return {
    id: 'SUPERADMIN',
    code: 'SUPERADMIN',
    username: 'superadmin',
    name: 'Superadmin Utama',
    organization: 'BARAKA Pusat',
    isSuperAdmin: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

// ============================================================================
// 4. MIDDLEWARE OTORISASI ORGANIZER, SUPERADMIN & PARTICIPANT
// ============================================================================

function resolveOrganizerAuth(token: string): OrganizerAuthContext | null {
  const parsed = parseOrganizerTokenPayload(token, db.organizerTokens);
  if (!parsed) return null;

  if (parsed.isSuperAdmin || parsed.organizerId === 'SUPERADMIN') {
    return {
      organizerId: 'SUPERADMIN',
      isSuperAdmin: true,
      code: 'SUPERADMIN',
      username: 'superadmin',
      name: 'Superadmin Utama',
      organization: 'BARAKA Pusat',
    };
  }

  const orgList = db.organizers || [];
  const foundOrg = orgList.find((o) => o.id === parsed.organizerId);
  if (!foundOrg) {
    // Jika server sempat cold-start tetapi token HMAC valid untuk organizer non-superadmin,
    // tetap izinkan akses terisolasi berdasarkan organizerId dari token HMAC
    return {
      organizerId: parsed.organizerId,
      isSuperAdmin: false,
      code: parsed.organizerId.toUpperCase().slice(0, 8),
      username: parsed.organizerId,
      name: 'Organizer',
    };
  }

  if (foundOrg.isActive === false) {
    return null;
  }

  return {
    organizerId: foundOrg.id,
    isSuperAdmin: false,
    code: foundOrg.code,
    username: foundOrg.username,
    name: foundOrg.name,
    organization: foundOrg.organization,
  };
}

function canAccessCourse(course: Course, auth: OrganizerAuthContext): boolean {
  if (auth.isSuperAdmin) return true;
  return course.createdByOrganizerId === auth.organizerId;
}

function requireOrganizer(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const auth = resolveOrganizerAuth(token);
  if (!auth) {
    res.status(401).json({
      error: 'Akses ditolak atau akun Organizer sedang dinonaktifkan. Silakan login kembali.',
    });
    return;
  }
  (req as Request & { organizerAuth?: OrganizerAuthContext }).organizerAuth = auth;
  next();
}

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const auth = resolveOrganizerAuth(token);
  if (!auth || !auth.isSuperAdmin) {
    res.status(403).json({
      error: 'Fitur ini hanya dapat diakses oleh Superadmin Utama.',
    });
    return;
  }
  (req as Request & { organizerAuth?: OrganizerAuthContext }).organizerAuth = auth;
  next();
}

function requireParticipant(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const participantId = verifyParticipantToken(token, db.participantTokens);
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

/**
 * Menghitung ulang skor kotor (grossScore), menit keterlambatan (overtimeMinutes),
 * potongan penalti (penaltyPoints), dan skor bersih akhir (totalScore) pada sesi peserta.
 */
function recalculateSessionScore(session: ParticipantSession, course: Course): void {
  // Pastikan hanya checkpoint yang masih ada di course yang dihitung
  session.validatedCheckpointIds = session.validatedCheckpointIds.filter((cpId) =>
    course.checkpoints.some((c) => c.id === cpId)
  );

  const grossScore = course.scoringEnabled
    ? session.validatedCheckpointIds.reduce((sum, cpId) => {
        const cp = course.checkpoints.find((c) => c.id === cpId);
        return sum + (cp ? Number(cp.points) || 0 : 0);
      }, 0)
    : 0;

  let overtimeMinutes = 0;
  let penaltyPoints = 0;

  const durationLimitMin = Number(course.durationMinutes) || 0;
  if (
    durationLimitMin > 0 &&
    session.durationSeconds !== undefined &&
    session.durationSeconds > durationLimitMin * 60
  ) {
    const overtimeSeconds = session.durationSeconds - durationLimitMin * 60;
    overtimeMinutes = Math.ceil(overtimeSeconds / 60);
    if (course.overtimePenaltyEnabled) {
      const rate = Math.max(0, Number(course.overtimePenaltyPointsPerMinute) || 0);
      penaltyPoints = overtimeMinutes * rate;
    }
  }

  session.grossScore = grossScore;
  session.overtimeMinutes = overtimeMinutes;
  session.penaltyPoints = penaltyPoints;
  session.totalScore = Math.max(0, grossScore - penaltyPoints);

  // Perbarui pointsAwarded pada laporan checkpoint yang sudah diterima di sesi ini
  db.reports.forEach((r) => {
    if (
      r.sessionId === session.id &&
      r.reportType === 'CHECKPOINT' &&
      r.syncStatus === SyncStatus.ACCEPTED_SERVER
    ) {
      const cp = course.checkpoints.find((c) => c.id === r.checkpointId);
      r.pointsAwarded = course.scoringEnabled && cp ? Number(cp.points) || 0 : 0;
    }
  });
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

    const scannedStart = (payload.qrPayloadScanned || '').trim();
    const expectedStartPrefix = `BARAKA:START:${course.id}`.toUpperCase();
    const isStartMatch =
      scannedStart === course.startQrCode ||
      scannedStart.toUpperCase() === expectedStartPrefix;

    if (!isStartMatch) {
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

    // Evaluasi QR & GPS sesuai aturan Course (dukung juga format deterministik BARAKA:CP:<courseId>:<cpCode>)
    const scannedCp = (payload.qrPayloadScanned || '').trim();
    const upperScannedCp = scannedCp.toUpperCase();
    const expectedCpPrefix = `BARAKA:CP:${course.id}:${checkpoint.code}`.toUpperCase();
    const qrMatch =
      Boolean(scannedCp) &&
      (scannedCp === checkpoint.qrSecret ||
        upperScannedCp === expectedCpPrefix ||
        upperScannedCp.startsWith(`${expectedCpPrefix}:`));

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
    recalculateSessionScore(session, course);

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

    const scannedFinish = (payload.qrPayloadScanned || '').trim();
    const expectedFinishPrefix = `BARAKA:FINISH:${course.id}`.toUpperCase();
    const isFinishMatch =
      scannedFinish === course.finishQrCode ||
      scannedFinish.toUpperCase() === expectedFinishPrefix;

    if (!isFinishMatch) {
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
      recalculateSessionScore(session, course);
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

export const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'BARAKA ADVENTURE',
    serverTime: new Date().toISOString(),
  });
});

// --------------------------------------------------------------------------
// AUTENTIKASI ORGANIZER & SUPERADMIN (FLEKSIBEL: PIN SAJA ATAU USERNAME + PIN)
// --------------------------------------------------------------------------
app.post('/api/organizer/login', (req, res) => {
  const { username, pin } = req.body as { username?: string; pin?: string };
  if (!pin || !String(pin).trim()) {
    res.status(400).json({ error: 'PIN Organizer / Superadmin wajib diisi.' });
    return;
  }

  const trimmedPin = String(pin).trim();
  const trimmedUsername = (username || '').trim().toLowerCase();
  const orgList = db.organizers || [];

  // 1. Jika Username diisi secara eksplisit
  if (trimmedUsername) {
    const isSuperAdminQuery =
      trimmedUsername === 'superadmin' ||
      trimmedUsername === 'admin' ||
      trimmedUsername === 'master' ||
      trimmedUsername === 'pusat';

    if (isSuperAdminQuery) {
      const validSuper = verifyPin(
        trimmedPin,
        db.organizerAuth.pinHash,
        db.organizerAuth.pinSalt
      );
      if (!validSuper) {
        res.status(401).json({ error: 'PIN Superadmin tidak sesuai.' });
        return;
      }
      const token = createOrganizerToken('SUPERADMIN', true);
      db.organizerTokens.push(token);
      saveDb(db);
      res.json({
        token,
        role: 'SUPERADMIN',
        organizer: getSuperAdminPublicProfile(),
      });
      return;
    }

    const matchedOrg = orgList.find(
      (o) =>
        o.username.toLowerCase() === trimmedUsername ||
        o.code.toLowerCase() === trimmedUsername ||
        o.name.toLowerCase() === trimmedUsername
    );

    if (!matchedOrg || !verifyPin(trimmedPin, matchedOrg.pinHash, matchedOrg.pinSalt)) {
      res.status(401).json({
        error: 'Username/ID Organizer atau PIN tidak cocok.',
      });
      return;
    }

    if (matchedOrg.isActive === false) {
      res.status(403).json({
        error: 'Akun Organizer ini sedang dinonaktifkan oleh Superadmin.',
      });
      return;
    }

    const token = createOrganizerToken(matchedOrg.id, false);
    saveDb(db);
    res.json({
      token,
      role: 'ORGANIZER',
      organizer: toPublicOrganizer(matchedOrg),
    });
    return;
  }

  // 2. Jika HANYA mengisi PIN saja (tanpa Username)
  const isSuperAdminPin = verifyPin(
    trimmedPin,
    db.organizerAuth.pinHash,
    db.organizerAuth.pinSalt
  );
  if (isSuperAdminPin) {
    const token = createOrganizerToken('SUPERADMIN', true);
    db.organizerTokens.push(token);
    saveDb(db);
    res.json({
      token,
      role: 'SUPERADMIN',
      organizer: getSuperAdminPublicProfile(),
    });
    return;
  }

  const matchedByPin = orgList.find((o) =>
    verifyPin(trimmedPin, o.pinHash, o.pinSalt)
  );
  if (!matchedByPin) {
    res.status(401).json({
      error: 'PIN Organizer tidak dikenali. Pastikan PIN benar atau masukkan Username.',
    });
    return;
  }

  if (matchedByPin.isActive === false) {
    res.status(403).json({
      error: 'Akun Organizer ini sedang dinonaktifkan oleh Superadmin.',
    });
    return;
  }

  const token = createOrganizerToken(matchedByPin.id, false);
  saveDb(db);
  res.json({
    token,
    role: 'ORGANIZER',
    organizer: toPublicOrganizer(matchedByPin),
  });
});

app.post('/api/organizer/change-pin', requireOrganizer, (req, res) => {
  const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
  const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };
  if (!currentPin || !newPin || String(newPin).trim().length < 4) {
    res.status(400).json({ error: 'PIN baru minimal 4 karakter.' });
    return;
  }

  const cleanNewPin = String(newPin).trim();
  const orgList = db.organizers || [];

  if (auth.isSuperAdmin) {
    if (!verifyPin(currentPin, db.organizerAuth.pinHash, db.organizerAuth.pinSalt)) {
      res.status(401).json({ error: 'PIN Superadmin saat ini tidak sesuai.' });
      return;
    }
    const conflictOrg = orgList.find((o) => verifyPin(cleanNewPin, o.pinHash, o.pinSalt));
    if (conflictOrg) {
      res.status(400).json({
        error: `PIN tersebut sudah dipakai oleh Organizer "${conflictOrg.name}". Gunakan PIN lain agar login cepat tetap unik.`,
      });
      return;
    }
    const updated = hashPin(cleanNewPin);
    db.organizerAuth = { pinHash: updated.hash, pinSalt: updated.salt };
    saveDb(db);
    res.json({ message: 'PIN Superadmin berhasil diperbarui dengan aman (hashed).' });
    return;
  }

  const targetOrg = orgList.find((o) => o.id === auth.organizerId);
  if (!targetOrg) {
    res.status(404).json({ error: 'Akun Organizer tidak ditemukan.' });
    return;
  }
  if (!verifyPin(currentPin, targetOrg.pinHash, targetOrg.pinSalt)) {
    res.status(401).json({ error: 'PIN Organizer saat ini tidak sesuai.' });
    return;
  }
  if (verifyPin(cleanNewPin, db.organizerAuth.pinHash, db.organizerAuth.pinSalt)) {
    res.status(400).json({ error: 'PIN baru tidak boleh sama dengan PIN Superadmin.' });
    return;
  }
  const conflictOther = orgList.find(
    (o) => o.id !== targetOrg.id && verifyPin(cleanNewPin, o.pinHash, o.pinSalt)
  );
  if (conflictOther) {
    res.status(400).json({
      error: 'PIN baru tersebut sudah digunakan Organizer lain. Silakan pilih kombinasi PIN berbeda.',
    });
    return;
  }
  const updated = hashPin(cleanNewPin);
  targetOrg.pinHash = updated.hash;
  targetOrg.pinSalt = updated.salt;
  saveDb(db);
  res.json({ message: 'PIN Organizer berhasil diperbarui.' });
});

// --------------------------------------------------------------------------
// MANAJEMEN AKUN ORGANIZER OLEH SUPERADMIN
// --------------------------------------------------------------------------
app.get('/api/organizer/accounts', requireSuperAdmin, (_req, res) => {
  const orgList = db.organizers || [];
  res.json({
    organizers: orgList.map(toPublicOrganizer),
  });
});

app.post('/api/organizer/accounts', requireSuperAdmin, (req, res) => {
  const { name, username, organization, pin } = req.body as {
    name?: string;
    username?: string;
    organization?: string;
    pin?: string;
  };

  if (!name || !name.trim() || !pin || String(pin).trim().length < 4) {
    res.status(400).json({
      error: 'Nama Organizer dan PIN Login (minimal 4 karakter) wajib diisi.',
    });
    return;
  }

  const cleanPin = String(pin).trim();
  if (!Array.isArray(db.organizers)) {
    db.organizers = [];
  }

  // Pastikan PIN unik agar Organizer bisa login cukup dengan mengetik PIN saja maupun Username + PIN
  if (verifyPin(cleanPin, db.organizerAuth.pinHash, db.organizerAuth.pinSalt)) {
    res.status(400).json({
      error: 'PIN Organizer tidak boleh sama dengan PIN Superadmin Utama.',
    });
    return;
  }

  const pinConflict = db.organizers.find((o) =>
    verifyPin(cleanPin, o.pinHash, o.pinSalt)
  );
  if (pinConflict) {
    res.status(400).json({
      error: `PIN ini sudah digunakan oleh Organizer "${pinConflict.name}" (${pinConflict.code}). Gunakan PIN unik agar panitia bisa login langsung dengan PIN.`,
    });
    return;
  }

  const nextIndex = db.organizers.length + 1;
  const code = `ORG-${String(nextIndex).padStart(2, '0')}`;
  const cleanUsername = (username || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '') || code.toLowerCase();

  if (
    ['superadmin', 'admin', 'master', 'pusat'].includes(cleanUsername) ||
    db.organizers.some(
      (o) =>
        o.username.toLowerCase() === cleanUsername ||
        o.code.toLowerCase() === cleanUsername
    )
  ) {
    res.status(400).json({
      error: `Username "${cleanUsername}" sudah terdaftar. Gunakan username lain.`,
    });
    return;
  }

  const { hash, salt } = hashPin(cleanPin);
  const newOrganizer: StoredOrganizer = {
    id: `org-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    code,
    username: cleanUsername,
    name: name.trim(),
    organization: (organization || '').trim(),
    isSuperAdmin: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    pinHash: hash,
    pinSalt: salt,
  };

  db.organizers.push(newOrganizer);
  saveDb(db);

  res.status(201).json({
    organizer: toPublicOrganizer(newOrganizer),
    organizers: db.organizers.map(toPublicOrganizer),
  });
});

app.put('/api/organizer/accounts/:organizerId', requireSuperAdmin, (req, res) => {
  const orgList = db.organizers || [];
  const target = orgList.find((o) => o.id === req.params.organizerId);
  if (!target) {
    res.status(404).json({ error: 'Akun Organizer tidak ditemukan.' });
    return;
  }

  const { name, username, organization, isActive, newPin } = req.body as {
    name?: string;
    username?: string;
    organization?: string;
    isActive?: boolean;
    newPin?: string;
  };

  if (name !== undefined && name.trim()) {
    target.name = name.trim();
  }
  if (organization !== undefined) {
    target.organization = organization.trim();
  }
  if (username !== undefined && username.trim()) {
    const cleanUser = username.trim().toLowerCase().replace(/\s+/g, '');
    const duplicateUser = orgList.some(
      (o) => o.id !== target.id && o.username.toLowerCase() === cleanUser
    );
    if (duplicateUser || ['superadmin', 'admin', 'master'].includes(cleanUser)) {
      res.status(400).json({ error: `Username "${cleanUser}" sudah digunakan.` });
      return;
    }
    target.username = cleanUser;
  }
  if (typeof isActive === 'boolean') {
    target.isActive = isActive;
  }

  if (newPin !== undefined && String(newPin).trim() !== '') {
    const cleanPin = String(newPin).trim();
    if (cleanPin.length < 4) {
      res.status(400).json({ error: 'PIN baru minimal 4 karakter.' });
      return;
    }
    if (verifyPin(cleanPin, db.organizerAuth.pinHash, db.organizerAuth.pinSalt)) {
      res.status(400).json({ error: 'PIN Organizer tidak boleh sama dengan PIN Superadmin.' });
      return;
    }
    const pinConflict = orgList.find(
      (o) => o.id !== target.id && verifyPin(cleanPin, o.pinHash, o.pinSalt)
    );
    if (pinConflict) {
      res.status(400).json({
        error: `PIN tersebut sudah digunakan oleh Organizer "${pinConflict.name}".`,
      });
      return;
    }
    const updatedHash = hashPin(cleanPin);
    target.pinHash = updatedHash.hash;
    target.pinSalt = updatedHash.salt;
  }

  saveDb(db);
  res.json({
    organizer: toPublicOrganizer(target),
    organizers: orgList.map(toPublicOrganizer),
  });
});

app.delete('/api/organizer/accounts/:organizerId', requireSuperAdmin, (req, res) => {
  if (!Array.isArray(db.organizers)) {
    db.organizers = [];
  }
  const idx = db.organizers.findIndex((o) => o.id === req.params.organizerId);
  if (idx === -1) {
    res.status(404).json({ error: 'Akun Organizer tidak ditemukan.' });
    return;
  }
  const removed = db.organizers[idx];
  db.organizers.splice(idx, 1);
  saveDb(db);
  res.json({
    deletedId: removed.id,
    organizers: db.organizers.map(toPublicOrganizer),
  });
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
  const token = createParticipantToken(newParticipant.id);
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

  const token = createParticipantToken(found.id);
  db.participantTokens[token] = found.id;
  saveDb(db);

    const activeSessions = db.sessions.filter((s) => s.participantId === found.id);
    // Prioritaskan sesi yang sedang berjalan (ACTIVE / NOT_STARTED) jika ada, atau sesi terakhir
    const unfinishedSession = [...activeSessions]
      .reverse()
      .find((s) => s.status !== SessionStatus.FINISHED);
    const latestSession =
      unfinishedSession ||
      (activeSessions.length > 0 ? activeSessions[activeSessions.length - 1] : null);
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
  // Mendukung Mulai Lagi dari Awal (Multi-Attempt) tanpa menghapus data sesi sebelumnya!
  // --------------------------------------------------------------------------
  app.post('/api/participant/load-event', requireParticipant, (req, res) => {
    const participantId = (req as Request & { participantId: string }).participantId;
    const {
      setupQrCode,
      backupCourses,
      participantSnapshot,
      forceNewSession,
    } = req.body as {
      setupQrCode?: string;
      backupCourses?: Course[];
      participantSnapshot?: ParticipantPublic;
      forceNewSession?: boolean;
    };

    if (!setupQrCode) {
      res.status(400).json({ error: 'Setup QR Code wajib dipindai.' });
      return;
    }

    // Pulihkan data peserta jika server baru cold-start
    if (
      participantSnapshot &&
      participantSnapshot.id === participantId &&
      !db.participants.some((p) => p.id === participantId)
    ) {
      const fallbackPin = hashPin('1111');
      db.participants.push({
        ...participantSnapshot,
        pinHash: fallbackPin.hash,
        pinSalt: fallbackPin.salt,
      });
    }

    // Pulihkan daftar course cadangan jika ada course yang belum tercatat di instance ini
    if (Array.isArray(backupCourses)) {
      const deletedSet = new Set(db.deletedCourseIds || []);
      backupCourses.forEach((bc) => {
        if (bc && bc.id && !deletedSet.has(bc.id) && !db.courses.some((c) => c.id === bc.id)) {
          db.courses.push(normalizeRestoredCourse(bc));
        }
      });
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

    const existingCourseSessions = db.sessions.filter(
      (s) => s.participantId === participantId && s.courseId === matchedCourse.id
    );

    // Cari sesi yang BELUM SELESAI (NOT_STARTED atau ACTIVE) pada course ini.
    // Jika sesi sebelumnya sudah FINISHED (atau peserta menekan tombol "Mulai Lagi dari Awal" / forceNewSession),
    // JANGAN menimpa atau menghapus sesi lama — buat sesi baru (Attempt berikutnya) agar riwayat sebelumnya tetap utuh!
    let session = forceNewSession
      ? undefined
      : [...existingCourseSessions]
          .reverse()
          .find((s) => s.status !== SessionStatus.FINISHED);

    if (!session) {
      const nextAttemptNumber = existingCourseSessions.length + 1;
      session = {
        id: `ses-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        courseId: matchedCourse.id,
        participantId,
        attemptNumber: nextAttemptNumber,
        status: SessionStatus.NOT_STARTED,
        loadedAt: new Date().toISOString(),
        validatedCheckpointIds: [],
        totalScore: 0,
      };
      db.sessions.push(session);
      saveDb(db);
    } else if (!session.attemptNumber) {
      const idx = existingCourseSessions.findIndex((s) => s.id === session!.id);
      session.attemptNumber = idx >= 0 ? idx + 1 : 1;
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
  // Dilengkapi Self-Healing Sesi & Course jika Server sempat Cold-Start
  // --------------------------------------------------------------------------
  app.post('/api/participant/reports/sync', requireParticipant, (req, res) => {
    const participantId = (req as Request & { participantId: string }).participantId;
    const {
      reports,
      sessionSnapshot,
      courseSnapshot,
      participantSnapshot,
    } = req.body as {
      reports?: IncomingReportPayload[];
      sessionSnapshot?: ParticipantSession | null;
      courseSnapshot?: Course | null;
      participantSnapshot?: ParticipantPublic | null;
    };

    if (!Array.isArray(reports) || reports.length === 0) {
      res.status(400).json({ error: 'Daftar laporan kosong.' });
      return;
    }

    const deletedSet = new Set(db.deletedCourseIds || []);

    // 1. Self-Healing Participant jika belum ada di memori server
    if (
      participantSnapshot &&
      participantSnapshot.id === participantId &&
      !db.participants.some((p) => p.id === participantId)
    ) {
      const fallbackPin = hashPin('1111');
      db.participants.push({
        ...participantSnapshot,
        pinHash: fallbackPin.hash,
        pinSalt: fallbackPin.salt,
      });
    }

    // 2. Self-Healing Course jika server baru cold-start dan course belum dihapus panitia
    if (
      courseSnapshot &&
      courseSnapshot.id &&
      !deletedSet.has(courseSnapshot.id) &&
      !db.courses.some((c) => c.id === courseSnapshot.id)
    ) {
      db.courses.push(normalizeRestoredCourse(courseSnapshot));
    }

    const sortedIncoming = [...reports].sort(
      (a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt)
    );

    // 3. Self-Healing Session & Status START sebelum memproses laporan Checkpoint
    const targetSessionId =
      sessionSnapshot?.id || sortedIncoming[0]?.sessionId;
    const targetCourseId =
      sessionSnapshot?.courseId ||
      courseSnapshot?.id ||
      sortedIncoming[0]?.courseId;

    if (targetSessionId && targetCourseId && !deletedSet.has(targetCourseId)) {
      let existingSession = db.sessions.find(
        (s) => s.id === targetSessionId && s.participantId === participantId
      );

      if (!existingSession) {
        const prevAttempts = db.sessions.filter(
          (s) => s.participantId === participantId && s.courseId === targetCourseId
        ).length;
        existingSession = {
          id: targetSessionId,
          courseId: targetCourseId,
          participantId,
          attemptNumber: sessionSnapshot?.attemptNumber || prevAttempts + 1,
          status: sessionSnapshot?.status || SessionStatus.NOT_STARTED,
          loadedAt: sessionSnapshot?.loadedAt || new Date().toISOString(),
          startedAt: sessionSnapshot?.startedAt,
          startedReceivedAt: sessionSnapshot?.startedReceivedAt,
          finishedAt: sessionSnapshot?.finishedAt,
          finishedReceivedAt: sessionSnapshot?.finishedReceivedAt,
          durationSeconds: sessionSnapshot?.durationSeconds,
          validatedCheckpointIds: Array.isArray(
            sessionSnapshot?.validatedCheckpointIds
          )
            ? [...sessionSnapshot.validatedCheckpointIds]
            : [],
          totalScore: sessionSnapshot?.totalScore || 0,
          grossScore: sessionSnapshot?.grossScore,
          overtimeMinutes: sessionSnapshot?.overtimeMinutes,
          penaltyPoints: sessionSnapshot?.penaltyPoints,
          lastLocation: sessionSnapshot?.lastLocation,
        };
        db.sessions.push(existingSession);
      }

      // Jika peserta sudah memiliki bukti START (dari sessionSnapshot atau dari laporan START di antrean),
      // pastikan status sesi di server adalah ACTIVE sebelum memvalidasi CHECKPOINT!
      const incomingStartReport = sortedIncoming.find(
        (r) => r.reportType === 'START'
      );
      const hasStartEvidence =
        sessionSnapshot?.status === SessionStatus.ACTIVE ||
        sessionSnapshot?.status === SessionStatus.FINISHED ||
        Boolean(sessionSnapshot?.startedAt) ||
        Boolean(incomingStartReport);

      if (
        existingSession.status === SessionStatus.NOT_STARTED &&
        hasStartEvidence
      ) {
        const startIso =
          sessionSnapshot?.startedAt ||
          incomingStartReport?.measuredAt ||
          sortedIncoming[0].measuredAt;
        existingSession.status = SessionStatus.ACTIVE;
        existingSession.startedAt = startIso;
        existingSession.startedReceivedAt =
          existingSession.startedReceivedAt || new Date().toISOString();
      }
      saveDb(db);
    }

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
    const courseIdQuery = (req.query.courseId as string | undefined)?.trim();
    const deletedSet = new Set(db.deletedCourseIds || []);

    if (courseIdQuery && deletedSet.has(courseIdQuery)) {
      res.status(404).json({
        error: 'Course telah dihapus oleh panitia.',
        sessionDeleted: true,
      });
      return;
    }

    const session = db.sessions.find(
      (s) => s.id === req.params.sessionId && s.participantId === participantId
    );
    if (!session) {
      const matchedByQuery = courseIdQuery
        ? db.courses.find((c) => c.id === courseIdQuery) || null
        : null;
      const sanitizedFallback: Course | null = matchedByQuery
        ? {
            ...matchedByQuery,
            startQrCode: 'HIDDEN_ON_CLIENT',
            finishQrCode: 'HIDDEN_ON_CLIENT',
            checkpoints: matchedByQuery.checkpoints.map((cp) => ({
              ...cp,
              qrSecret: 'VERIFIED_BY_SERVER',
            })),
          }
        : null;

      res.json({
        sessionMissingOnServer: true,
        course: sanitizedFallback,
        reports: [],
      });
      return;
    }

    if (deletedSet.has(session.courseId)) {
      res.status(404).json({
        error: 'Course telah dihapus oleh panitia.',
        sessionDeleted: true,
      });
      return;
    }

    const matchedCourse = db.courses.find((c) => c.id === session.courseId) || null;
    if (matchedCourse) {
      recalculateSessionScore(session, matchedCourse);
    }
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

    const sessionReports = db.reports.filter((r) => r.sessionId === session.id);
    res.json({
      session,
      course: sanitizedCourse,
      reports: sessionReports,
    });
  });

  // --------------------------------------------------------------------------
  // ENDPOINT DASHBOARD ORGANIZER (ISOLASI COURSE & PESERTA PER ORGANIZER)
  // Superadmin dapat melihat seluruh Course, Peserta, dan daftar akun Organizer.
  // Organizer biasa HANYA melihat Course buatannya sendiri dan peserta yang ikut di Course buatannya.
  // --------------------------------------------------------------------------
  app.get('/api/organizer/dashboard', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    const visibleCourses = db.courses.filter((c) => canAccessCourse(c, auth));
    const visibleCourseIds = new Set(visibleCourses.map((c) => c.id));

    const visibleSessions = auth.isSuperAdmin
      ? db.sessions
      : db.sessions.filter((s) => visibleCourseIds.has(s.courseId));

    const visibleReports = auth.isSuperAdmin
      ? db.reports
      : db.reports.filter((r) => visibleCourseIds.has(r.courseId));

    const participantIdsInOrganizerCourses = new Set(
      visibleSessions.map((s) => s.participantId)
    );

    const visibleParticipants = auth.isSuperAdmin
      ? db.participants.map(toPublicParticipant)
      : db.participants
          .filter(
            (p) =>
              participantIdsInOrganizerCourses.has(p.id) ||
              p.createdByOrganizerId === auth.organizerId
          )
          .map(toPublicParticipant);

    const currentOrganizer: OrganizerPublic = auth.isSuperAdmin
      ? getSuperAdminPublicProfile()
      : {
          id: auth.organizerId,
          code: auth.code,
          username: auth.username,
          name: auth.name,
          organization: auth.organization,
          isSuperAdmin: false,
          isActive: true,
          createdAt: new Date().toISOString(),
        };

    res.json({
      serverTime: new Date().toISOString(),
      currentOrganizer,
      organizers: auth.isSuperAdmin
        ? (db.organizers || []).map(toPublicOrganizer)
        : undefined,
      courses: visibleCourses,
      participants: visibleParticipants,
      sessions: visibleSessions,
      reports: visibleReports,
    });
  });

  // Buat Course Baru (Otomatis menempelkan identitas Organizer pembuatnya)
  app.post('/api/organizer/courses', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
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
      durationMinutes,
      overtimePenaltyEnabled,
      overtimePenaltyPointsPerMinute,
      startLocation,
      finishLocation,
    } = req.body as Partial<Course>;

    if (!name || !name.trim() || !date) {
      res.status(400).json({ error: 'Nama Course dan Tanggal wajib diisi.' });
      return;
    }

    const courseId = `crs-${Date.now()}`;
    const parsedDuration =
      durationMinutes !== undefined && Number(durationMinutes) > 0
        ? Math.round(Number(durationMinutes))
        : 0;
    const parsedPenaltyRate =
      overtimePenaltyPointsPerMinute !== undefined &&
      !Number.isNaN(Number(overtimePenaltyPointsPerMinute))
        ? Math.max(0, Number(overtimePenaltyPointsPerMinute))
        : 0;

    const newCourse: Course = {
      id: courseId,
      name: name.trim(),
      description: description?.trim() || '',
      locationName: locationName?.trim() || '',
      date,
      isActive: true,
      scoringEnabled: scoringEnabled !== undefined ? Boolean(scoringEnabled) : true,
      createdAt: new Date().toISOString(),
      createdByOrganizerId: auth.organizerId,
      createdByOrganizerName: auth.name,
      validationMethod: validationMethod || ValidationMethod.QR_ONLY,
      defaultGpsRadiusMeters: Number(defaultGpsRadiusMeters) || 35,
      enforceOrder: enforceOrder !== undefined ? Boolean(enforceOrder) : true,
      allowParticipantMapVisibility:
        allowParticipantMapVisibility !== undefined
          ? Boolean(allowParticipantMapVisibility)
          : true,
      durationMinutes: parsedDuration,
      overtimePenaltyEnabled: Boolean(overtimePenaltyEnabled),
      overtimePenaltyPointsPerMinute: parsedPenaltyRate,
      startLocation:
        startLocation &&
        typeof startLocation.latitude === 'number' &&
        typeof startLocation.longitude === 'number'
          ? startLocation
          : undefined,
      finishLocation:
        finishLocation &&
        typeof finishLocation.latitude === 'number' &&
        typeof finishLocation.longitude === 'number'
          ? finishLocation
          : undefined,
      setupQrCode: `BARAKA:SETUP:${courseId}`,
      startQrCode: `BARAKA:START:${courseId}`,
      finishQrCode: `BARAKA:FINISH:${courseId}`,
      checkpoints: [],
    };

    db.courses.push(newCourse);
    saveDb(db);
    res.status(201).json({ course: newCourse });
  });

  // Perbarui / Edit Pengaturan Course Aktif (Hanya Pemilik Course atau Superadmin)
  app.put('/api/organizer/courses/:courseId', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    const course = db.courses.find((c) => c.id === req.params.courseId);
    if (!course) {
      res.status(404).json({ error: 'Course tidak ditemukan.' });
      return;
    }
    if (!canAccessCourse(course, auth)) {
      res.status(403).json({
        error: 'Anda hanya dapat mengelola Course yang Anda buat sendiri.',
      });
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
      durationMinutes,
      overtimePenaltyEnabled,
      overtimePenaltyPointsPerMinute,
      startLocation,
      finishLocation,
    } = req.body as Partial<Course> & {
      startLocation?: GeoPointLocation | null;
      finishLocation?: GeoPointLocation | null;
    };

    if (name !== undefined && name.trim()) course.name = name.trim();
    if (description !== undefined) course.description = description.trim();
    if (locationName !== undefined) course.locationName = locationName.trim();
    if (date !== undefined && date) course.date = date;
    if (scoringEnabled !== undefined) course.scoringEnabled = Boolean(scoringEnabled);
    if (validationMethod !== undefined) course.validationMethod = validationMethod;
    if (defaultGpsRadiusMeters !== undefined) {
      course.defaultGpsRadiusMeters = Math.max(5, Number(defaultGpsRadiusMeters) || 35);
    }
    if (enforceOrder !== undefined) course.enforceOrder = Boolean(enforceOrder);
    if (allowParticipantMapVisibility !== undefined) {
      course.allowParticipantMapVisibility = Boolean(allowParticipantMapVisibility);
    }
    if (durationMinutes !== undefined) {
      course.durationMinutes = Math.max(0, Math.round(Number(durationMinutes) || 0));
    }
    if (overtimePenaltyEnabled !== undefined) {
      course.overtimePenaltyEnabled = Boolean(overtimePenaltyEnabled);
    }
    if (overtimePenaltyPointsPerMinute !== undefined) {
      course.overtimePenaltyPointsPerMinute = Math.max(
        0,
        Number(overtimePenaltyPointsPerMinute) || 0
      );
    }
    if (startLocation !== undefined) {
      course.startLocation =
        startLocation &&
        typeof startLocation.latitude === 'number' &&
        typeof startLocation.longitude === 'number'
          ? startLocation
          : undefined;
    }
    if (finishLocation !== undefined) {
      course.finishLocation =
        finishLocation &&
        typeof finishLocation.latitude === 'number' &&
        typeof finishLocation.longitude === 'number'
          ? finishLocation
          : undefined;
    }

    // Hitung ulang skor sesi pada course ini bila aturan durasi/penalti/poin berubah
    db.sessions
      .filter((s) => s.courseId === course.id)
      .forEach((s) => recalculateSessionScore(s, course));

    saveDb(db);
    res.json({ course });
  });

  // Sinkronisasi / Pulihkan Cadangan Course Organizer jika Server sempat Cold-Start
  app.post('/api/organizer/courses/sync-backup', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    const { courses: backupCourses } = req.body as { courses?: Course[] };
    if (Array.isArray(backupCourses)) {
      const deletedSet = new Set(db.deletedCourseIds || []);
      let changed = false;
      backupCourses.forEach((bc) => {
        if (!bc || !bc.id || deletedSet.has(bc.id)) return;
        // Organizer biasa hanya memulihkan course miliknya sendiri
        if (
          !auth.isSuperAdmin &&
          bc.createdByOrganizerId &&
          bc.createdByOrganizerId !== auth.organizerId
        ) {
          return;
        }
        const normalized = normalizeRestoredCourse({
          ...bc,
          createdByOrganizerId:
            bc.createdByOrganizerId || (auth.isSuperAdmin ? undefined : auth.organizerId),
          createdByOrganizerName:
            bc.createdByOrganizerName || (auth.isSuperAdmin ? undefined : auth.name),
        });
        const existingIdx = db.courses.findIndex((c) => c.id === bc.id);
        if (existingIdx === -1) {
          db.courses.push(normalized);
          changed = true;
        } else if (
          canAccessCourse(db.courses[existingIdx], auth) &&
          JSON.stringify(db.courses[existingIdx]) !== JSON.stringify(normalized)
        ) {
          db.courses[existingIdx] = normalized;
          db.sessions
            .filter((s) => s.courseId === normalized.id)
            .forEach((s) => recalculateSessionScore(s, normalized));
          changed = true;
        }
      });
      if (changed) {
        saveDb(db);
      }
    }
    const visibleCourses = db.courses.filter((c) => canAccessCourse(c, auth));
    res.json({ courses: visibleCourses });
  });

  // Hapus Course Aktif beserta sesi & laporannya (Hanya Pemilik Course atau Superadmin)
  app.delete('/api/organizer/courses/:courseId', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    const targetId = req.params.courseId;
    const courseIndex = db.courses.findIndex((c) => c.id === targetId);
    if (courseIndex !== -1 && !canAccessCourse(db.courses[courseIndex], auth)) {
      res.status(403).json({
        error: 'Anda tidak memiliki izin untuk menghapus Course milik Organizer lain.',
      });
      return;
    }

    if (!Array.isArray(db.deletedCourseIds)) {
      db.deletedCourseIds = [];
    }
    if (!db.deletedCourseIds.includes(targetId)) {
      db.deletedCourseIds.push(targetId);
    }
    if (courseIndex === -1) {
      saveDb(db);
      res.json({
        deletedCourseId: targetId,
        courses: db.courses.filter((c) => canAccessCourse(c, auth)),
      });
      return;
    }

    const deletedCourseId = db.courses[courseIndex].id;
    db.courses.splice(courseIndex, 1);
    db.sessions = db.sessions.filter((s) => s.courseId !== deletedCourseId);
    db.reports = db.reports.filter((r) => r.courseId !== deletedCourseId);

    saveDb(db);
    res.json({
      deletedCourseId,
      courses: db.courses.filter((c) => canAccessCourse(c, auth)),
    });
  });

  // Tambah Checkpoint ke dalam Course (Nama Lokasi Pos bersifat Opsional)
  app.post(
    '/api/organizer/courses/:courseId/checkpoints',
    requireOrganizer,
    (req, res) => {
      const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
      const course = db.courses.find((c) => c.id === req.params.courseId);
      if (!course) {
        res.status(404).json({ error: 'Course tidak ditemukan.' });
        return;
      }
      if (!canAccessCourse(course, auth)) {
        res.status(403).json({
          error: 'Anda hanya dapat menambah Checkpoint pada Course yang Anda buat sendiri.',
        });
        return;
      }

      const { code, name, latitude, longitude, radiusMeters, points } =
        req.body as Partial<Checkpoint>;
      if (
        !code ||
        !code.trim() ||
        typeof latitude !== 'number' ||
        Number.isNaN(latitude) ||
        typeof longitude !== 'number' ||
        Number.isNaN(longitude)
      ) {
        res.status(400).json({
          error: 'Kode pos serta koordinat latitude & longitude wajib valid.',
        });
        return;
      }

      const nextOrder = course.checkpoints.length + 1;
      const cleanCode = code.trim().toUpperCase();
      const secretSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
      const parsedPoints =
        points !== undefined && !Number.isNaN(Number(points))
          ? Math.max(0, Number(points))
          : 100;
      const parsedRadius =
        radiusMeters !== undefined && Number(radiusMeters) > 0
          ? Number(radiusMeters)
          : course.defaultGpsRadiusMeters || 35;

      const newCp: Checkpoint = {
        id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        courseId: course.id,
        code: cleanCode,
        name: (name || '').trim(),
        orderIndex: nextOrder,
        qrSecret: `BARAKA:CP:${course.id}:${cleanCode}:${secretSuffix}`,
        latitude,
        longitude,
        radiusMeters: parsedRadius,
        points: parsedPoints,
      };

      course.checkpoints.push(newCp);
      saveDb(db);
      res.status(201).json({ checkpoint: newCp, course });
    }
  );

  // Edit / Update Checkpoint yang sudah ada di dalam Course
  app.put(
    '/api/organizer/courses/:courseId/checkpoints/:checkpointId',
    requireOrganizer,
    (req, res) => {
      const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
      const course = db.courses.find((c) => c.id === req.params.courseId);
      if (!course) {
        res.status(404).json({ error: 'Course tidak ditemukan.' });
        return;
      }
      if (!canAccessCourse(course, auth)) {
        res.status(403).json({
          error: 'Anda hanya dapat mengedit Checkpoint pada Course yang Anda buat sendiri.',
        });
        return;
      }

      const cp = course.checkpoints.find((item) => item.id === req.params.checkpointId);
      if (!cp) {
        res.status(404).json({ error: 'Checkpoint tidak ditemukan.' });
        return;
      }

      const { code, name, latitude, longitude, radiusMeters, points } =
        req.body as Partial<Checkpoint>;

      if (code !== undefined && code.trim()) {
        const nextCode = code.trim().toUpperCase();
        if (nextCode !== cp.code) {
          const parts = cp.qrSecret.split(':');
          const suffix =
            parts[4] || crypto.randomBytes(2).toString('hex').toUpperCase();
          cp.code = nextCode;
          cp.qrSecret = `BARAKA:CP:${course.id}:${nextCode}:${suffix}`;
        }
      }
      if (name !== undefined) {
        cp.name = name.trim();
      }
      if (typeof latitude === 'number' && !Number.isNaN(latitude)) {
        cp.latitude = latitude;
      }
      if (typeof longitude === 'number' && !Number.isNaN(longitude)) {
        cp.longitude = longitude;
      }
      if (radiusMeters !== undefined && Number(radiusMeters) > 0) {
        cp.radiusMeters = Number(radiusMeters);
      }
      if (points !== undefined && !Number.isNaN(Number(points))) {
        cp.points = Math.max(0, Number(points));
      }

      db.sessions
        .filter((s) => s.courseId === course.id)
        .forEach((s) => recalculateSessionScore(s, course));

      saveDb(db);
      res.json({ checkpoint: cp, course });
    }
  );

  // Hapus Checkpoint
  app.delete(
    '/api/organizer/courses/:courseId/checkpoints/:checkpointId',
    requireOrganizer,
    (req, res) => {
      const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
      const course = db.courses.find((c) => c.id === req.params.courseId);
      if (!course) {
        res.status(404).json({ error: 'Course tidak ditemukan.' });
        return;
      }
      if (!canAccessCourse(course, auth)) {
        res.status(403).json({
          error: 'Anda hanya dapat menghapus Checkpoint pada Course yang Anda buat sendiri.',
        });
        return;
      }

      course.checkpoints = course.checkpoints
        .filter((cp) => cp.id !== req.params.checkpointId)
        .map((cp, index) => ({ ...cp, orderIndex: index + 1 }));

      db.sessions
        .filter((s) => s.courseId === course.id)
        .forEach((s) => recalculateSessionScore(s, course));

      saveDb(db);
      res.json({ course });
    }
  );

  // Tambah Peserta oleh Organizer (Nama Tim Wajib & PIN di-hash + terikat ke Organizer pembuat)
  app.post('/api/organizer/participants', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
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
      createdByOrganizerId: auth.organizerId,
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
// VITE MIDDLEWARE (DEVELOPMENT) ATAU STATIC FILES (NON-VERCEL STANDALONE)
// --------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const { createServer: createViteServer } = await import('vite');
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

if (!process.env.VERCEL) {
  startServer();
}

export default app;

