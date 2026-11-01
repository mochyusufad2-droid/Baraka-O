import {
  CheckpointReport,
  Course,
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

export function saveOrganizerCoursesBackup(courses: Course[]): void {
  try {
    localStorage.setItem(LS_ORGANIZER_COURSES_BACKUP_KEY, JSON.stringify(courses));
  } catch {
    // Abaikan jika penyimpanan penuh
  }
}

export function loadOrganizerCoursesBackup(): Course[] {
  try {
    const raw = localStorage.getItem(LS_ORGANIZER_COURSES_BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Course[]) : [];
  } catch {
    return [];
  }
}

export function removeCourseFromOrganizerBackup(courseId: string): void {
  try {
    const current = loadOrganizerCoursesBackup();
    const filtered = current.filter((c) => c.id !== courseId);
    saveOrganizerCoursesBackup(filtered);
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
