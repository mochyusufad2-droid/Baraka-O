import { execSync } from 'child_process';
import crypto from 'crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { initializeApp as initializeFirebaseApp, getApps as getFirebaseApps } from 'firebase/app';
import {
  getFirestore as getCloudFirestore,
  setLogLevel as setFirestoreLogLevel,
  doc as firestoreDoc,
  getDoc as firestoreGetDoc,
  setDoc as firestoreSetDoc,
  serverTimestamp as firestoreServerTimestamp,
} from 'firebase/firestore';
import firebaseAppletConfig from './firebase-applet-config.json' with { type: 'json' };
import type {
  Checkpoint,
  CheckpointReport,
  Course,
  CourseRaceMode as CourseRaceModeType,
  GeoPointLocation,
  LastKnownLocation,
  OrganizerBackupRecord,
  OrganizerPublic,
  OrganizerVaultBackup,
  ParticipantBackupRecord,
  ParticipantPublic,
  ParticipantSession,
  RelayDnfScoringMode as RelayDnfScoringModeType,
  SessionStatus as SessionStatusType,
  SyncStatus as SyncStatusType,
  ValidationMethod as ValidationMethodType,
} from './src/types.ts';

const CourseRaceMode = {
  REGULAR: 'REGULAR' as CourseRaceModeType,
  RELAY: 'RELAY' as CourseRaceModeType,
};

const RelayDnfScoringMode = {
  ZERO: 'ZERO' as RelayDnfScoringModeType,
  PARTIAL_WITH_PENALTY: 'PARTIAL_WITH_PENALTY' as RelayDnfScoringModeType,
};

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

const ROOT_DIR =
  typeof __dirname !== 'undefined'
    ? __dirname
    : typeof import.meta?.url === 'string'
      ? path.dirname(fileURLToPath(import.meta.url))
      : process.cwd();

const isAiStudioPreviewProxy = Boolean(process.env.NGINX_PORT && process.env.DEFAULT_APP_PORT);
const PORT: number | string =
  process.env.CPANEL_PORT ||
  (!isAiStudioPreviewProxy && process.env.PORT
    ? Number.isNaN(Number(process.env.PORT))
      ? process.env.PORT
      : Number(process.env.PORT)
    : 3000);
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'baraka-data')
  : path.join(ROOT_DIR, 'data');
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

interface StoredParticipant extends ParticipantBackupRecord {
  pinHash: string;
  pinSalt: string;
}

interface StoredOrganizer extends OrganizerBackupRecord {
  pinHash: string;
  pinSalt: string;
}

interface DatabaseSchema {
  organizerAuth: {
    pinHash: string;
    pinSalt: string;
    username?: string;
  };
  organizers?: StoredOrganizer[];
  deletedOrganizerIds?: string[];
  organizerTokens: string[];
  participantTokens: Record<string, string>; // token -> participantId
  courses: Course[];
  deletedCourseIds?: string[];
  participants: StoredParticipant[];
  deletedParticipantIds?: string[];
  sessions: ParticipantSession[];
  deletedSessionIds?: string[];
  reports: CheckpointReport[];
  historicalCourses?: Record<
    string,
    { name: string; locationName: string; date?: string }
  >;
  historicalOrganizers?: Record<
    string,
    { name: string; organization?: string }
  >;
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
      username: 'superadmin',
    },
    organizerTokens: [],
    participantTokens: {},
    courses: initialCourses,
    participants: [
      {
        id: 'ptc-demo-01',
        name: 'Budi Santoso',
        teamName: 'Garuda Rimba',
        gender: 'Male',
        ageGroup: '21-24',
        phone: '081234567890',
        bibNumber: 'BRK-101',
        registeredAt: new Date().toISOString(),
        pinHash: sampleParticipantPin.hash,
        pinSalt: sampleParticipantPin.salt,
      },
    ],
    deletedCourseIds: [],
    deletedOrganizerIds: [],
    deletedParticipantIds: [],
    deletedSessionIds: [],
    organizers: [],
    sessions: [],
    reports: [],
  };
}

