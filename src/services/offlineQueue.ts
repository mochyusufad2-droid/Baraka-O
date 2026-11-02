import {
  CheckpointReport,
  Course,
  OrganizerBackupRecord,
  OrganizerVaultBackup,
  ParticipantBackupRecord,
  ParticipantPublic,
  ParticipantSession,
  SyncStatus,
} from '../types';

const IDB_NAME = 'baraka_adventure_offline_db';
const IDB_VERSION = 2;
const STORE_REPORTS = 'checkpoint_reports';
const STORE_SESSION_STATE = 'participant_session_state';
const LS_FALLBACK_REPORTS_KEY = 'baraka_offline_reports_backup_v1';
const LS_PARTICIPANT_STATE_KEY = 'baraka_participant_state_v2';

export interface PersistedParticipantState {
  token: string | null;
  participant: ParticipantPublic | null;
  participantBackup?: ParticipantBackupRecord | null;
  activeCourse: Course | null;
  activeSession: ParticipantSession | null;
  simulatedOffline: boolean;
}

export function createUniqueReportId(prefix = 'rep'): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  return `${prefix}-${randomPart}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia di lingkungan ini.'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        const store = db.createObjectStore(STORE_REPORTS, { keyPath: 'reportId' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('measuredAt', 'measuredAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SESSION_STATE)) {
        db.createObjectStore(STORE_SESSION_STATE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveReportsBackupToLocalStorage(reports: CheckpointReport[]): void {
  try {
    localStorage.setItem(LS_FALLBACK_REPORTS_KEY, JSON.stringify(reports));
  } catch {
    // Abaikan jika kuota localStorage penuh
  }
}

function loadReportsBackupFromLocalStorage(): CheckpointReport[] {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_REPORTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CheckpointReport[];
  } catch {
    return [];
  }
}

export async function getLocalReportsForSession(
  sessionId?: string
): Promise<CheckpointReport[]> {
  try {
    const db = await openDatabase();
    return await new Promise<CheckpointReport[]>((resolve, reject) => {
      const tx = db.transaction(STORE_REPORTS, 'readonly');
      const store = tx.objectStore(STORE_REPORTS);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as CheckpointReport[]) || [];
        const filtered = sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
        filtered.sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
        resolve(filtered);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    const backup = loadReportsBackupFromLocalStorage();
    const filtered = sessionId ? backup.filter((r) => r.sessionId === sessionId) : backup;
    return filtered.sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  }
}

export async function saveReportsLocally(
  reportsToSave: CheckpointReport[]
): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_REPORTS, 'readwrite');
      const store = tx.objectStore(STORE_REPORTS);
      for (const report of reportsToSave) {
        store.put(report);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const allNow = await getLocalReportsForSession();
    saveReportsBackupToLocalStorage(allNow);
  } catch {
    const existing = loadReportsBackupFromLocalStorage();
    const map = new Map<string, CheckpointReport>();
    for (const item of existing) map.set(item.reportId, item);
    for (const item of reportsToSave) map.set(item.reportId, item);
    saveReportsBackupToLocalStorage(Array.from(map.values()));
  }
}

export function loadPersistedParticipantState(): PersistedParticipantState {
  try {
    const raw = localStorage.getItem(LS_PARTICIPANT_STATE_KEY);
    if (!raw) {
      return {
        token: null,
        participant: null,
        participantBackup: null,
        activeCourse: null,
        activeSession: null,
        simulatedOffline: false,
      };
    }
    return JSON.parse(raw) as PersistedParticipantState;
  } catch {
    return {
      token: null,
      participant: null,
      participantBackup: null,
      activeCourse: null,
      activeSession: null,
      simulatedOffline: false,
    };
  }
}

export async function loadPersistedParticipantStateFromIdbFallback(): Promise<PersistedParticipantState | null> {
  try {
    const db = await openDatabase();
    return await new Promise<PersistedParticipantState | null>((resolve) => {
      const tx = db.transaction(STORE_SESSION_STATE, 'readonly');
      const store = tx.objectStore(STORE_SESSION_STATE);
      const req = store.get('current');
      req.onsuccess = () => {
        if (req.result && req.result.state) {
          resolve(req.result.state as PersistedParticipantState);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export function savePersistedParticipantState(state: PersistedParticipantState): void {
  try {
    localStorage.setItem(LS_PARTICIPANT_STATE_KEY, JSON.stringify(state));
  } catch {
    // Abaikan jika penyimpanan penuh
  }
  // Simpan cadangan lapis kedua di IndexedDB agar tahan terhadap pembersihan localStorage
  openDatabase()
    .then((db) => {
      const tx = db.transaction(STORE_SESSION_STATE, 'readwrite');
      tx.objectStore(STORE_SESSION_STATE).put({
        id: 'current',
        state,
        updatedAt: new Date().toISOString(),
      });
    })
    .catch(() => {
      // Abaikan jika IndexedDB tidak tersedia
    });
}

export function clearPersistedParticipantState(): void {
  try {
    localStorage.removeItem(LS_PARTICIPANT_STATE_KEY);
  } catch {
    // Abaikan
  }
  openDatabase()
    .then((db) => {
      const tx = db.transaction(STORE_SESSION_STATE, 'readwrite');
      tx.objectStore(STORE_SESSION_STATE).delete('current');
    })
    .catch(() => {
      // Abaikan
    });
}

const LS_ORGANIZER_COURSES_BACKUP_KEY = 'baraka_organizer_courses_backup_v1';
const LS_ORGANIZER_VAULT_BACKUP_KEY = 'baraka_organizer_vault_backup_v2';

function createEmptyVaultBackup(): OrganizerVaultBackup {
  return {
    organizers: [],
    deletedOrganizerIds: [],
    courses: [],
    deletedCourseIds: [],
    participants: [],
    sessions: [],
    reports: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Membaca seluruh cadangan Vault di perangkat (Organizers, Courses, Participants, Sessions, Reports)
 * serta memigrasikan cadangan Course versi lama jika ada.
 */
export function loadOrganizerVaultBackup(): OrganizerVaultBackup {
  const legacyCourses = (() => {
    try {
      const raw = localStorage.getItem(LS_ORGANIZER_COURSES_BACKUP_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Course[]) : [];
    } catch {
      return [];
    }
  })();

  try {
    const rawVault = localStorage.getItem(LS_ORGANIZER_VAULT_BACKUP_KEY);
    if (!rawVault) {
      return {
        ...createEmptyVaultBackup(),
        courses: legacyCourses,
      };
    }
    const parsed = JSON.parse(rawVault) as Partial<OrganizerVaultBackup>;
    const deletedCourseIds = Array.isArray(parsed.deletedCourseIds)
      ? parsed.deletedCourseIds
      : [];
    const deletedCourseSet = new Set(deletedCourseIds);
    const deletedOrganizerIds = Array.isArray(parsed.deletedOrganizerIds)
      ? parsed.deletedOrganizerIds
      : [];
    const deletedOrganizerSet = new Set(deletedOrganizerIds);

    const courseMap = new Map<string, Course>();
    for (const c of legacyCourses) {
      if (c && c.id && !deletedCourseSet.has(c.id)) {
        courseMap.set(c.id, c);
      }
    }
    if (Array.isArray(parsed.courses)) {
      for (const c of parsed.courses) {
        if (c && c.id && !deletedCourseSet.has(c.id)) {
          courseMap.set(c.id, c);
        }
      }
    }

    const organizers = Array.isArray(parsed.organizers)
      ? parsed.organizers.filter((o) => o && o.id && !deletedOrganizerSet.has(o.id))
      : [];

    const participants = Array.isArray(parsed.participants)
      ? parsed.participants.filter((p) => p && p.id)
      : [];

    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.filter(
          (s) => s && s.id && !deletedCourseSet.has(s.courseId)
        )
      : [];

    const reports = Array.isArray(parsed.reports)
      ? parsed.reports.filter(
          (r) => r && r.reportId && !deletedCourseSet.has(r.courseId)
        )
      : [];

    return {
      organizers,
      deletedOrganizerIds,
      courses: Array.from(courseMap.values()),
      deletedCourseIds,
      participants,
      sessions,
      reports,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      ...createEmptyVaultBackup(),
      courses: legacyCourses,
    };
  }
}

/**
 * SMART MERGE (Gabung berdasarkan ID, BUKAN Timpa!):
 * Ketika berganti login antara Superadmin dan Organizer di perangkat yang sama,
 * data cadangan keduanya saling melengkapi dan tidak saling menghapus.
 */
export function mergeAndSaveOrganizerVaultBackup(
  incoming: Partial<OrganizerVaultBackup>
): OrganizerVaultBackup {
  const current = loadOrganizerVaultBackup();

  const deletedOrganizerSet = new Set<string>([
    ...current.deletedOrganizerIds,
    ...(incoming.deletedOrganizerIds || []),
  ]);
  const deletedCourseSet = new Set<string>([
    ...current.deletedCourseIds,
    ...(incoming.deletedCourseIds || []),
  ]);

  // 1. Merge Organizers by ID
  const orgMap = new Map<string, OrganizerBackupRecord>();
  for (const o of current.organizers) {
    if (o && o.id && !deletedOrganizerSet.has(o.id)) {
      orgMap.set(o.id, o);
    }
  }
  if (Array.isArray(incoming.organizers)) {
    for (const o of incoming.organizers) {
      if (o && o.id && !deletedOrganizerSet.has(o.id)) {
        const prev = orgMap.get(o.id);
        orgMap.set(o.id, {
          ...(prev || {}),
          ...o,
          pinHash: o.pinHash || prev?.pinHash || '',
          pinSalt: o.pinSalt || prev?.pinSalt || '',
        });
      }
    }
  }

  // 2. Merge Courses by ID
  const courseMap = new Map<string, Course>();
  for (const c of current.courses) {
    if (c && c.id && !deletedCourseSet.has(c.id)) {
      courseMap.set(c.id, c);
    }
  }
  if (Array.isArray(incoming.courses)) {
    for (const c of incoming.courses) {
      if (c && c.id && !deletedCourseSet.has(c.id)) {
        courseMap.set(c.id, c);
      }
    }
  }

  // 3. Merge Participants by ID
  const partMap = new Map<string, ParticipantBackupRecord>();
  for (const p of current.participants) {
    if (p && p.id) {
      partMap.set(p.id, p);
    }
  }
  if (Array.isArray(incoming.participants)) {
    for (const p of incoming.participants) {
      if (p && p.id) {
        const prev = partMap.get(p.id);
        partMap.set(p.id, {
          ...(prev || {}),
          ...p,
          pinHash: p.pinHash || prev?.pinHash || '',
          pinSalt: p.pinSalt || prev?.pinSalt || '',
        });
      }
    }
  }

  // 4. Merge Sessions by ID
  const sessionMap = new Map<string, ParticipantSession>();
  for (const s of current.sessions) {
    if (s && s.id && !deletedCourseSet.has(s.courseId)) {
      sessionMap.set(s.id, s);
    }
  }
  if (Array.isArray(incoming.sessions)) {
    for (const s of incoming.sessions) {
      if (s && s.id && !deletedCourseSet.has(s.courseId)) {
        sessionMap.set(s.id, s);
      }
    }
  }

  // 5. Merge Reports by reportId
  const reportMap = new Map<string, CheckpointReport>();
  for (const r of current.reports) {
    if (r && r.reportId && !deletedCourseSet.has(r.courseId)) {
      reportMap.set(r.reportId, r);
    }
  }
  if (Array.isArray(incoming.reports)) {
    for (const r of incoming.reports) {
      if (r && r.reportId && !deletedCourseSet.has(r.courseId)) {
        reportMap.set(r.reportId, r);
      }
    }
  }

  const merged: OrganizerVaultBackup = {
    organizers: Array.from(orgMap.values()),
    deletedOrganizerIds: Array.from(deletedOrganizerSet),
    courses: Array.from(courseMap.values()),
    deletedCourseIds: Array.from(deletedCourseSet),
    participants: Array.from(partMap.values()),
    sessions: Array.from(sessionMap.values()),
    reports: Array.from(reportMap.values()),
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LS_ORGANIZER_VAULT_BACKUP_KEY, JSON.stringify(merged));
    localStorage.setItem(
      LS_ORGANIZER_COURSES_BACKUP_KEY,
      JSON.stringify(merged.courses)
    );
  } catch {
    // Abaikan jika penyimpanan penuh
  }

  return merged;
}

export function saveOrganizerCoursesBackup(courses: Course[]): void {
  mergeAndSaveOrganizerVaultBackup({ courses });
}

export function loadOrganizerCoursesBackup(): Course[] {
  return loadOrganizerVaultBackup().courses;
}

export function removeCourseFromOrganizerBackup(courseId: string): void {
  const current = loadOrganizerVaultBackup();
  const nextDeleted = Array.from(
    new Set([...current.deletedCourseIds, courseId])
  );
  const filteredCourses = current.courses.filter((c) => c.id !== courseId);
  const filteredSessions = current.sessions.filter((s) => s.courseId !== courseId);
  const filteredReports = current.reports.filter((r) => r.courseId !== courseId);

  const updated: OrganizerVaultBackup = {
    ...current,
    courses: filteredCourses,
    deletedCourseIds: nextDeleted,
    sessions: filteredSessions,
    reports: filteredReports,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LS_ORGANIZER_VAULT_BACKUP_KEY, JSON.stringify(updated));
    localStorage.setItem(
      LS_ORGANIZER_COURSES_BACKUP_KEY,
      JSON.stringify(filteredCourses)
    );
  } catch {
    // Abaikan
  }
}

export function removeOrganizerFromVaultBackup(organizerId: string): void {
  const current = loadOrganizerVaultBackup();
  const nextDeleted = Array.from(
    new Set([...current.deletedOrganizerIds, organizerId])
  );
  const filteredOrganizers = current.organizers.filter(
    (o) => o.id !== organizerId
  );

  const updated: OrganizerVaultBackup = {
    ...current,
    organizers: filteredOrganizers,
    deletedOrganizerIds: nextDeleted,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LS_ORGANIZER_VAULT_BACKUP_KEY, JSON.stringify(updated));
  } catch {
    // Abaikan
  }
}

export function removeSessionFromVaultBackup(sessionId: string): void {
  const current = loadOrganizerVaultBackup();
  const filteredSessions = current.sessions.filter((s) => s.id !== sessionId);
  const filteredReports = current.reports.filter((r) => r.sessionId !== sessionId);

  const updated: OrganizerVaultBackup = {
    ...current,
    sessions: filteredSessions,
    reports: filteredReports,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LS_ORGANIZER_VAULT_BACKUP_KEY, JSON.stringify(updated));
  } catch {
    // Abaikan
  }
}


export interface SyncQueueOutcome {
  attempted: number;
  syncedCount: number;
  rejectedCount: number;
  remainingQueueCount: number;
  updatedSession: ParticipantSession | null;
  allSessionReports: CheckpointReport[];
  errorMessage?: string;
}

export async function syncPendingReportsWithServer(params: {
  sessionId: string;
  token: string;
  isOfflineSimulated?: boolean;
  forceSyncAllAccepted?: boolean;
  sessionOverride?: ParticipantSession | null;
  onStatusUpdate?: (reports: CheckpointReport[]) => void;
}): Promise<SyncQueueOutcome> {
  const {
    sessionId,
    token,
    isOfflineSimulated,
    forceSyncAllAccepted,
    sessionOverride,
    onStatusUpdate,
  } = params;
  const allReports = await getLocalReportsForSession(sessionId);

  const unsynced = allReports.filter(
    (r) =>
      r.syncStatus === SyncStatus.SAVED_LOCAL ||
      r.syncStatus === SyncStatus.PENDING_SYNC ||
      r.syncStatus === SyncStatus.SENDING ||
      (forceSyncAllAccepted && r.syncStatus === SyncStatus.ACCEPTED_SERVER)
  );

  if (unsynced.length === 0) {
    return {
      attempted: 0,
      syncedCount: 0,
      rejectedCount: 0,
      remainingQueueCount: 0,
      updatedSession: null,
      allSessionReports: allReports,
    };
  }

  const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (browserOffline || isOfflineSimulated) {
    const markedPending = unsynced.map((r) => ({
      ...r,
      syncStatus: SyncStatus.PENDING_SYNC,
    }));
    await saveReportsLocally(markedPending);
    const updatedList = await getLocalReportsForSession(sessionId);
    onStatusUpdate?.(updatedList);
    return {
      attempted: unsynced.length,
      syncedCount: 0,
      rejectedCount: 0,
      remainingQueueCount: unsynced.length,
      updatedSession: null,
      allSessionReports: updatedList,
      errorMessage: isOfflineSimulated
        ? 'Mode Simulasi Offline aktif. Laporan disimpan aman di antrean perangkat.'
        : 'Tidak ada koneksi internet. Laporan disimpan aman di antrean perangkat.',
    };
  }

  const markedSending = unsynced.map((r) => ({
    ...r,
    syncStatus: SyncStatus.SENDING,
  }));
  await saveReportsLocally(markedSending);
  if (onStatusUpdate) {
    onStatusUpdate(await getLocalReportsForSession(sessionId));
  }

  // Sertakan juga bukti laporan START lokal yang valid agar jika server sempat cold-start,
  // server otomatis memulihkan status ACTIVE sebelum memvalidasi Pos Checkpoint!
  const localValidStartReport = allReports.find(
    (r) =>
      r.reportType === 'START' && r.syncStatus !== SyncStatus.REJECTED_SERVER
  );
  const payloadReports = [...markedSending];
  if (
    localValidStartReport &&
    !payloadReports.some((r) => r.reportId === localValidStartReport.reportId)
  ) {
    payloadReports.unshift(localValidStartReport);
  }

  const persisted = loadPersistedParticipantState();
  const effectiveSessionSnapshot =
    sessionOverride || persisted.activeSession || null;

  try {
    const response = await fetch('/api/participant/reports/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reports: payloadReports,
        sessionSnapshot: effectiveSessionSnapshot,
        courseSnapshot: persisted.activeCourse,
        participantSnapshot: persisted.participant,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Gagal menghubungi server (HTTP ${response.status})`);
    }

    const data = (await response.json()) as {
      processedAt: string;
      results: Array<{ report: CheckpointReport; isDuplicate: boolean }>;
      session: ParticipantSession | null;
    };

    const verifiedReports = data.results.map((item) => item.report);
    await saveReportsLocally(verifiedReports);

    const finalReports = await getLocalReportsForSession(sessionId);
    onStatusUpdate?.(finalReports);

    const unsyncedIds = new Set(unsynced.map((u) => u.reportId));
    const newlyVerified = verifiedReports.filter((r) => unsyncedIds.has(r.reportId));

    const syncedCount = newlyVerified.filter(
      (r) => r.syncStatus === SyncStatus.ACCEPTED_SERVER
    ).length;
    const rejectedCount = newlyVerified.filter(
      (r) => r.syncStatus === SyncStatus.REJECTED_SERVER
    ).length;
    const remainingQueueCount = finalReports.filter(
      (r) =>
        r.syncStatus === SyncStatus.SAVED_LOCAL ||
        r.syncStatus === SyncStatus.PENDING_SYNC
    ).length;

    return {
      attempted: unsynced.length,
      syncedCount,
      rejectedCount,
      remainingQueueCount,
      updatedSession: data.session,
      allSessionReports: finalReports,
    };
  } catch (err) {
    const revertedToPending = unsynced.map((r) => ({
      ...r,
      syncStatus: SyncStatus.PENDING_SYNC,
    }));
    await saveReportsLocally(revertedToPending);
    const updatedList = await getLocalReportsForSession(sessionId);
    onStatusUpdate?.(updatedList);

    return {
      attempted: unsynced.length,
      syncedCount: 0,
      rejectedCount: 0,
      remainingQueueCount: unsynced.length,
      updatedSession: null,
      allSessionReports: updatedList,
      errorMessage:
        err instanceof Error
          ? err.message
          : 'Pengiriman tertunda karena gangguan jaringan. Akan dicoba ulang otomatis.',
    };
  }
}