function normalizeRestoredCourse(raw: Course): Course {
  const courseId = raw.id;
  return {
    ...raw,
    raceMode:
      raw.raceMode === CourseRaceMode.RELAY
        ? CourseRaceMode.RELAY
        : CourseRaceMode.REGULAR,
    relaySubTeamCount:
      raw.relaySubTeamCount !== undefined
        ? Math.max(2, Math.min(20, Math.round(Number(raw.relaySubTeamCount) || 3)))
        : 3,
    relayEnforceSequential:
      raw.relayEnforceSequential !== undefined
        ? Boolean(raw.relayEnforceSequential)
        : true,
    relayDnfScoringMode:
      raw.relayDnfScoringMode === RelayDnfScoringMode.ZERO
        ? RelayDnfScoringMode.ZERO
        : RelayDnfScoringMode.PARTIAL_WITH_PENALTY,
    relayDnfPenaltyPoints:
      raw.relayDnfPenaltyPoints !== undefined
        ? Math.max(0, Number(raw.relayDnfPenaltyPoints) || 0)
        : 0,
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
    if (!Array.isArray(parsed.deletedOrganizerIds)) {
      parsed.deletedOrganizerIds = [];
    }
    if (!Array.isArray(parsed.deletedParticipantIds)) {
      parsed.deletedParticipantIds = [];
    }
    if (!Array.isArray(parsed.deletedSessionIds)) {
      parsed.deletedSessionIds = [];
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
    recoverOrphanedOrganizersFromCourses(parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Jika ada Course yang dibuat oleh Organizer (memiliki createdByOrganizerId & createdByOrganizerName)
 * tetapi akun Organizer tersebut sempat hilang dari db.organizers (dan tidak ada di deletedOrganizerIds),
 * pulihkan otomatis akun Organizer tersebut agar kembali muncul di Superadmin!
 */
function recoverOrphanedOrganizersFromCourses(targetDb: DatabaseSchema): boolean {
  if (!Array.isArray(targetDb.organizers)) {
    targetDb.organizers = [];
  }
  const deletedOrgSet = new Set(targetDb.deletedOrganizerIds || []);
  let recoveredAny = false;

  for (const course of targetDb.courses || []) {
    const orgId = course.createdByOrganizerId;
    if (
      !orgId ||
      orgId === 'SUPERADMIN' ||
      deletedOrgSet.has(orgId) ||
      targetDb.organizers.some((o) => o.id === orgId)
    ) {
      continue;
    }

    const fallbackPin = hashPin('1111');
    const nextIdx = targetDb.organizers.length + 1;
    const code = `ORG-${String(nextIdx).padStart(2, '0')}`;
    const rawName = (course.createdByOrganizerName || `Organizer ${nextIdx}`).trim();
    const cleanUser =
      rawName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 16) || code.toLowerCase();

    targetDb.organizers.push({
      id: orgId,
      code,
      username: cleanUser,
      name: rawName,
      organization: '',
      isSuperAdmin: false,
      isActive: true,
      createdAt: course.createdAt || new Date().toISOString(),
      pinHash: fallbackPin.hash,
      pinSalt: fallbackPin.salt,
    });
    recoveredAny = true;
  }

  return recoveredAny;
}

function computeNextBibNumber(participants: StoredParticipant[]): string {
  let maxNum = 100;
  for (const p of participants) {
    const match = /^BRK-(\d+)$/i.exec((p.bibNumber || '').trim());
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }
  return `BRK-${maxNum + 1}`;
}

function saveDbToDiskOnly(dbToSave: DatabaseSchema): void {
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

// ============================================================================
// 3B. LAPIS CLOUD FIRESTORE PERSISTENCE (MULTI-DEVICE & ANTI COLD-START)
// ============================================================================

const CORE_VAULT_KEY = 'brk_vault_7e77298f_9df4_4a92_9135_7facdb364e9e_core_v2';
const RACE_VAULT_KEY = 'brk_vault_7e77298f_9df4_4a92_9135_7facdb364e9e_race_v2';

let cloudFirestore: any = null;
try {
  const isStandalone = process.env.STANDALONE_MODE === 'true';
  const hasConfig = Boolean(
    firebaseAppletConfig &&
    typeof firebaseAppletConfig === 'object' &&
    (firebaseAppletConfig as { projectId?: string }).projectId
  );
  if (!isStandalone && hasConfig) {
    setFirestoreLogLevel('silent');
    const firebaseServerApp =
      getFirebaseApps().length > 0
        ? getFirebaseApps()[0]
        : initializeFirebaseApp(firebaseAppletConfig, 'baraka-server-vault');
    const dbId = (firebaseAppletConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
    cloudFirestore = dbId
      ? getCloudFirestore(firebaseServerApp, dbId)
      : getCloudFirestore(firebaseServerApp);
  }
} catch {
  cloudFirestore = null;
}

interface CoreVaultPayload {
  organizerAuth?: { pinHash: string; pinSalt: string; username?: string };
  organizers?: StoredOrganizer[];
  deletedOrganizerIds?: string[];
  courses?: Course[];
  deletedCourseIds?: string[];
  participants?: StoredParticipant[];
  deletedParticipantIds?: string[];
}

interface RaceVaultPayload {
  sessions?: ParticipantSession[];
  deletedSessionIds?: string[];
  reports?: CheckpointReport[];
}

let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
let isPushingToCloud = false;
let isCloudHydrated = false;
let lastCloudHydratedAt = 0;
let cloudHydrationPromise: Promise<void> | null = null;
const CLOUD_HYDRATE_TTL_MS = 2500;

async function pushDbToCloudNow(dbSnapshot: DatabaseSchema): Promise<void> {
  if (!cloudFirestore) return;
  isPushingToCloud = true;
  try {
    const nowIso = new Date().toISOString();
    const corePayload: CoreVaultPayload = {
      organizerAuth: dbSnapshot.organizerAuth,
      organizers: dbSnapshot.organizers || [],
      deletedOrganizerIds: dbSnapshot.deletedOrganizerIds || [],
      courses: dbSnapshot.courses || [],
      deletedCourseIds: dbSnapshot.deletedCourseIds || [],
      participants: dbSnapshot.participants || [],
      deletedParticipantIds: dbSnapshot.deletedParticipantIds || [],
    };
    const racePayload: RaceVaultPayload = {
      sessions: dbSnapshot.sessions || [],
      deletedSessionIds: dbSnapshot.deletedSessionIds || [],
      reports: dbSnapshot.reports || [],
    };

    const coreJson = JSON.stringify(corePayload);
    const raceJson = JSON.stringify(racePayload);

    await Promise.all([
      coreJson.length <= 940000
        ? firestoreSetDoc(firestoreDoc(cloudFirestore, 'server_vaults', CORE_VAULT_KEY), {
            id: CORE_VAULT_KEY,
            payloadJson: coreJson,
            updatedAtIso: nowIso,
            updatedAt: firestoreServerTimestamp(),
          })
        : Promise.resolve(),
      raceJson.length <= 940000
        ? firestoreSetDoc(firestoreDoc(cloudFirestore, 'server_vaults', RACE_VAULT_KEY), {
            id: RACE_VAULT_KEY,
            payloadJson: raceJson,
            updatedAtIso: nowIso,
            updatedAt: firestoreServerTimestamp(),
          })
        : Promise.resolve(),
    ]);
    lastCloudHydratedAt = Date.now();
  } catch {
    // Tetap berjalan lancar menggunakan penyimpanan lokal jika jaringan/cloud offline sementara
  } finally {
    isPushingToCloud = false;
  }
}

function scheduleCloudSync(dbToSync: DatabaseSchema): void {
  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
  }
  cloudSyncTimer = setTimeout(() => {
    cloudSyncTimer = null;
    void pushDbToCloudNow(dbToSync);
  }, 180);
}

/**
 * Menggabungkan dua snapshot sesi peserta secara monotonik:
 * Sesi yang sudah lebih maju (mis. FINISHED, skor lebih tinggi, pos tervalidasi lebih banyak,
 * atau durasi tempuh resmi sudah tercatat) tidak akan pernah mundur ke snapshot lama.
 */
function mergeSessionMonotonicallyServer(
  current: ParticipantSession,
  incoming: ParticipantSession
): ParticipantSession {
  const statusRank = (st: SessionStatusType): number => {
    if (st === SessionStatus.FINISHED) return 3;
    if (st === SessionStatus.ACTIVE) return 2;
    return 1;
  };

  const curRank = statusRank(current.status);
  const incRank = statusRank(incoming.status);
  const winningStatus = curRank >= incRank ? current.status : incoming.status;

  const mergedCpIds: string[] = [];
  const primaryCpList =
    (incoming.validatedCheckpointIds?.length || 0) >=
    (current.validatedCheckpointIds?.length || 0)
      ? incoming.validatedCheckpointIds || []
      : current.validatedCheckpointIds || [];
  const secondaryCpList =
    primaryCpList === (incoming.validatedCheckpointIds || [])
      ? current.validatedCheckpointIds || []
      : incoming.validatedCheckpointIds || [];

  for (const cpId of [...primaryCpList, ...secondaryCpList]) {
    if (cpId && !mergedCpIds.includes(cpId)) {
      mergedCpIds.push(cpId);
    }
  }

  const startedAt = (() => {
    if (current.startedAt && incoming.startedAt) {
      const cMs = Date.parse(current.startedAt);
      const iMs = Date.parse(incoming.startedAt);
      if (!Number.isNaN(cMs) && !Number.isNaN(iMs)) {
        return cMs <= iMs ? current.startedAt : incoming.startedAt;
      }
    }
    return incoming.startedAt || current.startedAt;
  })();

  const finishedAt = incoming.finishedAt || current.finishedAt;

  let durationSeconds: number | undefined;
  if (winningStatus === SessionStatus.FINISHED) {
    if (
      incRank === 3 &&
      typeof incoming.durationSeconds === 'number' &&
      incoming.durationSeconds > 0
    ) {
      durationSeconds = incoming.durationSeconds;
    } else if (
      curRank === 3 &&
      typeof current.durationSeconds === 'number' &&
      current.durationSeconds > 0
    ) {
      durationSeconds = current.durationSeconds;
    } else if (startedAt && finishedAt) {
      const diff = Math.round(
        (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000
      );
      if (!Number.isNaN(diff) && diff >= 0) {
        durationSeconds = diff;
      }
    }
  }
  if (durationSeconds === undefined) {
    const cDur =
      typeof current.durationSeconds === 'number' ? current.durationSeconds : undefined;
    const iDur =
      typeof incoming.durationSeconds === 'number' ? incoming.durationSeconds : undefined;
    if (cDur !== undefined && iDur !== undefined) {
      durationSeconds = Math.max(cDur, iDur);
    } else {
      durationSeconds = iDur ?? cDur;
    }
  }

  const curGross =
    typeof current.grossScore === 'number'
      ? current.grossScore
      : current.totalScore || 0;
  const incGross =
    typeof incoming.grossScore === 'number'
      ? incoming.grossScore
      : incoming.totalScore || 0;
  const grossScore = Math.max(curGross, incGross);

  const curTotal = typeof current.totalScore === 'number' ? current.totalScore : 0;
  const incTotal = typeof incoming.totalScore === 'number' ? incoming.totalScore : 0;
  const mergedIsDnf = Boolean(incoming.isDnf || current.isDnf);
  const totalScore =
    mergedIsDnf && incoming.isDnf && !current.isDnf
      ? incTotal
      : Math.max(curTotal, incTotal);

  const overtimeMinutes = Math.max(
    current.overtimeMinutes || 0,
    incoming.overtimeMinutes || 0
  );
  const penaltyPoints =
    mergedIsDnf && incoming.isDnf && !current.isDnf
      ? Math.max(0, incoming.penaltyPoints || 0)
      : Math.max(current.penaltyPoints || 0, incoming.penaltyPoints || 0);

  const lastLocation = (() => {
    if (current.lastLocation && incoming.lastLocation) {
      const cLocMs = Date.parse(current.lastLocation.measuredAt);
      const iLocMs = Date.parse(incoming.lastLocation.measuredAt);
      if (!Number.isNaN(cLocMs) && !Number.isNaN(iLocMs)) {
        return iLocMs >= cLocMs ? incoming.lastLocation : current.lastLocation;
      }
    }
    return incoming.lastLocation || current.lastLocation;
  })();

  return {
    ...current,
    ...incoming,
    attemptNumber: incoming.attemptNumber || current.attemptNumber || 1,
    status: winningStatus,
    isDnf: mergedIsDnf,
    dnfReason: incoming.dnfReason || current.dnfReason,
    loadedAt: current.loadedAt || incoming.loadedAt,
    startedAt,
    startedReceivedAt: incoming.startedReceivedAt || current.startedReceivedAt,
    finishedAt,
    finishedReceivedAt: incoming.finishedReceivedAt || current.finishedReceivedAt,
    validatedCheckpointIds: mergedCpIds,
    grossScore,
    overtimeMinutes,
    penaltyPoints,
    totalScore,
    durationSeconds,
    lastLocation,
    relayParentTeamName: incoming.relayParentTeamName || current.relayParentTeamName,
    relayParentTeamKey: incoming.relayParentTeamKey || current.relayParentTeamKey,
    relayLegIndex: incoming.relayLegIndex || current.relayLegIndex,
    relayMemberNames:
      incoming.relayMemberNames !== undefined
        ? incoming.relayMemberNames
        : current.relayMemberNames,
    relayOverrideUnlocked: Boolean(
      current.relayOverrideUnlocked || incoming.relayOverrideUnlocked
    ),
    relayOverrideReason: incoming.relayOverrideReason || current.relayOverrideReason,
    relayOverrideAt: incoming.relayOverrideAt || current.relayOverrideAt,
  };
}

/**
 * Menggabungkan (Smart Merge berdasarkan ID) data dari Cloud atau Browser ke dalam memori Server
 * tanpa pernah menimpa/menghapus data milik Organizer atau Peserta lain.
 */
function smartMergeIntoServerDb(
  targetDb: DatabaseSchema,
  incoming: {
    organizerAuth?: { pinHash: string; pinSalt: string; username?: string };
    organizers?: StoredOrganizer[];
    deletedOrganizerIds?: string[];
    courses?: Course[];
    deletedCourseIds?: string[];
    participants?: StoredParticipant[];
    deletedParticipantIds?: string[];
    sessions?: ParticipantSession[];
    deletedSessionIds?: string[];
    reports?: CheckpointReport[];
  },
  authScope?: OrganizerAuthContext
): boolean {
  let changed = false;

  // 1. Gabungkan daftar ID yang dihapus (Deleted Tombstones)
  const deletedCourseSet = new Set<string>([
    ...(targetDb.deletedCourseIds || []),
    ...(incoming.deletedCourseIds || []),
  ]);
  if (deletedCourseSet.size !== (targetDb.deletedCourseIds || []).length) {
    targetDb.deletedCourseIds = Array.from(deletedCourseSet);
    changed = true;
  }

  const deletedOrganizerSet = new Set<string>([
    ...(targetDb.deletedOrganizerIds || []),
    ...(incoming.deletedOrganizerIds || []),
  ]);
  if (deletedOrganizerSet.size !== (targetDb.deletedOrganizerIds || []).length) {
    targetDb.deletedOrganizerIds = Array.from(deletedOrganizerSet);
    changed = true;
  }

  const deletedParticipantSet = new Set<string>([
    ...(targetDb.deletedParticipantIds || []),
    ...(incoming.deletedParticipantIds || []),
  ]);
  if (deletedParticipantSet.size !== (targetDb.deletedParticipantIds || []).length) {
    targetDb.deletedParticipantIds = Array.from(deletedParticipantSet);
    changed = true;
  }

  const deletedSessionSet = new Set<string>([
    ...(targetDb.deletedSessionIds || []),
    ...(incoming.deletedSessionIds || []),
  ]);
  if (deletedSessionSet.size !== (targetDb.deletedSessionIds || []).length) {
    targetDb.deletedSessionIds = Array.from(deletedSessionSet);
    changed = true;
  }

  // Bersihkan course/organizer/participant/session/report di targetDb jika masuk daftar hapus
  const beforeCoursesLen = targetDb.courses.length;
  targetDb.courses = targetDb.courses.filter((c) => !deletedCourseSet.has(c.id));
  if (targetDb.courses.length !== beforeCoursesLen) changed = true;

  if (!Array.isArray(targetDb.organizers)) targetDb.organizers = [];
  const beforeOrgsLen = targetDb.organizers.length;
  targetDb.organizers = targetDb.organizers.filter((o) => !deletedOrganizerSet.has(o.id));
  if (targetDb.organizers.length !== beforeOrgsLen) changed = true;

  const beforeParticipantsLen = targetDb.participants.length;
  targetDb.participants = targetDb.participants.filter(
    (p) => !deletedParticipantSet.has(p.id)
  );
  if (targetDb.participants.length !== beforeParticipantsLen) changed = true;

  const beforeSessionsLen = targetDb.sessions.length;
  targetDb.sessions = targetDb.sessions.filter(
    (s) =>
      !deletedCourseSet.has(s.courseId) &&
      !deletedSessionSet.has(s.id) &&
      !deletedParticipantSet.has(s.participantId)
  );
  if (targetDb.sessions.length !== beforeSessionsLen) changed = true;

  const beforeReportsLen = targetDb.reports.length;
  targetDb.reports = targetDb.reports.filter(
    (r) =>
      !deletedCourseSet.has(r.courseId) &&
      !deletedSessionSet.has(r.sessionId) &&
      !deletedParticipantSet.has(r.participantId)
  );
  if (targetDb.reports.length !== beforeReportsLen) changed = true;

  // 2. OrganizerAuth (Superadmin PIN & Username) jika dari Cloud/Vault
  if (
    !authScope &&
    incoming.organizerAuth?.pinHash &&
    incoming.organizerAuth?.pinSalt
  ) {
    const hasPinDiff = incoming.organizerAuth.pinHash !== targetDb.organizerAuth.pinHash;
    const hasUserDiff =
      Boolean(incoming.organizerAuth.username) &&
      incoming.organizerAuth.username !== targetDb.organizerAuth.username;
    if (hasPinDiff || hasUserDiff) {
      targetDb.organizerAuth = {
        pinHash: incoming.organizerAuth.pinHash,
        pinSalt: incoming.organizerAuth.pinSalt,
        username: incoming.organizerAuth.username || targetDb.organizerAuth.username || 'superadmin',
      };
      changed = true;
    }
  }

  // 3. Smart Merge Organizers berdasarkan ID
  if (Array.isArray(incoming.organizers)) {
    for (const rawOrg of incoming.organizers) {
      if (!rawOrg || !rawOrg.id || deletedOrganizerSet.has(rawOrg.id)) continue;
      if (
        authScope &&
        !authScope.isSuperAdmin &&
        rawOrg.id !== authScope.organizerId
      ) {
        continue;
      }

      const existingIdx = targetDb.organizers.findIndex((o) => o.id === rawOrg.id);
      if (existingIdx === -1) {
        const fallbackPin = hashPin('1111');
        targetDb.organizers.push({
          id: rawOrg.id,
          code:
            rawOrg.code ||
            `ORG-${String(targetDb.organizers.length + 1).padStart(2, '0')}`,
          username: (rawOrg.username || rawOrg.code || rawOrg.id).toLowerCase(),
          name: rawOrg.name || 'Organizer',
          organization: rawOrg.organization || '',
          isSuperAdmin: false,
          isActive: rawOrg.isActive !== false,
          createdAt: rawOrg.createdAt || new Date().toISOString(),
          pinHash: rawOrg.pinHash || fallbackPin.hash,
          pinSalt: rawOrg.pinSalt || fallbackPin.salt,
        });
        changed = true;
      } else {
        const current = targetDb.organizers[existingIdx];
        if (rawOrg.name && current.name !== rawOrg.name) {
          current.name = rawOrg.name;
          changed = true;
        }
        if (rawOrg.username && current.username !== rawOrg.username) {
          current.username = rawOrg.username.toLowerCase();
          changed = true;
        }
        if (
          rawOrg.organization !== undefined &&
          current.organization !== rawOrg.organization
        ) {
          current.organization = rawOrg.organization;
          changed = true;
        }
        if (
          typeof rawOrg.isActive === 'boolean' &&
          current.isActive !== rawOrg.isActive
        ) {
          current.isActive = rawOrg.isActive;
          changed = true;
        }
        if (
          rawOrg.pinHash &&
          rawOrg.pinSalt &&
          current.pinHash !== rawOrg.pinHash
        ) {
          current.pinHash = rawOrg.pinHash;
          current.pinSalt = rawOrg.pinSalt;
          changed = true;
        }
      }
    }
  }

  // 4. Smart Merge Courses berdasarkan ID & Timestamp updatedAt (Server Authoritative bila sama/lebih baru)
  if (Array.isArray(incoming.courses)) {
    for (const bc of incoming.courses) {
      if (!bc || !bc.id || deletedCourseSet.has(bc.id)) continue;
      if (
        authScope &&
        !authScope.isSuperAdmin &&
        bc.createdByOrganizerId &&
        bc.createdByOrganizerId !== authScope.organizerId
      ) {
        continue;
      }
      const normalized = normalizeRestoredCourse({
        ...bc,
        createdByOrganizerId:
          bc.createdByOrganizerId ||
          (authScope && !authScope.isSuperAdmin ? authScope.organizerId : undefined),
        createdByOrganizerName:
          bc.createdByOrganizerName ||
          (authScope && !authScope.isSuperAdmin ? authScope.name : undefined),
      });
      const existingIdx = targetDb.courses.findIndex((c) => c.id === bc.id);
      if (existingIdx === -1) {
        targetDb.courses.push(normalized);
        changed = true;
      } else if (
        (!authScope || canAccessCourse(targetDb.courses[existingIdx], authScope)) &&
        JSON.stringify(targetDb.courses[existingIdx]) !== JSON.stringify(normalized)
      ) {
        const currentCourse = targetDb.courses[existingIdx];
        const deletedCpSet = new Set<string>([
          ...(currentCourse.deletedCheckpointIds || []),
          ...(normalized.deletedCheckpointIds || []),
        ]);

        const currentCourseMs =
          Date.parse(currentCourse.updatedAt || currentCourse.createdAt || '') || 0;
        const incomingCourseMs =
          Date.parse(normalized.updatedAt || normalized.createdAt || '') || 0;
        const incomingCourseIsStrictlyNewer = incomingCourseMs > currentCourseMs;

        const cpMap = new Map<string, Checkpoint>();
        for (const cp of currentCourse.checkpoints || []) {
          if (cp && cp.id && !deletedCpSet.has(cp.id)) {
            cpMap.set(cp.id, cp);
          }
        }
        for (const cp of normalized.checkpoints || []) {
          if (cp && cp.id && !deletedCpSet.has(cp.id)) {
            const prevCp = cpMap.get(cp.id);
            if (!prevCp) {
              cpMap.set(cp.id, cp);
            } else {
              const prevCpMs =
                Date.parse(prevCp.updatedAt || currentCourse.updatedAt || '') || 0;
              const incCpMs =
                Date.parse(cp.updatedAt || normalized.updatedAt || '') || 0;
              if (incCpMs > prevCpMs) {
                cpMap.set(cp.id, { ...prevCp, ...cp });
              } else {
                cpMap.set(cp.id, { ...cp, ...prevCp });
              }
            }
          }
        }
        const mergedCheckpoints = Array.from(cpMap.values())
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((cp, idx) => ({ ...cp, orderIndex: idx + 1 }));

        const baseCourse = incomingCourseIsStrictlyNewer
          ? { ...currentCourse, ...normalized }
          : { ...normalized, ...currentCourse };

        const mergedCourse: Course = {
          ...baseCourse,
          checkpoints: mergedCheckpoints,
          deletedCheckpointIds: Array.from(deletedCpSet),
        };
        if (JSON.stringify(currentCourse) !== JSON.stringify(mergedCourse)) {
          targetDb.courses[existingIdx] = mergedCourse;
          changed = true;
        }
      }
    }
  }

  // 5. Pulihkan otomatis akun Organizer jika ada Course yatim (Orphaned Organizer Recovery)
  if (recoverOrphanedOrganizersFromCourses(targetDb)) {
    changed = true;
  }

  // 6. Smart Merge Participants berdasarkan ID
  if (Array.isArray(incoming.participants)) {
    for (const rawPart of incoming.participants) {
      if (!rawPart || !rawPart.id || deletedParticipantSet.has(rawPart.id)) continue;
      const existingIdx = targetDb.participants.findIndex((p) => p.id === rawPart.id);
      if (existingIdx === -1) {
        const fallbackPin = hashPin('1111');
        targetDb.participants.push({
          id: rawPart.id,
          name: rawPart.name || 'Peserta',
          teamName: rawPart.teamName || 'Tim',
          gender: rawPart.gender || 'Other',
          ageGroup: rawPart.ageGroup || 'Semua Umur',
          phone: rawPart.phone || '',
          bibNumber:
            rawPart.bibNumber || computeNextBibNumber(targetDb.participants),
          registeredAt: rawPart.registeredAt || new Date().toISOString(),
          createdByOrganizerId: rawPart.createdByOrganizerId,
          pinHash: rawPart.pinHash || fallbackPin.hash,
          pinSalt: rawPart.pinSalt || fallbackPin.salt,
        });
        changed = true;
      } else {
        const current = targetDb.participants[existingIdx];
        if (!current.createdByOrganizerId && rawPart.createdByOrganizerId) {
          current.createdByOrganizerId = rawPart.createdByOrganizerId;
          changed = true;
        }
        if (rawPart.gender && current.gender !== rawPart.gender) {
          current.gender = rawPart.gender;
          changed = true;
        }
        if (rawPart.ageGroup && current.ageGroup !== rawPart.ageGroup) {
          current.ageGroup = rawPart.ageGroup;
          changed = true;
        }
        if (!current.pinHash && rawPart.pinHash && rawPart.pinSalt) {
          current.pinHash = rawPart.pinHash;
          current.pinSalt = rawPart.pinSalt;
          changed = true;
        }
      }
    }
  }

  // 7. Smart Merge Reports berdasarkan reportId terlebih dahulu agar siap dipakai rekalkulasi sesi
  if (Array.isArray(incoming.reports)) {
    for (const rawRep of incoming.reports) {
      if (
        !rawRep ||
        !rawRep.reportId ||
        deletedCourseSet.has(rawRep.courseId) ||
        deletedSessionSet.has(rawRep.sessionId) ||
        deletedParticipantSet.has(rawRep.participantId)
      ) {
        continue;
      }
      const existingRepIdx = targetDb.reports.findIndex(
        (r) => r.reportId === rawRep.reportId
      );
      if (existingRepIdx === -1) {
        targetDb.reports.push(rawRep);
        changed = true;
      } else {
        const prevRep = targetDb.reports[existingRepIdx];
        if (
          (Number(rawRep.pointsAwarded) || 0) >
          (Number(prevRep.pointsAwarded) || 0)
        ) {
          prevRep.pointsAwarded = rawRep.pointsAwarded;
          changed = true;
        }
      }
    }
  }

  // 8. Smart Merge Sessions berdasarkan ID secara Monotonik
  if (Array.isArray(incoming.sessions)) {
    for (const rawSess of incoming.sessions) {
      if (
        !rawSess ||
        !rawSess.id ||
        deletedCourseSet.has(rawSess.courseId) ||
        deletedSessionSet.has(rawSess.id) ||
        deletedParticipantSet.has(rawSess.participantId)
      ) {
        continue;
      }
      const existingIdx = targetDb.sessions.findIndex((s) => s.id === rawSess.id);
      if (existingIdx === -1) {
        targetDb.sessions.push(rawSess);
        changed = true;
      } else {
        const current = targetDb.sessions[existingIdx];
        const mergedSess = mergeSessionMonotonicallyServer(current, rawSess);
        if (JSON.stringify(current) !== JSON.stringify(mergedSess)) {
          targetDb.sessions[existingIdx] = mergedSess;
          changed = true;
        }
      }
    }
  }

  return changed;
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
        saveDbToDiskOnly(fromBackup);
        return fromBackup;
      }
    }
    const initial = createInitialDatabase();
    saveDbToDiskOnly(initial);
    return initial;
  } catch {
    return createInitialDatabase();
  }
}

let telemetryDiskTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sinkronisasi lintas worker process (Multi-Process LiteSpeed / Passenger di cPanel):
 * Membaca perubahan terbaru dari file data/baraka-db.json di disk sebelum membaca/menulis,
 * sehingga perubahan dari MacBook (Worker A) langsung terlihat di HP (Worker B) dan sebaliknya.
 */
function syncDbFromDisk(targetDb: DatabaseSchema): boolean {
  try {
    if (!fs.existsSync(DB_FILE)) return false;
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const diskDb = parseAndMigrateDbContent(raw);
    if (!diskDb) return false;
    return smartMergeIntoServerDb(targetDb, diskDb);
  } catch {
    return false;
  }
}

function saveDb(dbToSave: DatabaseSchema): void {
  recoverOrphanedOrganizersFromCourses(dbToSave);
  saveDbToDiskOnly(dbToSave);
  lastCloudHydratedAt = Date.now();
  scheduleCloudSync(dbToSave);
}

/**
 * Penyimpanan ringan khusus telemetri lokasi GPS (~5 menit):
 * Langsung ter-update di memori RAM untuk Live Monitoring Organizer,
 * di-debounce ke disk lokal (1,5 detik), dan tidak menghabiskan kuota tulis harian Cloud Firestore.
 */
function saveDbTelemetryOnly(dbToSave: DatabaseSchema): void {
  if (telemetryDiskTimer) {
    clearTimeout(telemetryDiskTimer);
  }
  telemetryDiskTimer = setTimeout(() => {
    telemetryDiskTimer = null;
    saveDbToDiskOnly(dbToSave);
  }, 1500);
}

const db: DatabaseSchema = loadDb();

async function hydrateDbFromCloud(force = false): Promise<void> {
  if (!cloudFirestore) return;
  if (!force && isCloudHydrated && Date.now() - lastCloudHydratedAt < CLOUD_HYDRATE_TTL_MS) {
    return;
  }
  if (cloudSyncTimer || isPushingToCloud) {
    // Jangan menimpa memori lokal saat sedang ada antrean penulisan baru ke Cloud
    return;
  }
  try {
    const [coreSnap, raceSnap] = await Promise.all([
      firestoreGetDoc(firestoreDoc(cloudFirestore, 'server_vaults', CORE_VAULT_KEY)),
      firestoreGetDoc(firestoreDoc(cloudFirestore, 'server_vaults', RACE_VAULT_KEY)),
    ]);

    let mergedFromCloud = false;
    let cloudHasData = false;

    if (coreSnap.exists()) {
      const rawJson = coreSnap.data()?.payloadJson;
      if (typeof rawJson === 'string' && rawJson.length > 2) {
        const parsedCore = JSON.parse(rawJson) as CoreVaultPayload;
        cloudHasData = true;
        if (smartMergeIntoServerDb(db, parsedCore)) {
          mergedFromCloud = true;
        }
      }
    }

    if (raceSnap.exists()) {
      const rawJson = raceSnap.data()?.payloadJson;
      if (typeof rawJson === 'string' && rawJson.length > 2) {
        const parsedRace = JSON.parse(rawJson) as RaceVaultPayload;
        cloudHasData = true;
        if (smartMergeIntoServerDb(db, parsedRace)) {
          mergedFromCloud = true;
        }
      }
    }

    if (mergedFromCloud) {
      db.courses.forEach((course) => {
        db.sessions
          .filter((s) => s.courseId === course.id)
          .forEach((s) => recalculateSessionScore(s, course));
      });
      saveDbToDiskOnly(db);
    }

    // Jika Cloud masih kosong pada saat pertama kali diaktifkan, langsung unggah data awal server ke Cloud
    if (!cloudHasData && !isCloudHydrated) {
      await pushDbToCloudNow(db);
    }
  } catch {
    // Jika offline sementara, lanjutkan dengan database lokal
  } finally {
    isCloudHydrated = true;
    lastCloudHydratedAt = Date.now();
  }
}

async function ensureCloudHydrated(): Promise<void> {
  const needsRefresh =
    !isCloudHydrated || Date.now() - lastCloudHydratedAt >= CLOUD_HYDRATE_TTL_MS;
  if (!needsRefresh) return;
  if (!cloudHydrationPromise) {
    cloudHydrationPromise = hydrateDbFromCloud().finally(() => {
      cloudHydrationPromise = null;
    });
  }
  await Promise.race([
    cloudHydrationPromise,
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]);
}

void ensureCloudHydrated();

function toPublicParticipant(p: StoredParticipant): ParticipantPublic {
  return {
    id: p.id,
    name: p.name,
    teamName: p.teamName,
    gender: p.gender || 'Other',
    ageGroup: p.ageGroup || 'Semua Umur',
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
    maxCourses: o.maxCourses !== undefined ? o.maxCourses : null,
    expiresAt: o.expiresAt || null,
  };
}

function getSuperAdminPublicProfile(): OrganizerPublic {
  return {
    id: 'SUPERADMIN',
    code: 'SUPERADMIN',
    username: db.organizerAuth?.username || 'superadmin',
    name: 'Superadmin Utama',
    organization: 'BARAKA Pusat',
    isSuperAdmin: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    maxCourses: null,
    expiresAt: null,
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

function normalizeRelayParentKey(name?: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function checkRelayStartLock(
  session: ParticipantSession,
  course: Course
): { locked: boolean; reason?: string; waitingOnLeg?: number } {
  if (course.raceMode !== CourseRaceMode.RELAY) {
    return { locked: false };
  }
  if (!session.relayParentTeamKey || !session.relayLegIndex) {
    return {
      locked: true,
      reason:
        'Course ini menggunakan Mode Relay (Estafet). Harap isi Nama Tim Induk dan Urutan Sub-Team Anda terlebih dahulu sebelum Scan Start QR.',
    };
  }
  if (course.relayEnforceSequential === false) {
    return { locked: false };
  }
  if (session.relayLegIndex <= 1) {
    return { locked: false };
  }
  if (session.relayOverrideUnlocked) {
    return { locked: false };
  }

  const prevLegIndex = session.relayLegIndex - 1;
  const prevLegSessions = db.sessions.filter(
    (s) =>
      s.courseId === course.id &&
      s.relayParentTeamKey === session.relayParentTeamKey &&
      s.relayLegIndex === prevLegIndex
  );

  const prevCompleted = prevLegSessions.some(
    (s) => s.status === SessionStatus.FINISHED || Boolean(s.relayOverrideUnlocked)
  );

  if (prevCompleted) {
    return { locked: false };
  }

  return {
    locked: true,
    waitingOnLeg: prevLegIndex,
    reason: `Giliran Estafet Terkunci! Sub-Team #${session.relayLegIndex} (Tim "${session.relayParentTeamName}") menunggu Sub-Team #${prevLegIndex} menyelesaikan lomba (Finish/DNF), atau hubungi Panitia untuk Override Buka Kunci.`,
  };
}

function buildRelayTeamStatus(session: ParticipantSession, course: Course) {
  if (course.raceMode !== CourseRaceMode.RELAY) return null;
  const lockCheck = checkRelayStartLock(session, course);
  const subTeamCount = Math.max(2, Number(course.relaySubTeamCount) || 3);
  const parentKey = session.relayParentTeamKey || '';
  const partMap = new Map(db.participants.map((p) => [p.id, p]));

  const legs = Array.from({ length: subTeamCount }, (_, idx) => {
    const legNum = idx + 1;
    const matching = parentKey
      ? db.sessions.filter(
          (s) =>
            s.courseId === course.id &&
            s.relayParentTeamKey === parentKey &&
            s.relayLegIndex === legNum
        )
      : [];
    // Pilih sesi terbaru untuk leg ini
    const picked =
      matching.find((s) => s.status === SessionStatus.FINISHED && !s.isDnf) ||
      matching.find((s) => s.status === SessionStatus.ACTIVE) ||
      matching[matching.length - 1];
    const part = picked ? partMap.get(picked.participantId) : undefined;
    return {
      legIndex: legNum,
      sessionId: picked?.id,
      participantTeamName: part?.teamName || part?.name || null,
      memberNames: picked?.relayMemberNames || null,
      status: picked?.status || null,
      isDnf: Boolean(picked?.isDnf),
      checkpointsCompleted: picked?.validatedCheckpointIds?.length || 0,
      totalScore: picked?.totalScore || 0,
      durationSeconds: picked?.durationSeconds,
      relayOverrideUnlocked: Boolean(picked?.relayOverrideUnlocked),
      isMe: picked?.id === session.id,
    };
  });

  return {
    isRelayLocked: lockCheck.locked,
    lockReason: lockCheck.reason || null,
    waitingOnLeg: lockCheck.waitingOnLeg || null,
    parentTeamName: session.relayParentTeamName || null,
    legIndex: session.relayLegIndex || null,
    subTeamCount,
    legs,
  };
}

/**
 * Menghitung ulang skor kotor (grossScore), menit keterlambatan (overtimeMinutes),
 * potongan penalti (penaltyPoints), dan skor bersih akhir (totalScore) pada sesi peserta.
 * Dilengkapi pelindung anti-nol (fallback ke laporan checkpoint resmi & skor sesi sebelumnya)
 * serta aturan DNF khusus Mode Relay (ZERO vs PARTIAL_WITH_PENALTY).
 */
function recalculateSessionScore(session: ParticipantSession, course: Course): void {
  const acceptedSessionCpReports = db.reports.filter(
    (r) =>
      r.sessionId === session.id &&
      r.reportType === 'CHECKPOINT' &&
      r.syncStatus === SyncStatus.ACCEPTED_SERVER
  );

  // Pastikan seluruh checkpoint dari laporan sah juga tercatat di validatedCheckpointIds
  for (const rep of acceptedSessionCpReports) {
    if (
      rep.checkpointId &&
      !session.validatedCheckpointIds.includes(rep.checkpointId)
    ) {
      session.validatedCheckpointIds.push(rep.checkpointId);
    }
  }

  // Hitung poin berdasarkan kecocokan ID pos di course
  const cpMatchedGross = course.scoringEnabled
    ? session.validatedCheckpointIds.reduce((sum, cpId) => {
        const cp = course.checkpoints.find((c) => c.id === cpId);
        return sum + (cp ? Number(cp.points) || 0 : 0);
      }, 0)
    : 0;

  // Hitung poin berdasarkan laporan checkpoint resmi (antisipasi jika ID checkpoint sempat berubah/diedit)
  const seenReportCpIds = new Set<string>();
  let reportsGross = 0;
  if (course.scoringEnabled) {
    for (const rep of acceptedSessionCpReports) {
      if (!rep.checkpointId || seenReportCpIds.has(rep.checkpointId)) continue;
      seenReportCpIds.add(rep.checkpointId);
      const cp = course.checkpoints.find((c) => c.id === rep.checkpointId);
      const pts = cp ? Number(cp.points) || 0 : Number(rep.pointsAwarded) || 0;
      reportsGross += pts;
    }
  }

  const prevGross =
    typeof session.grossScore === 'number'
      ? session.grossScore
      : typeof session.totalScore === 'number'
      ? session.totalScore
      : 0;

  const grossScore = course.scoringEnabled
    ? Math.max(cpMatchedGross, reportsGross, prevGross)
    : 0;

  // Pastikan durasi tempuh sesi yang sudah FINISHED selalu terkunci stabil
  if (
    session.status === SessionStatus.FINISHED &&
    (session.durationSeconds === undefined || session.durationSeconds <= 0) &&
    session.startedAt &&
    session.finishedAt
  ) {
    const diffSec = Math.round(
      (Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 1000
    );
    if (!Number.isNaN(diffSec) && diffSec >= 0) {
      session.durationSeconds = diffSec;
    }
  }

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

  // Aturan khusus DNF pada Mode Relay
  if (course.raceMode === CourseRaceMode.RELAY && session.isDnf) {
    if (course.relayDnfScoringMode === RelayDnfScoringMode.ZERO) {
      session.grossScore = grossScore;
      session.overtimeMinutes = overtimeMinutes;
      session.penaltyPoints = grossScore;
      session.totalScore = 0;
    } else {
      const dnfExtraPenalty = Math.max(0, Number(course.relayDnfPenaltyPoints) || 0);
      const totalPenalty = penaltyPoints + dnfExtraPenalty;
      session.grossScore = grossScore;
      session.overtimeMinutes = overtimeMinutes;
      session.penaltyPoints = totalPenalty;
      session.totalScore = Math.max(0, grossScore - totalPenalty);
    }
  } else {
    session.grossScore = grossScore;
    session.overtimeMinutes = overtimeMinutes;
    session.penaltyPoints = penaltyPoints;
    session.totalScore = Math.max(0, grossScore - penaltyPoints);
  }

  // Perbarui pointsAwarded pada laporan checkpoint yang sudah diterima di sesi ini
  db.reports.forEach((r) => {
    if (
      r.sessionId === session.id &&
      r.reportType === 'CHECKPOINT' &&
      r.syncStatus === SyncStatus.ACCEPTED_SERVER
    ) {
      const cp = course.checkpoints.find((c) => c.id === r.checkpointId);
      if (course.scoringEnabled) {
        if (cp) {
          r.pointsAwarded = Number(cp.points) || 0;
        }
      } else {
        r.pointsAwarded = 0;
      }
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

    const relayLock = checkRelayStartLock(session, course);
    if (relayLock.locked) {
      const rejectedRelay: CheckpointReport = {
        ...payload,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
        syncStatus: SyncStatus.REJECTED_SERVER,
        serverVerified: false,
        rejectionReason:
          relayLock.reason ||
          'Giliran Estafet belum terbuka. Tunggu Sub-Team sebelumnya selesai atau hubungi Panitia.',
        pointsAwarded: 0,
      };
      db.reports.push(rejectedRelay);
      saveDb(db);
      return { report: rejectedRelay, session, isDuplicate: false };
    }

    session.status = SessionStatus.ACTIVE;
    session.startedAt = safeMeasuredAt;
    session.startedReceivedAt = serverNow;

    const startLat =
      typeof payload.latitude === 'number' && !Number.isNaN(payload.latitude)
        ? payload.latitude
        : course.startLocation?.latitude;
    const startLng =
      typeof payload.longitude === 'number' && !Number.isNaN(payload.longitude)
        ? payload.longitude
        : course.startLocation?.longitude;

    if (startLat !== undefined && startLng !== undefined) {
      session.lastLocation = {
        participantId: session.participantId,
        sessionId: session.id,
        latitude: startLat,
        longitude: startLng,
        accuracyMeters: payload.accuracyMeters ?? 15,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
      };
    }

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

    const finalCpLat =
      typeof payload.latitude === 'number' && !Number.isNaN(payload.latitude)
        ? payload.latitude
        : checkpoint.latitude;
    const finalCpLng =
      typeof payload.longitude === 'number' && !Number.isNaN(payload.longitude)
        ? payload.longitude
        : checkpoint.longitude;

    session.lastLocation = {
      participantId: session.participantId,
      sessionId: session.id,
      latitude: finalCpLat,
      longitude: finalCpLng,
      accuracyMeters:
        typeof payload.accuracyMeters === 'number'
          ? payload.accuracyMeters
          : checkpoint.radiusMeters || 15,
      measuredAt: safeMeasuredAt,
      receivedAt: serverNow,
    };

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

    const finishLat =
      typeof payload.latitude === 'number' && !Number.isNaN(payload.latitude)
        ? payload.latitude
        : course.finishLocation?.latitude;
    const finishLng =
      typeof payload.longitude === 'number' && !Number.isNaN(payload.longitude)
        ? payload.longitude
        : course.finishLocation?.longitude;

    if (finishLat !== undefined && finishLng !== undefined) {
      session.lastLocation = {
        participantId: session.participantId,
        sessionId: session.id,
        latitude: finishLat,
        longitude: finishLng,
        accuracyMeters: payload.accuracyMeters ?? 15,
        measuredAt: safeMeasuredAt,
        receivedAt: serverNow,
      };
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
app.use(express.json({ limit: '5mb' }));

// Pastikan sinkronisasi multi-worker disk & Cloud Firestore berjalan di setiap request API,
// serta matikan caching proxy LiteSpeed/browser agar HP & MacBook selalu melihat data real-time yang sama.
app.use('/api', async (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  syncDbFromDisk(db);
  await ensureCloudHydrated();
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'BARAKA ADVENTURE',
    cloudHydrated: isCloudHydrated,
    serverTime: new Date().toISOString(),
  });
});

// --------------------------------------------------------------------------
// AUTENTIKASI ORGANIZER & SUPERADMIN (FLEKSIBEL: PIN SAJA ATAU USERNAME + PIN)
// Dilengkapi Self-Healing dari Cloud & Browser Vault Backup
// --------------------------------------------------------------------------
app.post('/api/organizer/login', (req, res) => {
  const { username, pin, password, vaultBackup } = req.body as {
    username?: string;
    pin?: string;
    password?: string;
    vaultBackup?: Partial<OrganizerVaultBackup>;
  };
  const rawInputPassword = String(password || pin || '').trim();
  if (!rawInputPassword) {
    res.status(400).json({ error: 'Password Organizer / Superadmin wajib diisi.' });
    return;
  }

  // Jika perangkat pengakses membawa cadangan Vault (Organizer/Course/Peserta), gabungkan secara aman terlebih dahulu
  if (vaultBackup && typeof vaultBackup === 'object') {
    if (smartMergeIntoServerDb(db, vaultBackup)) {
      saveDb(db);
    }
  }

  const trimmedPin = rawInputPassword;
  const trimmedUsername = (username || '').trim().toLowerCase();
  const orgList = db.organizers || [];
  const masterRecoveryPin = (process.env.BARAKA_MASTER_PIN || '').trim();
  const isMasterRecoveryMatch =
    masterRecoveryPin.length >= 4 && trimmedPin === masterRecoveryPin;

  // 1. Jika Username diisi secara eksplisit
  if (trimmedUsername) {
    const currentSuperUsername = (db.organizerAuth?.username || 'superadmin').toLowerCase();
    const isSuperAdminQuery =
      trimmedUsername === currentSuperUsername ||
      trimmedUsername === 'superadmin' ||
      trimmedUsername === 'admin' ||
      trimmedUsername === 'master' ||
      trimmedUsername === 'pusat';

    if (isSuperAdminQuery) {
      const validSuper =
        isMasterRecoveryMatch ||
        verifyPin(
          trimmedPin,
          db.organizerAuth.pinHash,
          db.organizerAuth.pinSalt
        );
      if (!validSuper) {
        res.status(401).json({ error: 'Password Superadmin tidak sesuai.' });
        return;
      }
      if (isMasterRecoveryMatch) {
        const updated = hashPin(masterRecoveryPin);
        db.organizerAuth = { pinHash: updated.hash, pinSalt: updated.salt };
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
        error: 'Username/ID Organizer atau Password tidak cocok.',
      });
      return;
    }

    if (matchedOrg.isActive === false) {
      res.status(403).json({
        error: 'Akun Organizer ini sedang dinonaktifkan oleh Superadmin.',
      });
      return;
    }

    if (matchedOrg.expiresAt) {
      const expTime = new Date(matchedOrg.expiresAt).getTime();
      if (!Number.isNaN(expTime) && Date.now() > expTime) {
        res.status(403).json({
          error: `Masa aktif akun Organizer ini telah berakhir pada ${new Date(matchedOrg.expiresAt).toLocaleDateString('id-ID')}. Silakan hubungi Superadmin untuk perpanjangan masa aktif.`,
        });
        return;
      }
    }

    const token = createOrganizerToken(matchedOrg.id, false);
    saveDb(db);
    res.json({
      token,
      role: 'ORGANIZER',
      organizer: toPublicOrganizer(matchedOrg),
      organizerBackup: matchedOrg,
    });
    return;
  }

  // 2. Jika HANYA mengisi Password saja (tanpa Username)
  const isSuperAdminPin =
    isMasterRecoveryMatch ||
    verifyPin(
      trimmedPin,
      db.organizerAuth.pinHash,
      db.organizerAuth.pinSalt
    );
  if (isSuperAdminPin) {
    if (isMasterRecoveryMatch) {
      const updated = hashPin(masterRecoveryPin);
      db.organizerAuth = { pinHash: updated.hash, pinSalt: updated.salt };
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

  const matchesByPassword = orgList.filter((o) =>
    verifyPin(trimmedPin, o.pinHash, o.pinSalt)
  );
  if (matchesByPassword.length > 1) {
    res.status(400).json({
      error: 'Terdapat lebih dari satu akun dengan Password ini. Harap masukkan Username Anda untuk masuk.',
    });
    return;
  }

  const matchedByPin = matchesByPassword[0];
  if (!matchedByPin) {
    res.status(401).json({
      error: 'Password Organizer tidak dikenali. Pastikan Password benar atau masukkan Username.',
    });
    return;
  }

  if (matchedByPin.isActive === false) {
    res.status(403).json({
      error: 'Akun Organizer ini sedang dinonaktifkan oleh Superadmin.',
    });
    return;
  }

  if (matchedByPin.expiresAt) {
    const expTime = new Date(matchedByPin.expiresAt).getTime();
    if (!Number.isNaN(expTime) && Date.now() > expTime) {
      res.status(403).json({
        error: `Masa aktif akun Organizer ini telah berakhir pada ${new Date(matchedByPin.expiresAt).toLocaleDateString('id-ID')}. Silakan hubungi Superadmin untuk perpanjangan masa aktif.`,
      });
      return;
    }
  }

  const token = createOrganizerToken(matchedByPin.id, false);
  saveDb(db);
  res.json({
    token,
    role: 'ORGANIZER',
    organizer: toPublicOrganizer(matchedByPin),
    organizerBackup: matchedByPin,
  });
});

const handleChangeOrganizerPasswordHandler = (req: Request, res: Response) => {
  const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
  const { currentPin, currentPassword, newPin, newPassword, newUsername } = req.body as {
    currentPin?: string;
    currentPassword?: string;
    newPin?: string;
    newPassword?: string;
    newUsername?: string;
  };
  const rawCurrent = String(currentPassword || currentPin || '').trim();
  const rawNew = String(newPassword || newPin || '').trim();
  const cleanNewUsername = newUsername ? String(newUsername).trim().toLowerCase() : '';
  const orgList = db.organizers || [];
  const masterRecoveryPin = (process.env.BARAKA_MASTER_PIN || '').trim();
  const isMasterCurrentMatch =
    masterRecoveryPin.length >= 4 && rawCurrent === masterRecoveryPin;

  if (!rawCurrent) {
    res.status(400).json({ error: 'Password saat ini wajib diisi untuk verifikasi keamanan.' });
    return;
  }

  if (auth.isSuperAdmin) {
    if (
      !isMasterCurrentMatch &&
      !verifyPin(rawCurrent, db.organizerAuth.pinHash, db.organizerAuth.pinSalt)
    ) {
      res.status(401).json({ error: 'Password Superadmin saat ini tidak sesuai.' });
      return;
    }

    if (!rawNew && !cleanNewUsername) {
      res.status(400).json({ error: 'Harap masukkan Username baru atau Password baru yang ingin diubah.' });
      return;
    }

    if (cleanNewUsername) {
      if (cleanNewUsername.length < 3) {
        res.status(400).json({ error: 'Username Superadmin baru minimal 3 karakter.' });
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanNewUsername)) {
        res.status(400).json({
          error: 'Username hanya boleh huruf, angka, titik (.), strip (-), atau underscore (_).',
        });
        return;
      }
      const collision = orgList.find((o) => o.username.toLowerCase() === cleanNewUsername);
      if (collision) {
        res.status(400).json({
          error: `Username "${cleanNewUsername}" sudah dipakai oleh Organizer "${collision.name}".`,
        });
        return;
      }
      db.organizerAuth.username = cleanNewUsername;
    }

    if (rawNew) {
      if (rawNew.length < 6) {
        res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
        return;
      }
      const updated = hashPin(rawNew);
      db.organizerAuth.pinHash = updated.hash;
      db.organizerAuth.pinSalt = updated.salt;
    }

    saveDb(db);
    res.json({
      message: 'Kredensial Superadmin (Username/Password) berhasil diperbarui dengan aman.',
      organizer: getSuperAdminPublicProfile(),
    });
    return;
  }

  const targetOrg = orgList.find((o) => o.id === auth.organizerId);
  if (!targetOrg) {
    res.status(404).json({ error: 'Akun Organizer tidak ditemukan.' });
    return;
  }
  if (!verifyPin(rawCurrent, targetOrg.pinHash, targetOrg.pinSalt)) {
    res.status(401).json({ error: 'Password Organizer saat ini tidak sesuai.' });
    return;
  }
  if (!rawNew || rawNew.length < 6) {
    res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    return;
  }

  const updated = hashPin(rawNew);
  targetOrg.pinHash = updated.hash;
  targetOrg.pinSalt = updated.salt;
  saveDb(db);
  res.json({ message: 'Password Organizer berhasil diperbarui.' });
};

app.post('/api/organizer/change-pin', requireOrganizer, handleChangeOrganizerPasswordHandler);
app.post('/api/organizer/change-password', requireOrganizer, handleChangeOrganizerPasswordHandler);

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
  const {
    name,
    username,
    organization,
    pin,
    password,
    maxCourses,
    durationMonths,
    expiresAt,
  } = req.body as {
    name?: string;
    username?: string;
    organization?: string;
    pin?: string;
    password?: string;
    maxCourses?: number | string | null;
    durationMonths?: number | string | null;
    expiresAt?: string | null;
  };

  const rawPassword = String(password || pin || '').trim();
  if (!name || !name.trim() || rawPassword.length < 6) {
    res.status(400).json({
      error: 'Nama Organizer dan Password Login (minimal 6 karakter) wajib diisi.',
    });
    return;
  }

  const cleanPin = rawPassword;
  if (!Array.isArray(db.organizers)) {
    db.organizers = [];
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

  // Hitung masa aktif akun (expiresAt)
  let computedExpiresAt: string | null = null;
  if (expiresAt && typeof expiresAt === 'string' && expiresAt.trim()) {
    computedExpiresAt = new Date(expiresAt).toISOString();
  } else if (
    durationMonths !== undefined &&
    durationMonths !== null &&
    durationMonths !== 'lifetime' &&
    durationMonths !== ''
  ) {
    const months = Number(durationMonths);
    if (!Number.isNaN(months) && months > 0) {
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      computedExpiresAt = d.toISOString();
    }
  }

  // Hitung jatah maksimal course (maxCourses)
  let parsedMaxCourses: number | null = null;
  if (
    maxCourses !== undefined &&
    maxCourses !== null &&
    maxCourses !== '' &&
    maxCourses !== 'unlimited'
  ) {
    const num = Number(maxCourses);
    if (!Number.isNaN(num) && num > 0) {
      parsedMaxCourses = Math.max(1, Math.round(num));
    }
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
    maxCourses: parsedMaxCourses,
    expiresAt: computedExpiresAt,
  };

  db.organizers.push(newOrganizer);
  saveDb(db);

  res.status(201).json({
    organizer: toPublicOrganizer(newOrganizer),
    organizerBackup: newOrganizer,
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

  const {
    name,
    username,
    organization,
    isActive,
    newPin,
    newPassword,
    maxCourses,
    durationMonths,
    expiresAt,
  } = req.body as {
    name?: string;
    username?: string;
    organization?: string;
    isActive?: boolean;
    newPin?: string;
    newPassword?: string;
    maxCourses?: number | string | null;
    durationMonths?: number | string | null;
    expiresAt?: string | null;
  };

  if (name !== undefined && name.trim()) {
    target.name = name.trim();
    // Sinkronkan juga label nama Organizer pada Course yang dibuatnya
    db.courses.forEach((c) => {
      if (c.createdByOrganizerId === target.id) {
        c.createdByOrganizerName = target.name;
      }
    });
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

  const rawNewPass = newPassword !== undefined
    ? String(newPassword).trim()
    : (newPin !== undefined ? String(newPin).trim() : '');

  if (rawNewPass !== '') {
    if (rawNewPass.length < 6) {
      res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
      return;
    }
    const updatedHash = hashPin(rawNewPass);
    target.pinHash = updatedHash.hash;
    target.pinSalt = updatedHash.salt;
  }

  if (maxCourses !== undefined) {
    if (maxCourses === null || maxCourses === '' || maxCourses === 'unlimited') {
      target.maxCourses = null;
    } else {
      const num = Number(maxCourses);
      target.maxCourses = !Number.isNaN(num) && num > 0 ? Math.max(1, Math.round(num)) : null;
    }
  }

  if (expiresAt !== undefined) {
    target.expiresAt = expiresAt && String(expiresAt).trim() ? new Date(expiresAt).toISOString() : null;
  } else if (durationMonths !== undefined) {
    if (durationMonths === 'lifetime' || durationMonths === null || durationMonths === '') {
      target.expiresAt = null;
    } else {
      const months = Number(durationMonths);
      if (!Number.isNaN(months) && months > 0) {
        const baseDate = target.expiresAt && new Date(target.expiresAt).getTime() > Date.now()
          ? new Date(target.expiresAt)
          : new Date();
        baseDate.setMonth(baseDate.getMonth() + months);
        target.expiresAt = baseDate.toISOString();
      }
    }
  }

  saveDb(db);
  res.json({
    organizer: toPublicOrganizer(target),
    organizerBackup: target,
    organizers: orgList.map(toPublicOrganizer),
  });
});

app.delete('/api/organizer/accounts/:organizerId', requireSuperAdmin, (req, res) => {
  if (!Array.isArray(db.organizers)) {
    db.organizers = [];
  }
  if (!Array.isArray(db.deletedOrganizerIds)) {
    db.deletedOrganizerIds = [];
  }
  const targetId = req.params.organizerId;
  if (!db.deletedOrganizerIds.includes(targetId)) {
    db.deletedOrganizerIds.push(targetId);
  }
  const idx = db.organizers.findIndex((o) => o.id === targetId);
  if (idx === -1) {
    saveDb(db);
    res.json({
      deletedId: targetId,
      organizers: db.organizers.map(toPublicOrganizer),
    });
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
// ENDPOINT PUBLIK LIVE LEADERBOARD (TANPA LOGIN - RINGAN UNTUK BANYAK PENONTON)
// Mendukung ribuan penonton dari berbagai course yang berjalan bersamaan
// --------------------------------------------------------------------------
app.get('/api/public/courses', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');
  const publicCourseList = (db.courses || [])
    .filter((c) => c.isActive !== false)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      locationName: c.locationName,
      date: c.date,
      durationMinutes: c.durationMinutes || 0,
      scoringEnabled: c.scoringEnabled !== false,
      validationMethod: c.validationMethod,
      checkpointsCount: (c.checkpoints || []).length,
      createdByOrganizerName: c.createdByOrganizerName || 'Panitia Baraka',
      raceMode: c.raceMode || CourseRaceMode.REGULAR,
      relaySubTeamCount: c.relaySubTeamCount || 3,
      relayEnforceSequential: c.relayEnforceSequential !== false,
      relayDnfScoringMode: c.relayDnfScoringMode || RelayDnfScoringMode.ZERO,
      relayDnfPenaltyPoints: c.relayDnfPenaltyPoints || 0,
    }));
  res.json({ courses: publicCourseList });
});

app.get('/api/public/leaderboard/:courseId', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3, stale-while-revalidate=5');
  const courseId = req.params.courseId;
  const course = (db.courses || []).find((c) => c.id === courseId);
  if (!course) {
    res.status(404).json({ error: 'Course tidak ditemukan atau telah dinonaktifkan.' });
    return;
  }

  // Ambil sesi khusus course ini
  const sessions = (db.sessions || []).filter((s) => s.courseId === course.id);
  const partMap = new Map((db.participants || []).map((p) => [p.id, p]));

  // Susun data hasil lomba publik (HANYA Nama Tim, Kategori, Skor, Waktu, Pos - Privasi Terjaga)
  const leaderboard = sessions.map((s) => {
    const part = partMap.get(s.participantId);
    return {
      sessionId: s.id,
      teamName: part?.teamName || part?.name || 'Tim Peserta',
      gender: part?.gender || 'Other',
      ageGroup: part?.ageGroup || 'Semua Umur',
      attemptNumber: s.attemptNumber || 1,
      status: s.status,
      checkpointsCompleted: (s.validatedCheckpointIds || []).length,
      totalCheckpoints: (course.checkpoints || []).length,
      grossScore: s.grossScore || 0,
      overtimeMinutes: s.overtimeMinutes || 0,
      penaltyPoints: s.penaltyPoints || 0,
      totalScore: s.totalScore || 0,
      durationSeconds: s.durationSeconds,
      isDnf: Boolean(s.isDnf),
      dnfReason: s.dnfReason,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      relayParentTeamName: s.relayParentTeamName,
      relayParentTeamKey: s.relayParentTeamKey,
      relayLegIndex: s.relayLegIndex,
      relayMemberNames: s.relayMemberNames,
      relayOverrideUnlocked: Boolean(s.relayOverrideUnlocked),
    };
  });

  // Urutkan peringkat secara otomatis
  const statusWeightPublic = (st: string, isDnf?: boolean) => {
    if (st === 'FINISHED' && !isDnf) return 4;
    if (st === 'ACTIVE') return 3;
    if (st === 'FINISHED' && isDnf) return 2;
    return 1;
  };

  leaderboard.sort((a, b) => {
    const wDiff = statusWeightPublic(b.status, b.isDnf) - statusWeightPublic(a.status, a.isDnf);
    if (wDiff !== 0) return wDiff;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const aDur = a.durationSeconds ?? Number.MAX_SAFE_INTEGER;
    const bDur = b.durationSeconds ?? Number.MAX_SAFE_INTEGER;
    return aDur - bDur;
  });

  const rankedLeaderboard = leaderboard.map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));

  // Susun Klasemen Tim Induk (Akumulasi Estafet) bila course menggunakan Mode Relay
  const isRelay = course.raceMode === CourseRaceMode.RELAY;
  const subTeamCount = Math.max(2, Number(course.relaySubTeamCount) || 3);
  let relayTeamLeaderboard: Array<Record<string, unknown>> = [];

  if (isRelay) {
    const groupedByParent = new Map<string, { parentTeamName: string; rows: typeof rankedLeaderboard }>();
    for (const row of rankedLeaderboard) {
      const pKey = row.relayParentTeamKey || normalizeRelayParentKey(row.relayParentTeamName);
      if (!pKey) continue;
      if (!groupedByParent.has(pKey)) {
        groupedByParent.set(pKey, {
          parentTeamName: row.relayParentTeamName || pKey,
          rows: [],
        });
      }
      groupedByParent.get(pKey)!.rows.push(row);
    }

    relayTeamLeaderboard = Array.from(groupedByParent.entries())
      .map(([parentTeamKey, group]) => {
        const legs = Array.from({ length: subTeamCount }, (_, idx) => {
          const legNum = idx + 1;
          const matching = group.rows.filter((r) => r.relayLegIndex === legNum);
          const picked =
            matching.find((r) => r.status === 'FINISHED' && !r.isDnf) ||
            matching.find((r) => r.status === 'ACTIVE') ||
            matching[matching.length - 1];
          return {
            legIndex: legNum,
            sessionId: picked?.sessionId || null,
            teamName: picked?.teamName || null,
            memberNames: picked?.relayMemberNames || null,
            status: picked?.status || null,
            isDnf: Boolean(picked?.isDnf),
            checkpointsCompleted: picked?.checkpointsCompleted || 0,
            totalScore: picked?.totalScore || 0,
            grossScore: picked?.grossScore || 0,
            penaltyPoints: picked?.penaltyPoints || 0,
            durationSeconds: picked?.durationSeconds ?? null,
            relayOverrideUnlocked: Boolean(picked?.relayOverrideUnlocked),
          };
        });

        const totalScore = legs.reduce((sum, l) => sum + (l.totalScore || 0), 0);
        const grossScore = legs.reduce((sum, l) => sum + (l.grossScore || 0), 0);
        const penaltyPoints = legs.reduce((sum, l) => sum + (l.penaltyPoints || 0), 0);
        const totalDurationSeconds = legs.reduce(
          (sum, l) => sum + (typeof l.durationSeconds === 'number' ? l.durationSeconds : 0),
          0
        );
        const finishedLegsCount = legs.filter((l) => l.status === 'FINISHED').length;
        const cleanFinishedLegsCount = legs.filter((l) => l.status === 'FINISHED' && !l.isDnf).length;
        const dnfLegsCount = legs.filter((l) => l.status === 'FINISHED' && l.isDnf).length;
        const activeLegsCount = legs.filter((l) => l.status === 'ACTIVE').length;
        const totalCheckpointsCompleted = legs.reduce((sum, l) => sum + (l.checkpointsCompleted || 0), 0);

        return {
          parentTeamKey,
          parentTeamName: group.parentTeamName,
          subTeamCount,
          finishedLegsCount,
          cleanFinishedLegsCount,
          dnfLegsCount,
          activeLegsCount,
          totalCheckpointsCompleted,
          grossScore,
          penaltyPoints,
          totalScore,
          totalDurationSeconds,
          legs,
        };
      })
      .sort((a, b) => {
        if ((b.totalScore as number) !== (a.totalScore as number)) {
          return (b.totalScore as number) - (a.totalScore as number);
        }
        if ((b.cleanFinishedLegsCount as number) !== (a.cleanFinishedLegsCount as number)) {
          return (b.cleanFinishedLegsCount as number) - (a.cleanFinishedLegsCount as number);
        }
        if ((b.finishedLegsCount as number) !== (a.finishedLegsCount as number)) {
          return (b.finishedLegsCount as number) - (a.finishedLegsCount as number);
        }
        return (a.totalDurationSeconds as number) - (b.totalDurationSeconds as number);
      })
      .map((teamRow, idx) => ({
        ...teamRow,
        rank: idx + 1,
      }));
  }

  res.json({
    course: {
      id: course.id,
      name: course.name,
      locationName: course.locationName,
      date: course.date,
      durationMinutes: course.durationMinutes || 0,
      checkpointsCount: (course.checkpoints || []).length,
      createdByOrganizerName: course.createdByOrganizerName || 'Panitia Baraka',
      raceMode: course.raceMode || CourseRaceMode.REGULAR,
      relaySubTeamCount: subTeamCount,
      relayEnforceSequential: course.relayEnforceSequential !== false,
      relayDnfScoringMode: course.relayDnfScoringMode || RelayDnfScoringMode.ZERO,
      relayDnfPenaltyPoints: course.relayDnfPenaltyPoints || 0,
    },
    totalParticipants: rankedLeaderboard.length,
    updatedAt: new Date().toISOString(),
    leaderboard: rankedLeaderboard,
    relayTeamLeaderboard,
  });
});

// --------------------------------------------------------------------------
// AUTENTIKASI & REGISTRASI PESERTA (NAMA TIM WAJIB DIISI & PASSWORD HASHED)
// --------------------------------------------------------------------------
app.post('/api/participant/register', (req, res) => {
  const { name, teamName, gender, ageGroup, phone, pin, password } = req.body as {
    name?: string;
    teamName?: string;
    gender?: string;
    ageGroup?: string;
    phone?: string;
    pin?: string;
    password?: string;
  };

  const rawPassword = String(password || pin || '').trim();
  if (!name || !name.trim() || !teamName || !teamName.trim() || rawPassword.length < 6) {
    res.status(400).json({
      error: 'Nama peserta, Nama Tim, dan Password (minimal 6 karakter) wajib diisi.',
    });
    return;
  }

  const { hash, salt } = hashPin(rawPassword);
  const newParticipant: StoredParticipant = {
    id: `ptc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    teamName: teamName.trim(),
    gender: (gender || '').trim() || 'Other',
    ageGroup: (ageGroup || '').trim() || 'Semua Umur',
    phone: phone?.trim() || '',
    bibNumber: computeNextBibNumber(db.participants),
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
    participantBackup: newParticipant,
  });
});

app.post('/api/participant/login', (req, res) => {
  const { teamName, bibOrName, pin, password, participantBackup, vaultParticipants } = req.body as {
    teamName?: string;
    bibOrName?: string;
    pin?: string;
    password?: string;
    participantBackup?: ParticipantBackupRecord | null;
    vaultParticipants?: ParticipantBackupRecord[];
  };
  const rawIdentity = (teamName || bibOrName || '').trim();
  const rawPassword = String(password || pin || '').trim();
  if (!rawIdentity || !rawPassword) {
    res.status(400).json({ error: 'Nama Tim dan Password wajib diisi.' });
    return;
  }

  // Self-Healing data peserta dari cadangan perangkat jika server baru cold-start
  const incomingBackups: ParticipantBackupRecord[] = [];
  if (participantBackup && participantBackup.id) {
    incomingBackups.push(participantBackup);
  }
  if (Array.isArray(vaultParticipants)) {
    incomingBackups.push(...vaultParticipants);
  }
  if (incomingBackups.length > 0) {
    if (smartMergeIntoServerDb(db, { participants: incomingBackups })) {
      saveDb(db);
    }
  }

  const query = rawIdentity.toLowerCase();
  // Prioritaskan kecocokan Nama Tim + Password, lalu fallback ke Nama Pendaftar + Password
  const foundByTeam = db.participants.find(
    (p) =>
      p.teamName.trim().toLowerCase() === query &&
      verifyPin(rawPassword, p.pinHash, p.pinSalt)
  );
  const found =
    foundByTeam ||
    db.participants.find(
      (p) =>
        p.name.trim().toLowerCase() === query &&
        verifyPin(rawPassword, p.pinHash, p.pinSalt)
    );

  if (!found) {
    res.status(401).json({
      error: 'Nama Tim atau Password tidak cocok. Pastikan Nama Tim dan Password sesuai saat pendaftaran.',
    });
    return;
  }

  const token = createParticipantToken(found.id);
  db.participantTokens[token] = found.id;
  saveDb(db);

  const activeSessions = db.sessions.filter((s) => s.participantId === found.id);
  // Prioritaskan sesi yang sedang berjalan (ACTIVE / NOT_STARTED) jika ada.
  // Jika semua sesi sebelumnya sudah FINISHED (termasuk DNF), kembalikan null agar peserta langsung masuk ke Langkah 2: Scan Setup QR baru dari 00:00:00
  const unfinishedSession = [...activeSessions]
    .reverse()
    .find((s) => s.status !== SessionStatus.FINISHED);
  const latestSession = unfinishedSession || null;
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
    participantBackup: found,
    sessions: activeSessions,
    latestSession,
    activeCourse: sanitizedCourse,
    relayStatus:
      matchedCourse && latestSession
        ? buildRelayTeamStatus(latestSession, matchedCourse)
        : null,
  });
});

// Ganti Password Mandiri oleh Tim Peserta yang Sedang Login
app.post('/api/participant/change-password', requireParticipant, (req, res) => {
  const participantId = (req as Request & { participantId: string }).participantId;
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  const rawCurrent = String(currentPassword || '').trim();
  const rawNew = String(newPassword || '').trim();
  if (!rawCurrent) {
    res.status(400).json({ error: 'Password saat ini wajib diisi.' });
    return;
  }
  if (!rawNew || rawNew.length < 6) {
    res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    return;
  }
  const participant = db.participants.find((p) => p.id === participantId);
  if (!participant) {
    res.status(404).json({ error: 'Data peserta tidak ditemukan.' });
    return;
  }
  if (!verifyPin(rawCurrent, participant.pinHash, participant.pinSalt)) {
    res.status(401).json({ error: 'Password saat ini tidak sesuai.' });
    return;
  }
  const updated = hashPin(rawNew);
  participant.pinHash = updated.hash;
  participant.pinSalt = updated.salt;
  saveDb(db);
  res.json({
    message: 'Password akun Tim Peserta berhasil diperbarui.',
    participant: toPublicParticipant(participant),
    participantBackup: participant,
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

    // Pulihkan data peserta jika server baru cold-start dan peserta belum dihapus panitia
    if (
      participantSnapshot &&
      participantSnapshot.id === participantId &&
      !(db.deletedParticipantIds || []).includes(participantId) &&
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
      relayStatus: buildRelayTeamStatus(session, matchedCourse),
    });
  });

  // --------------------------------------------------------------------------
  // ALUR PESERTA: SIMPAN IDENTITAS ESTAFET / RELAY (TIM INDUK & URUTAN SUB-TEAM)
  // --------------------------------------------------------------------------
  app.post('/api/participant/relay-profile', requireParticipant, (req, res) => {
    const participantId = (req as Request & { participantId: string }).participantId;
    const {
      sessionId,
      relayParentTeamName,
      relayLegIndex,
      relayMemberNames,
    } = req.body as {
      sessionId?: string;
      relayParentTeamName?: string;
      relayLegIndex?: number;
      relayMemberNames?: string;
    };

    if (!sessionId) {
      res.status(400).json({ error: 'ID Sesi tidak valid.' });
      return;
    }

    const session = db.sessions.find(
      (s) => s.id === sessionId && s.participantId === participantId
    );
    if (!session) {
      res.status(404).json({ error: 'Sesi peserta tidak ditemukan.' });
      return;
    }

    const matchedCourse = db.courses.find((c) => c.id === session.courseId);
    if (!matchedCourse) {
      res.status(404).json({ error: 'Course tidak ditemukan.' });
      return;
    }
    if (matchedCourse.raceMode !== CourseRaceMode.RELAY) {
      res.status(400).json({ error: 'Course ini tidak menggunakan Mode Relay (Estafet).' });
      return;
    }

    if (session.status !== SessionStatus.NOT_STARTED) {
      res.status(400).json({
        error:
          'Identitas Tim Induk & Urutan Sub-Team tidak dapat diubah setelah Anda melakukan Scan Start.',
      });
      return;
    }

    const trimmedParent = String(relayParentTeamName || '').trim().replace(/\s+/g, ' ');
    const parentKey = normalizeRelayParentKey(trimmedParent);
    if (!trimmedParent || !parentKey) {
      res.status(400).json({ error: 'Nama Tim Induk wajib diisi untuk Mode Relay.' });
      return;
    }

    const maxLegs = Math.max(2, Number(matchedCourse.relaySubTeamCount) || 3);
    const parsedLeg = Math.round(Number(relayLegIndex));
    if (Number.isNaN(parsedLeg) || parsedLeg < 1 || parsedLeg > maxLegs) {
      res.status(400).json({
        error: `Urutan Sub-Team harus antara 1 sampai ${maxLegs}.`,
      });
      return;
    }

    // Pastikan slot (Course, Tim Induk, Urutan Sub-Team) tidak bentrok dengan akun peserta lain
    const conflicting = db.sessions.find(
      (s) =>
        s.id !== session.id &&
        s.courseId === matchedCourse.id &&
        s.participantId !== participantId &&
        s.relayParentTeamKey === parentKey &&
        s.relayLegIndex === parsedLeg
    );
    if (conflicting) {
      const partHolder = db.participants.find((p) => p.id === conflicting.participantId);
      res.status(409).json({
        error: `Sub-Team #${parsedLeg} untuk Tim Induk "${trimmedParent}" sudah digunakan oleh akun ${partHolder?.teamName || partHolder?.name || 'peserta lain'}. Pilih urutan Sub-Team lain atau hubungi Panitia.`,
      });
      return;
    }

    session.relayParentTeamName = trimmedParent;
    session.relayParentTeamKey = parentKey;
    session.relayLegIndex = parsedLeg;
    session.relayMemberNames = String(relayMemberNames || '').trim();

    saveDb(db);
    void pushDbToCloudNow(db);

    res.json({
      session,
      relayStatus: buildRelayTeamStatus(session, matchedCourse),
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

    // 1. Self-Healing Participant jika belum ada di memori server dan belum dihapus panitia
    if (
      participantSnapshot &&
      participantSnapshot.id === participantId &&
      !(db.deletedParticipantIds || []).includes(participantId) &&
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
          relayParentTeamName: sessionSnapshot?.relayParentTeamName,
          relayParentTeamKey: sessionSnapshot?.relayParentTeamKey,
          relayLegIndex: sessionSnapshot?.relayLegIndex,
          relayMemberNames: sessionSnapshot?.relayMemberNames,
          relayOverrideUnlocked: sessionSnapshot?.relayOverrideUnlocked,
          relayOverrideReason: sessionSnapshot?.relayOverrideReason,
          relayOverrideAt: sessionSnapshot?.relayOverrideAt,
        };
        db.sessions.push(existingSession);
      }

      // Jika peserta sudah memiliki bukti START (dari sessionSnapshot atau dari laporan START di antrean),
      // pastikan status sesi di server adalah ACTIVE sebelum memvalidasi CHECKPOINT!
      // Khusus Mode Relay: JANGAN bypass jika giliran estafet masih terkunci!
      const incomingStartReport = sortedIncoming.find(
        (r) => r.reportType === 'START'
      );
      const hasStartEvidence =
        sessionSnapshot?.status === SessionStatus.ACTIVE ||
        sessionSnapshot?.status === SessionStatus.FINISHED ||
        Boolean(sessionSnapshot?.startedAt) ||
        Boolean(incomingStartReport);

      const syncCourse = db.courses.find((c) => c.id === targetCourseId);
      const relayLockCheck = syncCourse
        ? checkRelayStartLock(existingSession, syncCourse)
        : { locked: false };

      if (
        existingSession.status === SessionStatus.NOT_STARTED &&
        hasStartEvidence &&
        !relayLockCheck.locked
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

    // Segera dorong pembaruan sesi & skor ke Cloud Firestore agar semua instance server langsung sinkron
    void pushDbToCloudNow(db);

    const latestSession =
      results[results.length - 1]?.session ||
      db.sessions.find((s) => s.participantId === participantId) ||
      null;
    const latestCourse = latestSession
      ? db.courses.find((c) => c.id === latestSession.courseId) || null
      : null;

    res.json({
      processedAt: new Date().toISOString(),
      results: results.map((r) => ({
        report: r.report,
        isDuplicate: r.isDuplicate,
      })),
      session: latestSession,
      relayStatus:
        latestSession && latestCourse
          ? buildRelayTeamStatus(latestSession, latestCourse)
          : null,
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
    saveDbTelemetryOnly(db);

    res.json({
      status: 'ok',
      lastLocation,
    });
  });

  // --------------------------------------------------------------------------
  // ALUR PESERTA: KELUAR / ABANDON SESI AKTIF (DNF - Did Not Finish)
  // Menyetop timer stopwatch dan menandai sesi selesai dengan status DNF (Gugur)
  // --------------------------------------------------------------------------
  app.post('/api/participant/abandon-session', requireParticipant, (req, res) => {
    const participantId = (req as Request & { participantId: string }).participantId;
    const { sessionId, reason } = req.body as {
      sessionId?: string;
      reason?: string;
    };

    let session = sessionId
      ? db.sessions.find(
          (s) => s.id === sessionId && s.participantId === participantId
        )
      : null;

    if (!session) {
      session = db.sessions.find(
        (s) => s.participantId === participantId && s.status === SessionStatus.ACTIVE
      );
    }

    if (!session) {
      res.status(404).json({ error: 'Sesi aktif tidak ditemukan.' });
      return;
    }

    const nowIso = new Date().toISOString();
    session.status = SessionStatus.FINISHED;
    session.isDnf = true;
    session.dnfReason =
      reason || 'Peserta menekan Keluar saat lomba berjalan (DNF)';
    session.finishedAt = session.finishedAt || nowIso;
    session.finishedReceivedAt = nowIso;

    if (session.startedAt) {
      const elapsedMs = Math.max(
        0,
        Date.parse(session.finishedAt) - Date.parse(session.startedAt)
      );
      session.durationSeconds = Math.round(elapsedMs / 1000);
    } else {
      session.durationSeconds = 0;
    }

    const abandonCourse = db.courses.find((c) => c.id === session!.courseId);
    if (abandonCourse) {
      recalculateSessionScore(session, abandonCourse);
    }

    saveDb(db);
    void pushDbToCloudNow(db);

    res.json({
      message: 'Sesi telah ditandai DNF (Tidak Menyelesaikan Course).',
      session,
      relayStatus: abandonCourse
        ? buildRelayTeamStatus(session, abandonCourse)
        : null,
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
      relayStatus: matchedCourse ? buildRelayTeamStatus(session, matchedCourse) : null,
    });
  });

  // --------------------------------------------------------------------------
  // ENDPOINT DASHBOARD ORGANIZER (ISOLASI COURSE & PESERTA PER ORGANIZER)
  // Superadmin dapat melihat seluruh Course, Peserta, dan daftar akun Organizer.
  // Organizer biasa HANYA melihat Course buatannya sendiri dan peserta yang ikut di Course buatannya.
  // --------------------------------------------------------------------------
  app.get('/api/organizer/dashboard', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    if (recoverOrphanedOrganizersFromCourses(db)) {
      saveDb(db);
    }

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

    const visibleStoredParticipants = auth.isSuperAdmin
      ? db.participants
      : db.participants.filter(
          (p) =>
            participantIdsInOrganizerCourses.has(p.id) ||
            p.createdByOrganizerId === auth.organizerId
        );

    const visibleParticipants = visibleStoredParticipants.map(toPublicParticipant);

    const visibleStoredOrganizers = auth.isSuperAdmin
      ? db.organizers || []
      : (db.organizers || []).filter((o) => o.id === auth.organizerId);

    const currentOrgDb = (db.organizers || []).find((o) => o.id === auth.organizerId);
    const currentOrganizer: OrganizerPublic = auth.isSuperAdmin
      ? getSuperAdminPublicProfile()
      : currentOrgDb
        ? toPublicOrganizer(currentOrgDb)
        : {
            id: auth.organizerId,
            code: auth.code,
            username: auth.username,
            name: auth.name,
            organization: auth.organization,
            isSuperAdmin: false,
            isActive: true,
            createdAt: new Date().toISOString(),
            maxCourses: null,
            expiresAt: null,
          };

    const vaultSnapshot: OrganizerVaultBackup = {
      organizers: visibleStoredOrganizers,
      deletedOrganizerIds: db.deletedOrganizerIds || [],
      courses: visibleCourses,
      deletedCourseIds: db.deletedCourseIds || [],
      participants: visibleStoredParticipants,
      deletedParticipantIds: db.deletedParticipantIds || [],
      sessions: visibleSessions,
      deletedSessionIds: db.deletedSessionIds || [],
      reports: visibleReports,
      updatedAt: new Date().toISOString(),
    };

    // Catat & akumulasikan riwayat penggunaan sepanjang masa (All-Time Ledger)
    if (!db.historicalCourses || typeof db.historicalCourses !== 'object') {
      db.historicalCourses = {};
    }
    if (
      !db.historicalOrganizers ||
      typeof db.historicalOrganizers !== 'object'
    ) {
      db.historicalOrganizers = {};
    }
    let historyUpdated = false;
    for (const c of db.courses || []) {
      if (c && c.id) {
        const loc = (c.locationName || '').trim();
        const prev = db.historicalCourses[c.id];
        if (!prev || prev.locationName !== loc || prev.name !== c.name) {
          db.historicalCourses[c.id] = {
            name: c.name,
            locationName: loc,
            date: c.date,
          };
          historyUpdated = true;
        }
      }
    }
    for (const o of db.organizers || []) {
      if (o && o.id) {
        const prev = db.historicalOrganizers[o.id];
        if (!prev || prev.name !== o.name || prev.organization !== o.organization) {
          db.historicalOrganizers[o.id] = {
            name: o.name,
            organization: o.organization,
          };
          historyUpdated = true;
        }
      }
    }
    if (historyUpdated) {
      saveDb(db);
    }

    const allOrganizerIdSet = new Set<string>([
      ...(db.organizers || []).map((o) => o.id),
      ...(db.deletedOrganizerIds || []),
      ...Object.keys(db.historicalOrganizers || {}),
    ]);
    const allCourseIdSet = new Set<string>([
      ...(db.courses || []).map((c) => c.id),
      ...(db.deletedCourseIds || []),
      ...Object.keys(db.historicalCourses || {}),
    ]);
    const allParticipantIdSet = new Set<string>([
      ...(db.participants || []).map((p) => p.id),
      ...(db.deletedParticipantIds || []),
    ]);
    const allSessionIdSet = new Set<string>([
      ...(db.sessions || []).map((s) => s.id),
      ...(db.deletedSessionIds || []),
    ]);

    const locMap = new Map<
      string,
      { locationName: string; coursesCount: number; lastUsedDate?: string }
    >();
    for (const entry of Object.values(db.historicalCourses || {})) {
      const cleanLoc = (entry.locationName || '').trim();
      if (!cleanLoc) continue;
      const key = cleanLoc.toLowerCase();
      const existing = locMap.get(key);
      if (!existing) {
        locMap.set(key, {
          locationName: cleanLoc,
          coursesCount: 1,
          lastUsedDate: entry.date,
        });
      } else {
        existing.coursesCount += 1;
        if (
          entry.date &&
          (!existing.lastUsedDate || entry.date > existing.lastUsedDate)
        ) {
          existing.lastUsedDate = entry.date;
        }
      }
    }

    const activeOrgMap = new Map((db.organizers || []).map((o) => [o.id, o]));
    const allTimeOrganizersList = Array.from(allOrganizerIdSet)
      .map((id) => {
        const active = activeOrgMap.get(id);
        const hist = db.historicalOrganizers?.[id];
        const name = active?.name || hist?.name;
        if (!name) return null;
        return {
          id,
          name,
          organization: active?.organization || hist?.organization,
          isActive: Boolean(active?.isActive),
        };
      })
      .filter(Boolean);

    const allTimeStats = auth.isSuperAdmin
      ? {
          totalOrganizersEver: allOrganizerIdSet.size,
          totalCoursesEver: allCourseIdSet.size,
          totalParticipantsEver: allParticipantIdSet.size,
          totalSessionsEver: allSessionIdSet.size,
          totalLocationsEver: locMap.size,
          locations: Array.from(locMap.values()).sort(
            (a, b) => b.coursesCount - a.coursesCount
          ),
          organizers: allTimeOrganizersList,
        }
      : undefined;

    res.json({
      serverTime: new Date().toISOString(),
      currentOrganizer,
      organizers: auth.isSuperAdmin
        ? (db.organizers || []).map(toPublicOrganizer)
        : undefined,
      courses: visibleCourses,
      participants: visibleParticipants,
      deletedParticipantIds: db.deletedParticipantIds || [],
      sessions: visibleSessions,
      deletedSessionIds: db.deletedSessionIds || [],
      reports: visibleReports,
      vaultSnapshot,
      allTimeStats,
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
      raceMode,
      relaySubTeamCount,
      relayEnforceSequential,
      relayDnfScoringMode,
      relayDnfPenaltyPoints,
      startLocation,
      finishLocation,
    } = req.body as Partial<Course>;

    if (!name || !name.trim() || !date) {
      res.status(400).json({ error: 'Nama Course dan Tanggal wajib diisi.' });
      return;
    }

    // Pengecekan Kuota & Masa Aktif khusus Organizer biasa (Superadmin bebas unlimited)
    if (!auth.isSuperAdmin) {
      const orgList = db.organizers || [];
      const currentOrg = orgList.find((o) => o.id === auth.organizerId);
      if (currentOrg) {
        // 1. Cek apakah akun expired
        if (currentOrg.expiresAt) {
          const expTime = new Date(currentOrg.expiresAt).getTime();
          if (!Number.isNaN(expTime) && Date.now() > expTime) {
            res.status(403).json({
              error: `Masa aktif akun Organizer Anda telah berakhir pada ${new Date(currentOrg.expiresAt).toLocaleDateString('id-ID')}. Anda tidak dapat membuat Course baru. Silakan hubungi Superadmin.`,
            });
            return;
          }
        }

        // 2. Cek apakah kuota course sudah penuh
        if (
          currentOrg.maxCourses !== undefined &&
          currentOrg.maxCourses !== null &&
          currentOrg.maxCourses > 0
        ) {
          const existingCourses = (db.courses || []).filter(
            (c) => c.createdByOrganizerId === auth.organizerId
          );
          if (existingCourses.length >= currentOrg.maxCourses) {
            res.status(400).json({
              error: `Batas kuota tercapai: Akun Anda dibatasi maksimal membuat ${currentOrg.maxCourses} Course (saat ini sudah memiliki ${existingCourses.length} Course). Silakan hubungi Superadmin untuk penambahan kuota atau kelola Course yang sudah ada.`,
            });
            return;
          }
        }
      }
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
    const parsedRaceMode =
      raceMode === CourseRaceMode.RELAY ? CourseRaceMode.RELAY : CourseRaceMode.REGULAR;
    const parsedRelaySubTeams = Math.min(
      20,
      Math.max(2, Math.round(Number(relaySubTeamCount) || 3))
    );
    const parsedRelayDnfMode =
      relayDnfScoringMode === RelayDnfScoringMode.PARTIAL_WITH_PENALTY
        ? RelayDnfScoringMode.PARTIAL_WITH_PENALTY
        : RelayDnfScoringMode.ZERO;
    const parsedRelayDnfPenalty =
      relayDnfPenaltyPoints !== undefined && !Number.isNaN(Number(relayDnfPenaltyPoints))
        ? Math.max(0, Math.round(Number(relayDnfPenaltyPoints)))
        : 0;

    const nowIso = new Date().toISOString();
    const newCourse: Course = {
      id: courseId,
      name: name.trim(),
      description: description?.trim() || '',
      locationName: locationName?.trim() || '',
      date,
      isActive: true,
      scoringEnabled: scoringEnabled !== undefined ? Boolean(scoringEnabled) : true,
      createdAt: nowIso,
      updatedAt: nowIso,
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
      raceMode: parsedRaceMode,
      relaySubTeamCount: parsedRelaySubTeams,
      relayEnforceSequential:
        relayEnforceSequential !== undefined ? Boolean(relayEnforceSequential) : true,
      relayDnfScoringMode: parsedRelayDnfMode,
      relayDnfPenaltyPoints: parsedRelayDnfPenalty,
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
      deletedCheckpointIds: [],
    };

    db.courses.push(newCourse);
    saveDb(db);
    void pushDbToCloudNow(db);
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
      raceMode,
      relaySubTeamCount,
      relayEnforceSequential,
      relayDnfScoringMode,
      relayDnfPenaltyPoints,
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
    if (raceMode !== undefined) {
      course.raceMode =
        raceMode === CourseRaceMode.RELAY ? CourseRaceMode.RELAY : CourseRaceMode.REGULAR;
    }
    if (relaySubTeamCount !== undefined) {
      course.relaySubTeamCount = Math.min(
        20,
        Math.max(2, Math.round(Number(relaySubTeamCount) || 3))
      );
    }
    if (relayEnforceSequential !== undefined) {
      course.relayEnforceSequential = Boolean(relayEnforceSequential);
    }
    if (relayDnfScoringMode !== undefined) {
      course.relayDnfScoringMode =
        relayDnfScoringMode === RelayDnfScoringMode.PARTIAL_WITH_PENALTY
          ? RelayDnfScoringMode.PARTIAL_WITH_PENALTY
          : RelayDnfScoringMode.ZERO;
    }
    if (relayDnfPenaltyPoints !== undefined) {
      course.relayDnfPenaltyPoints = Math.max(
        0,
        Math.round(Number(relayDnfPenaltyPoints) || 0)
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

    course.updatedAt = new Date().toISOString();

    // Hitung ulang skor sesi pada course ini bila aturan durasi/penalti/poin/relay berubah
    db.sessions
      .filter((s) => s.courseId === course.id)
      .forEach((s) => recalculateSessionScore(s, course));

    saveDb(db);
    void pushDbToCloudNow(db);
    res.json({ course });
  });

  // --------------------------------------------------------------------------
  // OVERRIDE MANUAL ESTAFET OLEH PANITIA (BUKA KUNCI / PAKSA FINISH / PAKSA DNF)
  // --------------------------------------------------------------------------
  app.post('/api/organizer/relay/override-session', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    const { sessionId, action, reason } = req.body as {
      sessionId?: string;
      action?: 'UNLOCK_LEG' | 'FORCE_FINISH' | 'FORCE_DNF';
      reason?: string;
    };

    if (!sessionId || !action) {
      res.status(400).json({ error: 'ID Sesi dan jenis aksi Override wajib diisi.' });
      return;
    }

    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) {
      res.status(404).json({ error: 'Sesi peserta tidak ditemukan.' });
      return;
    }

    const course = db.courses.find((c) => c.id === session.courseId);
    if (!course) {
      res.status(404).json({ error: 'Course sesi ini tidak ditemukan.' });
      return;
    }

    if (!canAccessCourse(course, auth)) {
      res.status(403).json({
        error: 'Anda tidak memiliki akses untuk melakukan Override pada Course ini.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const cleanReason =
      String(reason || '').trim() ||
      `Override Manual oleh Panitia (${auth.name})`;

    session.relayOverrideUnlocked = true;
    session.relayOverrideReason = cleanReason;
    session.relayOverrideAt = nowIso;

    if (action === 'FORCE_FINISH') {
      session.status = SessionStatus.FINISHED;
      session.isDnf = false;
      session.dnfReason = undefined;
      session.finishedAt = session.finishedAt || nowIso;
      session.finishedReceivedAt = nowIso;
      if (session.startedAt) {
        const elapsedMs = Math.max(0, Date.parse(session.finishedAt) - Date.parse(session.startedAt));
        session.durationSeconds = Math.round(elapsedMs / 1000);
      } else {
        session.startedAt = session.startedAt || nowIso;
        session.durationSeconds = 0;
      }
      recalculateSessionScore(session, course);
    } else if (action === 'FORCE_DNF') {
      session.status = SessionStatus.FINISHED;
      session.isDnf = true;
      session.dnfReason = cleanReason;
      session.finishedAt = session.finishedAt || nowIso;
      session.finishedReceivedAt = nowIso;
      if (session.startedAt) {
        const elapsedMs = Math.max(0, Date.parse(session.finishedAt) - Date.parse(session.startedAt));
        session.durationSeconds = Math.round(elapsedMs / 1000);
      } else {
        session.durationSeconds = 0;
      }
      recalculateSessionScore(session, course);
    }

    saveDb(db);
    void pushDbToCloudNow(db);

    res.json({
      message:
        action === 'UNLOCK_LEG'
          ? 'Kunci giliran Sub-Team berhasil dibuka manual (Override Panitia).'
          : action === 'FORCE_FINISH'
          ? 'Sesi Sub-Team berhasil diselesaikan (Force Finish) dan giliran berikutnya terbuka.'
          : 'Sesi Sub-Team ditandai DNF (Force DNF) dan giliran berikutnya terbuka.',
      session,
    });
  });

  // Sinkronisasi / Pulihkan Cadangan Vault (Organizers, Courses, Participants, Sessions, Reports)
  app.post('/api/organizer/courses/sync-backup', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    const body = req.body as Partial<OrganizerVaultBackup>;

    const changed = smartMergeIntoServerDb(
      db,
      {
        organizers: body.organizers,
        deletedOrganizerIds: body.deletedOrganizerIds,
        courses: body.courses,
        deletedCourseIds: body.deletedCourseIds,
        participants: body.participants,
        deletedParticipantIds: body.deletedParticipantIds,
        sessions: body.sessions,
        deletedSessionIds: body.deletedSessionIds,
        reports: body.reports,
      },
      auth
    );

    if (changed) {
      // Hitung ulang skor sesi yang dipulihkan
      db.courses.forEach((course) => {
        db.sessions
          .filter((s) => s.courseId === course.id)
          .forEach((s) => recalculateSessionScore(s, course));
      });
      saveDb(db);
      void pushDbToCloudNow(db);
    }

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
    const visibleStoredParticipants = auth.isSuperAdmin
      ? db.participants
      : db.participants.filter(
          (p) =>
            participantIdsInOrganizerCourses.has(p.id) ||
            p.createdByOrganizerId === auth.organizerId
        );

    res.json({
      courses: visibleCourses,
      organizers: auth.isSuperAdmin
        ? (db.organizers || []).map(toPublicOrganizer)
        : undefined,
      participants: visibleStoredParticipants.map(toPublicParticipant),
      sessions: visibleSessions,
      reports: visibleReports,
    });
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

      const nowIso = new Date().toISOString();
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
        updatedAt: nowIso,
      };

      course.checkpoints.push(newCp);
      course.updatedAt = nowIso;
      saveDb(db);
      void pushDbToCloudNow(db);
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

      const nowIso = new Date().toISOString();
      cp.updatedAt = nowIso;
      course.updatedAt = nowIso;

      db.sessions
        .filter((s) => s.courseId === course.id)
        .forEach((s) => recalculateSessionScore(s, course));

      saveDb(db);
      void pushDbToCloudNow(db);
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

      const deletedCpId = req.params.checkpointId;
      if (!Array.isArray(course.deletedCheckpointIds)) {
        course.deletedCheckpointIds = [];
      }
      if (!course.deletedCheckpointIds.includes(deletedCpId)) {
        course.deletedCheckpointIds.push(deletedCpId);
      }

      course.checkpoints = course.checkpoints
        .filter((cp) => cp.id !== deletedCpId)
        .map((cp, index) => ({ ...cp, orderIndex: index + 1 }));
      course.updatedAt = new Date().toISOString();

      db.sessions
        .filter((s) => s.courseId === course.id)
        .forEach((s) => recalculateSessionScore(s, course));

      saveDb(db);
      void pushDbToCloudNow(db);
      res.json({ course });
    }
  );

  // Tambah Peserta oleh Organizer (Nama Tim Wajib & Password di-hash + terikat ke Organizer pembuat)
  app.post('/api/organizer/participants', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    const { name, teamName, gender, ageGroup, phone, pin, password } = req.body as {
      name?: string;
      teamName?: string;
      gender?: string;
      ageGroup?: string;
      phone?: string;
      pin?: string;
      password?: string;
    };

    const rawPassword = String(password || pin || '').trim();
    if (!name || !name.trim() || !teamName || !teamName.trim() || rawPassword.length < 6) {
      res.status(400).json({
        error: 'Nama peserta, Nama Tim, dan Password (minimal 6 karakter) wajib diisi.',
      });
      return;
    }

    const { hash, salt } = hashPin(rawPassword);
    const newParticipant: StoredParticipant = {
      id: `ptc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      teamName: teamName.trim(),
      gender: (gender || '').trim() || 'Other',
      ageGroup: (ageGroup || '').trim() || 'Semua Umur',
      phone: phone?.trim() || '',
      bibNumber: computeNextBibNumber(db.participants),
      registeredAt: new Date().toISOString(),
      createdByOrganizerId: auth.organizerId,
      pinHash: hash,
      pinSalt: salt,
    };

    db.participants.push(newParticipant);
    saveDb(db);

    res.status(201).json({
      participant: toPublicParticipant(newParticipant),
      participantBackup: newParticipant,
    });
  });

  // Reset Password Peserta oleh Organizer / Superadmin
  app.put(
    '/api/organizer/participants/:participantId/password',
    requireOrganizer,
    (req, res) => {
      const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
      const participantId = req.params.participantId;
      const { newPassword, newPin } = req.body as {
        newPassword?: string;
        newPin?: string;
      };
      const rawNew = String(newPassword || newPin || '').trim();
      if (!rawNew || rawNew.length < 6) {
        res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
        return;
      }
      const targetParticipant = db.participants.find((p) => p.id === participantId);
      if (!targetParticipant) {
        res.status(404).json({ error: 'Data peserta tidak ditemukan.' });
        return;
      }

      if (!auth.isSuperAdmin) {
        if (
          !targetParticipant.createdByOrganizerId ||
          targetParticipant.createdByOrganizerId !== auth.organizerId
        ) {
          res.status(403).json({
            error: 'Anda hanya dapat mereset password peserta yang Anda daftarkan sendiri.',
          });
          return;
        }
      }

      const updated = hashPin(rawNew);
      targetParticipant.pinHash = updated.hash;
      targetParticipant.pinSalt = updated.salt;
      saveDb(db);

      res.json({
        message: `Password untuk peserta "${targetParticipant.name}" (${targetParticipant.teamName}) berhasil diperbarui.`,
        participant: toPublicParticipant(targetParticipant),
        participantBackup: targetParticipant,
      });
    }
  );

  // Hapus Peserta Individual (Superadmin: Semua Peserta | Organizer: Hanya Peserta Buatannya Sendiri)
  app.delete(
    '/api/organizer/participants/:participantId',
    requireOrganizer,
    (req, res) => {
      const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
      const participantId = req.params.participantId;
      const targetParticipant = db.participants.find((p) => p.id === participantId);

      if (!targetParticipant) {
        res.status(404).json({ error: 'Data peserta tidak ditemukan.' });
        return;
      }

      // Validasi RBAC: Organizer biasa HANYA boleh menghapus peserta yang ia daftarkan sendiri
      if (!auth.isSuperAdmin) {
        if (
          !targetParticipant.createdByOrganizerId ||
          targetParticipant.createdByOrganizerId !== auth.organizerId
        ) {
          res.status(403).json({
            error:
              'Akses Ditolak: Anda hanya memiliki izin untuk menghapus peserta yang Anda daftarkan sendiri.',
          });
          return;
        }
      }

      if (!Array.isArray(db.deletedParticipantIds)) {
        db.deletedParticipantIds = [];
      }
      if (!db.deletedParticipantIds.includes(participantId)) {
        db.deletedParticipantIds.push(participantId);
      }

      if (!Array.isArray(db.deletedSessionIds)) {
        db.deletedSessionIds = [];
      }
      for (const s of db.sessions) {
        if (s.participantId === participantId && !db.deletedSessionIds.includes(s.id)) {
          db.deletedSessionIds.push(s.id);
        }
      }

      db.participants = db.participants.filter((p) => p.id !== participantId);
      db.sessions = db.sessions.filter((s) => s.participantId !== participantId);
      db.reports = db.reports.filter((r) => r.participantId !== participantId);

      for (const [token, pid] of Object.entries(db.participantTokens || {})) {
        if (pid === participantId) {
          delete db.participantTokens[token];
        }
      }

      saveDb(db);
      void pushDbToCloudNow(db);

      res.json({
        deletedParticipantId: participantId,
        deletedParticipantIds: db.deletedParticipantIds,
      });
    }
  );

  // Hapus Massal Peserta (Superadmin: ALL / SELF_REGISTERED | Organizer: Hanya OWN)
  app.post(
    '/api/organizer/participants/bulk-delete',
    requireOrganizer,
    (req, res) => {
      const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
      const rawScope = (req.body as { scope?: string })?.scope || (auth.isSuperAdmin ? 'ALL' : 'OWN');

      if (!auth.isSuperAdmin && rawScope !== 'OWN') {
        res.status(403).json({
          error:
            'Akses Ditolak: Organizer hanya dapat menghapus daftar peserta yang dibuat sendiri.',
        });
        return;
      }

      const targetParticipants = db.participants.filter((p) => {
        if (auth.isSuperAdmin) {
          if (rawScope === 'SELF_REGISTERED') {
            return !p.createdByOrganizerId;
          }
          if (rawScope === 'OWN') {
            return p.createdByOrganizerId === auth.organizerId;
          }
          return true; // 'ALL'
        }
        return p.createdByOrganizerId === auth.organizerId;
      });

      const removedIds = targetParticipants.map((p) => p.id);
      const removedIdSet = new Set(removedIds);

      if (!Array.isArray(db.deletedParticipantIds)) {
        db.deletedParticipantIds = [];
      }
      for (const id of removedIds) {
        if (!db.deletedParticipantIds.includes(id)) {
          db.deletedParticipantIds.push(id);
        }
      }

      if (!Array.isArray(db.deletedSessionIds)) {
        db.deletedSessionIds = [];
      }
      for (const s of db.sessions) {
        if (
          (removedIdSet.has(s.participantId) || (auth.isSuperAdmin && rawScope === 'ALL')) &&
          !db.deletedSessionIds.includes(s.id)
        ) {
          db.deletedSessionIds.push(s.id);
        }
      }

      db.participants = db.participants.filter((p) => !removedIdSet.has(p.id));
      if (auth.isSuperAdmin && rawScope === 'ALL') {
        db.sessions = [];
        db.reports = [];
        db.participantTokens = {};
      } else {
        db.sessions = db.sessions.filter((s) => !removedIdSet.has(s.participantId));
        db.reports = db.reports.filter((r) => !removedIdSet.has(r.participantId));
        for (const [token, pid] of Object.entries(db.participantTokens || {})) {
          if (removedIdSet.has(pid)) {
            delete db.participantTokens[token];
          }
        }
      }

      saveDb(db);
      void pushDbToCloudNow(db);

      res.json({
        deletedParticipantIds: removedIds,
        deletedCount: removedIds.length,
        allDeletedParticipantIds: db.deletedParticipantIds,
      });
    }
  );

  // Hapus Sesi Hasil Lomba Peserta (Tombol Trash pada Tabel Result)
  app.delete('/api/organizer/sessions/:sessionId', requireOrganizer, (req, res) => {
    const auth = (req as Request & { organizerAuth: OrganizerAuthContext }).organizerAuth;
    const sessionId = req.params.sessionId;
    const targetSession = db.sessions.find((s) => s.id === sessionId);

    if (targetSession) {
      const course = db.courses.find((c) => c.id === targetSession.courseId);
      if (course && !canAccessCourse(course, auth)) {
        res.status(403).json({
          error: 'Anda hanya dapat menghapus hasil sesi pada Course yang Anda kelola.',
        });
        return;
      }
    }

    if (!Array.isArray(db.deletedSessionIds)) {
      db.deletedSessionIds = [];
    }
    if (!db.deletedSessionIds.includes(sessionId)) {
      db.deletedSessionIds.push(sessionId);
    }

    db.sessions = db.sessions.filter((s) => s.id !== sessionId);
    db.reports = db.reports.filter((r) => r.sessionId !== sessionId);
    saveDb(db);
    void pushDbToCloudNow(db);

    res.json({
      deletedSessionId: sessionId,
    });
  });

  // ==========================================================================
  // MANAJEMEN DATABASE PENUH (EXPORT & RESTORE 1-KLIK UNTUK HOSTING SENDIRI)
  // ==========================================================================

  // Export Full Database Snapshot (JSON) - Khusus Superadmin
  app.get('/api/organizer/database/export', requireSuperAdmin, (_req, res) => {
    const backupSnapshot = {
      exportVersion: 'BARAKA-DB-V2',
      exportedAt: new Date().toISOString(),
      courses: db.courses,
      organizers: db.organizers || [],
      participants: db.participants || [],
      sessions: db.sessions || [],
      reports: db.reports || [],
      deletedCourseIds: db.deletedCourseIds || [],
      deletedOrganizerIds: db.deletedOrganizerIds || [],
      deletedParticipantIds: db.deletedParticipantIds || [],
      deletedSessionIds: db.deletedSessionIds || [],
    };
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="baraka-full-database-${dateStr}.json"`
    );
    res.send(JSON.stringify(backupSnapshot, null, 2));
  });

  // Restore / Import Full Database Snapshot (JSON) - Khusus Superadmin
  app.post('/api/organizer/database/import', requireSuperAdmin, (req, res) => {
    const payload = req.body as Partial<DatabaseSchema>;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'File data backup tidak valid.' });
      return;
    }

    if (!Array.isArray(payload.courses)) {
      res.status(400).json({
        error: 'Format data backup tidak sesuai. Properti "courses" tidak ditemukan.',
      });
      return;
    }

    // Perbarui / Pulihkan database
    if (Array.isArray(payload.courses)) {
      db.courses = payload.courses.map(normalizeRestoredCourse);
    }
    if (Array.isArray(payload.organizers)) {
      db.organizers = payload.organizers;
    }
    if (Array.isArray(payload.participants)) {
      db.participants = payload.participants;
    }
    if (Array.isArray(payload.sessions)) {
      db.sessions = payload.sessions;
    }
    if (Array.isArray(payload.reports)) {
      db.reports = payload.reports;
    }
    if (Array.isArray(payload.deletedCourseIds)) {
      db.deletedCourseIds = payload.deletedCourseIds;
    }
    if (Array.isArray(payload.deletedOrganizerIds)) {
      db.deletedOrganizerIds = payload.deletedOrganizerIds;
    }
    if (Array.isArray(payload.deletedParticipantIds)) {
      db.deletedParticipantIds = payload.deletedParticipantIds;
    }
    if (Array.isArray(payload.deletedSessionIds)) {
      db.deletedSessionIds = payload.deletedSessionIds;
    }

    // Hitung ulang skor setiap sesi
    db.courses.forEach((course) => {
      db.sessions
        .filter((s) => s.courseId === course.id)
        .forEach((s) => recalculateSessionScore(s, course));
    });

    saveDb(db);
    saveDbToDiskOnly(db);
    void pushDbToCloudNow(db);

    res.json({
      success: true,
      message: 'Database berhasil dipulihkan secara penuh.',
      stats: {
        coursesCount: db.courses.length,
        organizersCount: (db.organizers || []).length,
        participantsCount: db.participants.length,
        sessionsCount: db.sessions.length,
        reportsCount: db.reports.length,
      },
    });
  });

  // ==========================================================================
  // BUNDEL SIAP UPLOAD CPANEL (.ZIP TANPA NPM INSTALL)
  // ==========================================================================
  const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function computeCrc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createZipArchiveBuffer(files: Array<{ zipPath: string; content: Buffer }>): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBuf = Buffer.from(file.zipPath.replace(/\\/g, '/'), 'utf-8');
      const uncompressed = file.content;
      const compressed = zlib.deflateRawSync(uncompressed);
      const crc = computeCrc32(uncompressed);

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(8, 8);
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(uncompressed.length, 22);
      localHeader.writeUInt16LE(nameBuf.length, 26);
      localHeader.writeUInt16LE(0, 28);

      localParts.push(localHeader, nameBuf, compressed);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0, 8);
      centralHeader.writeUInt16LE(8, 10);
      centralHeader.writeUInt16LE(0, 12);
      centralHeader.writeUInt16LE(0, 14);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(compressed.length, 20);
      centralHeader.writeUInt32LE(uncompressed.length, 24);
      centralHeader.writeUInt16LE(nameBuf.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);

      centralParts.push(centralHeader, nameBuf);
      offset += localHeader.length + nameBuf.length + compressed.length;
    }

    const centralDirBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralDirBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirBuf, eocd]);
  }

  function collectDirFilesForZip(
    absDir: string,
    zipPrefix: string,
    out: Array<{ zipPath: string; content: Buffer }>
  ): void {
    if (!fs.existsSync(absDir)) return;
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(absDir, entry.name);
      const relZipPath = `${zipPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        collectDirFilesForZip(fullPath, relZipPath, out);
      } else if (entry.isFile()) {
        out.push({
          zipPath: relZipPath,
          content: fs.readFileSync(fullPath),
        });
      }
    }
  }

  app.get('/api/organizer/cpanel-bundle', requireSuperAdmin, (_req, res) => {
    try {
      const bundleServerFile = path.join(ROOT_DIR, 'cpanel-server.cjs');
      const primaryDistDir = path.join(ROOT_DIR, 'dist');
      const cpanelDistDir = path.join(ROOT_DIR, 'cpanel_dist');
      const isDevRuntime =
        process.env.npm_lifecycle_event === 'dev' ||
        process.execArgv.some((arg) => arg.includes('tsx'));

      // Saat dijalankan di AI Studio (Dev mode) atau jika bundel belum ada, otomatis build terbaru
      // sehingga setiap perubahan kode/tampilan langsung ikut terkompilasi ke dalam ZIP!
      if (
        isDevRuntime ||
        !fs.existsSync(bundleServerFile) ||
        (!fs.existsSync(path.join(primaryDistDir, 'index.html')) &&
          !fs.existsSync(path.join(cpanelDistDir, 'index.html')))
      ) {
        execSync('npm run build:all', { cwd: ROOT_DIR, stdio: 'pipe' });
      }

      const activeDistDir = fs.existsSync(path.join(primaryDistDir, 'index.html'))
        ? primaryDistDir
        : cpanelDistDir;

      const filesToZip: Array<{ zipPath: string; content: Buffer }> = [];

      if (fs.existsSync(bundleServerFile)) {
        const serverBuf = fs.readFileSync(bundleServerFile);
        filesToZip.push({
          zipPath: 'cpanel-server.cjs',
          content: serverBuf,
        });
        // Sertakan juga sebagai app.js & server.js agar nama startup file apa pun di cPanel langsung jalan
        filesToZip.push({
          zipPath: 'app.js',
          content: serverBuf,
        });
        filesToZip.push({
          zipPath: 'server.js',
          content: serverBuf,
        });
      }

      // Sertakan package.json khusus mode standalone CommonJS (0 dependencies)
      const standalonePkg = {
        name: 'baraka-adventure-standalone',
        version: '1.0.0',
        private: true,
        type: 'commonjs',
        main: 'cpanel-server.cjs',
        scripts: {
          start: 'node cpanel-server.cjs',
        },
      };
      filesToZip.push({
        zipPath: 'package.json',
        content: Buffer.from(JSON.stringify(standalonePkg, null, 2), 'utf-8'),
      });

      // Masukkan ke dalam dist/ sekaligus cpanel_dist/ agar 100% pasti terbaca di cPanel
      collectDirFilesForZip(activeDistDir, 'dist', filesToZip);
      collectDirFilesForZip(activeDistDir, 'cpanel_dist', filesToZip);

      // PENTING (SAFE UPDATE BUNDLE):
      // File `data/baraka-db.json` SENGAJA TIDAK DISERTAKAN di dalam bundel ZIP ini
      // agar saat Anda meng-extract update kode/fitur di cPanel (app.baraka.id),
      // database live produksi yang sudah ada di server hosting TIDAK PERNAH tertimpa!

      const zipBuf = createZipArchiveBuffer(filesToZip);
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="baraka-cpanel-ready-${dateStr}.zip"`
      );
      res.send(zipBuf);
    } catch (err: any) {
      res.status(500).json({
        error: `Gagal menyiapkan bundel cPanel: ${err?.message || 'Unknown error'}`,
      });
    }
  });

// --------------------------------------------------------------------------
// VITE MIDDLEWARE (DEVELOPMENT) ATAU STATIC FILES (NON-VERCEL STANDALONE)
// --------------------------------------------------------------------------
// Global safety handlers agar proses server tidak mati mendadak saat terjadi gangguan jaringan Cloud
process.on('unhandledRejection', (reason) => {
  console.warn('[BARAKA SERVER] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.warn('[BARAKA SERVER] Uncaught Exception:', err);
});

async function startServer() {
  // Cegah Vite 8 mematikan proses (parentSigtermCallback) saat stdin ditutup oleh daemon pre-warming
  process.env.CI = 'true';
  process.env.DISABLE_HMR = 'true';

  const primaryDistPath = path.join(ROOT_DIR, 'dist');
  const cpanelDistPath = path.join(ROOT_DIR, 'cpanel_dist');
  const distPath = fs.existsSync(path.join(primaryDistPath, 'index.html'))
    ? primaryDistPath
    : fs.existsSync(path.join(cpanelDistPath, 'index.html'))
      ? cpanelDistPath
      : primaryDistPath;
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isDevScript =
    process.env.npm_lifecycle_event === 'dev' ||
    process.execArgv.some((arg) => arg.includes('tsx'));
  const useStaticDist =
    process.env.NODE_ENV === 'production' ||
    process.env.STANDALONE_MODE === 'true' ||
    (!isDevScript && hasBuiltDist);

  const primaryServer = http.createServer(app);
  primaryServer.on('error', (err: NodeJS.ErrnoException) => {
    console.warn(`[BARAKA SERVER] Port ${PORT} notice:`, err.message);
  });

  // Buka port HTTP seketika di awal agar pre-warming health check langsung terlayani tanpa jeda
  if (process.env.STANDALONE_MODE === 'true') {
    primaryServer.listen(PORT, () => {
      console.log(`BARAKA ADVENTURE Standalone Server berjalan di port/socket ${PORT}`);
    });
  } else if (typeof PORT === 'number') {
    primaryServer.listen(PORT, '0.0.0.0', () => {
      console.log(`BARAKA ADVENTURE Server berjalan di http://0.0.0.0:${PORT}`);
    });
  } else {
    primaryServer.listen(PORT, () => {
      console.log(`BARAKA ADVENTURE Server berjalan di socket/port ${PORT}`);
    });
  }

  // Jaga agar event loop proses dev server selalu tetap hidup selama pre-warming / container daemon
  setInterval(() => {}, 60_000);

  const registerStaticFallback = () => {
    app.all('/api/*', (req, res) => {
      res.status(404).json({
        error: `Endpoint API tidak ditemukan: ${req.method} ${req.path}`,
        timestamp: new Date().toISOString(),
      });
    });

    app.use(express.static(distPath, { maxAge: '1d' }));

    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  };

  if (!useStaticDist) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
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

      // Cegah API 404 mengembalikan HTML index.html
      app.all('/api/*', (req, res) => {
        res.status(404).json({
          error: `Endpoint API tidak ditemukan: ${req.method} ${req.path}`,
          timestamp: new Date().toISOString(),
        });
      });

      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn(
        '[BARAKA SERVER] Vite middleware tidak aktif, beralih ke static dist:',
        viteErr
      );
      registerStaticFallback();
    }
  } else {
    registerStaticFallback();
  }

  // Hanya aktifkan fallback port jika BUKAN di belakang AI Studio Preview Proxy dan bukan mode standalone
  if (
    process.env.STANDALONE_MODE !== 'true' &&
    !isAiStudioPreviewProxy &&
    !process.env.CPANEL_PORT
  ) {
    const fallbackPorts = [3000, Number(process.env.PORT)].filter(
      (p) => p && !Number.isNaN(p) && p !== PORT
    );
    for (const extraPort of new Set(fallbackPorts)) {
      const extraServer = http.createServer(app);
      extraServer.on('error', () => {
        // Port sudah digunakan oleh reverse proxy internal, abaikan dengan aman
      });
      extraServer.listen(extraPort, '0.0.0.0', () => {
        console.log(`BARAKA ADVENTURE Server juga aktif di port ${extraPort}`);
      });
    }
  }
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('[BARAKA SERVER] Gagal memulai server:', err);
  });
}

export default app;

