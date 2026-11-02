import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Download,
  Flag,
  LogOut,
  MapPin,
  Play,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Volume2,
  Wifi,
  WifiOff,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Checkpoint,
  CheckpointReport,
  Course,
  ORIENTEERING_AGE_GROUPS,
  ORIENTEERING_GENDER_OPTIONS,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus,
  SyncStatus,
  ValidationMethod,
} from '../../types';
import {
  clearPersistedParticipantState,
  createUniqueReportId,
  getLocalReportsForSession,
  loadOrganizerCoursesBackup,
  loadOrganizerVaultBackup,
  loadPersistedParticipantState,
  loadPersistedParticipantStateFromIdbFallback,
  mergeAndSaveOrganizerVaultBackup,
  savePersistedParticipantState,
  saveReportsLocally,
  syncPendingReportsWithServer,
} from '../../services/offlineQueue';
import {
  checkGeolocationPermission,
  GPS_INTERVAL_MS,
  loadPendingLastLocationOnly,
  PendingLocationPayload,
  sendLastLocationToServer,
} from '../../services/gpsTracker';
import { PWAInstallBanner } from '../pwa/PWAInstallBanner';
import { syncSessionToFirestore } from '../../firebase';

function formatStopwatchSeconds(totalSeconds?: number): string {
  if (totalSeconds === undefined || totalSeconds === null || totalSeconds < 0) {
    return '00:00:00';
  }
  const sec = Math.floor(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
  ].join(':');
}

/**
 * Umpan balik suara (Beep) & getar instan menggunakan Web Audio API (100% bekerja offline)
 * agar peserta yang sedang berlari langsung tahu hasil scan tanpa harus membaca teks kecil.
 */
function triggerRunnerFeedback(type: 'success' | 'error') {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'success') {
        navigator.vibrate([120, 40, 120]);
      } else {
        navigator.vibrate([250, 80, 250]);
      }
    }
  } catch {
    // Abaikan jika perangkat tidak mendukung getar
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // Nada tinggi tegas (C6)
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, ctx.currentTime); // Nada rendah peringatan
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    }
  } catch {
    // Abaikan jika Web Audio diblokir browser
  }
}

// Data kode QR contoh untuk mempermudah pengujian simulasi di laptop
const DEMO_QR_CODES = {
  SETUP_DEFAULT: 'BARAKA:SETUP:crs-sprint-01',
  START_SPRINT: 'BARAKA:START:crs-sprint-01',
  FINISH_SPRINT: 'BARAKA:FINISH:crs-sprint-01',
  CP_SPRINT: {
    CP1: 'BARAKA:CP:crs-sprint-01:CP1:7F9A',
    CP2: 'BARAKA:CP:crs-sprint-01:CP2:3C8B',
    CP3: 'BARAKA:CP:crs-sprint-01:CP3:9D1E',
    CP4: 'BARAKA:CP:crs-sprint-01:CP4:5A4F',
  } as Record<string, string>,
  START_AMAZING: 'BARAKA:START:crs-amazing-02',
  FINISH_AMAZING: 'BARAKA:FINISH:crs-amazing-02',
  CP_AMAZING: {
    AR1: 'BARAKA:CP:crs-amazing-02:AR1:11AA',
    AR2: 'BARAKA:CP:crs-amazing-02:AR2:22BB',
    AR3: 'BARAKA:CP:crs-amazing-02:AR3:33CC',
  } as Record<string, string>,
};

function SyncBadge({ status }: { status: SyncStatus }) {
  switch (status) {
    case SyncStatus.SAVED_LOCAL:
      return (
        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-sky-300 border border-sky-500/30">
          <Clock className="h-3 w-3" /> Tersimpan Lokal
        </span>
      );
    case SyncStatus.PENDING_SYNC:
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-950/80 px-2 py-0.5 text-xs font-medium text-amber-300 border border-amber-500/40">
          <WifiOff className="h-3 w-3" /> Menunggu Sinyal
        </span>
      );
    case SyncStatus.SENDING:
      return (
        <span className="inline-flex items-center gap-1 rounded bg-indigo-950/80 px-2 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-500/40">
          <RefreshCw className="h-3 w-3 animate-spin" /> Mengirim...
        </span>
      );
    case SyncStatus.ACCEPTED_SERVER:
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-950/80 px-2 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-500/40">
          <CheckCircle2 className="h-3 w-3" /> Sah di Server
        </span>
      );
    case SyncStatus.REJECTED_SERVER:
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-950/80 px-2 py-0.5 text-xs font-medium text-rose-300 border border-rose-500/40">
          <XCircle className="h-3 w-3" /> Ditolak Server
        </span>
      );
  }
}

interface ParticipantViewProps {
  onAuthenticated?: () => void;
  onLogout?: () => void;
}

export default function ParticipantView({
  onAuthenticated,
  onLogout,
}: ParticipantViewProps = {}) {
  const initialPersisted = useMemo(() => loadPersistedParticipantState(), []);

  const [token, setToken] = useState<string | null>(initialPersisted.token);
  const [participant, setParticipant] = useState<ParticipantPublic | null>(
    initialPersisted.participant
  );
  const [activeCourse, setActiveCourse] = useState<Course | null>(
    initialPersisted.activeCourse
  );
  const [activeSession, setActiveSession] = useState<ParticipantSession | null>(
    initialPersisted.activeSession
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(
    initialPersisted.simulatedOffline
  );
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Mode form autentikasi: 'register' | 'login'
  const [authTab, setAuthTab] = useState<'register' | 'login'>('login');
  const [regName, setRegName] = useState('');
  const [regTeam, setRegTeam] = useState('');
  const [regGender, setRegGender] = useState<string>('Other');
  const [regAgeGroup, setRegAgeGroup] = useState<string>('Semua Umur');
  const [regPhone, setRegPhone] = useState('');
  const [regPin, setRegPin] = useState('');
  const [loginIdentity, setLoginIdentity] = useState('BRK-101');
  const [loginPin, setLoginPin] = useState('1111');

  // Input QR & Checkpoint (untuk mode manual / darurat)
  const [setupQrInput, setSetupQrInput] = useState(DEMO_QR_CODES.SETUP_DEFAULT);
  const [startQrInput, setStartQrInput] = useState('');
  const [finishQrInput, setFinishQrInput] = useState('');
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>('');
  const [checkpointQrInput, setCheckpointQrInput] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [isReadingGps, setIsReadingGps] = useState(false);

  // Panel lipat untuk mode manual / simulasi agar layar pelari bersih tanpa perlu scroll
  const [showManualTools, setShowManualTools] = useState(false);
  const [showHistoryLogs, setShowHistoryLogs] = useState(false);

  // Konfirmasi keluar Course (ditempatkan jauh dari tombol Scan)
  const [confirmingLeaveCourse, setConfirmingLeaveCourse] = useState(false);

  // Pelacakan lokasi berkala (~5 menit) berjalan di latar belakang
  const lastPeriodicAttemptMsRef = useRef<number>(0);

  // Kamera QR Scanner Full-Screen (Gaya iOrienteering)
  const [cameraActiveFor, setCameraActiveFor] = useState<
    null | 'SETUP' | 'START' | 'CHECKPOINT' | 'FINISH' | 'AUTO_RACE'
  >(null);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isProcessingScanRef = useRef<boolean>(false);

  // Overlay Konfirmasi Instan Ukuran Besar setelah Scan Berhasil/Ditolak (2,5 detik)
  const [instantScanToast, setInstantScanToast] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    subtitle: string;
  } | null>(null);

  // Daftar laporan lokal & status antrean
  const [localReports, setLocalReports] = useState<CheckpointReport[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const isEffectivelyOnline = browserOnline && !simulatedOffline;

  // Live stopwatch tick (dijeda selama kamera terbuka agar layar kamera tidak re-render/kedip)
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    if (cameraActiveFor) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cameraActiveFor]);

  // Beritahu komponen induk (App) ketika peserta sudah terautentikasi
  useEffect(() => {
    if (token && participant) {
      onAuthenticated?.();
    }
  }, [token, participant, onAuthenticated]);

  // Tampilkan toast instan selama 2,6 detik
  const showRunnerToast = useCallback(
    (
      type: 'success' | 'error' | 'warning',
      title: string,
      subtitle: string
    ) => {
      setInstantScanToast({ type, title, subtitle });
      window.setTimeout(() => {
        setInstantScanToast((prev) =>
          prev && prev.title === title ? null : prev
        );
      }, 2600);
    },
    []
  );

  // Pemulihan otomatis dari IndexedDB jika localStorage kosong
  useEffect(() => {
    if (!token && !participant) {
      loadPersistedParticipantStateFromIdbFallback().then((backup) => {
        if (backup && backup.token && backup.participant) {
          setToken(backup.token);
          setParticipant(backup.participant);
          if (backup.activeCourse) setActiveCourse(backup.activeCourse);
          if (backup.activeSession) setActiveSession(backup.activeSession);
        }
      });
    }
  }, [token, participant]);

  // Simpan state peserta ke localStorage + IndexedDB setiap kali berubah
  useEffect(() => {
    savePersistedParticipantState({
      token,
      participant,
      activeCourse,
      activeSession,
      simulatedOffline,
    });
  }, [token, participant, activeCourse, activeSession, simulatedOffline]);

  // Sinkronisasi sesi ke Cloud Firestore jika tersedia
  useEffect(() => {
    if (activeSession && participant) {
      void syncSessionToFirestore(activeSession, participant);
    }
  }, [activeSession, participant]);

  // Pilih checkpoint pertama secara default ketika course dimuat
  useEffect(() => {
    if (
      activeCourse &&
      activeCourse.checkpoints.length > 0 &&
      !selectedCheckpointId
    ) {
      setSelectedCheckpointId(activeCourse.checkpoints[0].id);
    }
  }, [activeCourse, selectedCheckpointId]);

  const refreshLocalReports = useCallback(async () => {
    if (!activeSession) {
      setLocalReports([]);
      return;
    }
    const items = await getLocalReportsForSession(activeSession.id);
    setLocalReports(items);
  }, [activeSession]);

  useEffect(() => {
    refreshLocalReports();
  }, [refreshLocalReports]);

  const hasLocalStartReport = localReports.some(
    (r) =>
      r.reportType === 'START' && r.syncStatus !== SyncStatus.REJECTED_SERVER
  );
  const hasLocalFinishReport = localReports.some(
    (r) =>
      r.reportType === 'FINISH' && r.syncStatus !== SyncStatus.REJECTED_SERVER
  );
  const sessionCanRecordCheckpoints =
    activeSession?.status === SessionStatus.ACTIVE ||
    activeSession?.status === SessionStatus.FINISHED ||
    hasLocalStartReport;
  const sessionMarkedFinishedLocallyOrServer =
    activeSession?.status === SessionStatus.FINISHED || hasLocalFinishReport;

  const isSessionActivelyRunning =
    sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer;

  // Gabungkan sesi dari server tanpa pernah menurunkan (downgrade) status ACTIVE/FINISHED lokal
  const mergeServerSessionSafely = useCallback(
    (
      prev: ParticipantSession | null,
      incoming: ParticipantSession
    ): ParticipantSession => {
      if (!prev) return incoming;
      const merged: ParticipantSession = { ...incoming };

      const locallyStarted =
        prev.status === SessionStatus.ACTIVE ||
        prev.status === SessionStatus.FINISHED ||
        Boolean(prev.startedAt) ||
        hasLocalStartReport;

      if (locallyStarted && merged.status === SessionStatus.NOT_STARTED) {
        merged.status = SessionStatus.ACTIVE;
        merged.startedAt = merged.startedAt || prev.startedAt;
      }

      const locallyFinished =
        prev.status === SessionStatus.FINISHED ||
        Boolean(prev.finishedAt) ||
        hasLocalFinishReport;

      if (locallyFinished && merged.status !== SessionStatus.FINISHED) {
        merged.status = SessionStatus.FINISHED;
        merged.finishedAt = merged.finishedAt || prev.finishedAt;
      }

      // Gabungkan validatedCheckpointIds agar pos yang sudah valid tidak hilang
      if (
        Array.isArray(prev.validatedCheckpointIds) &&
        prev.validatedCheckpointIds.length > 0
      ) {
        const setIds = new Set([
          ...(merged.validatedCheckpointIds || []),
          ...prev.validatedCheckpointIds,
        ]);
        merged.validatedCheckpointIds = Array.from(setIds);
      }

      return merged;
    },
    [hasLocalStartReport, hasLocalFinishReport]
  );

  // Sinkronisasi Real-Time Pengaturan Course & Sesi dari Server (ketika panitia mengedit Course / Checkpoint)
  const syncLatestCourseAndSession = useCallback(async () => {
    if (!activeSession || !token || !isEffectivelyOnline || cameraActiveFor) {
      return;
    }
    try {
      const courseIdParam = encodeURIComponent(
        activeCourse?.id || activeSession.courseId || ''
      );
      const res = await fetch(
        `/api/participant/session/${activeSession.id}?courseId=${courseIdParam}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.status === 404) {
        const errData = await res.json().catch(() => ({}));
        if (errData.sessionDeleted) {
          setActiveCourse(null);
          setActiveSession(null);
          setFeedbackBanner({
            type: 'warning',
            text: 'Course telah dihapus oleh panitia. Silakan scan Setup QR Course yang baru.',
          });
        }
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        session?: ParticipantSession;
        course?: Course | null;
        sessionMissingOnServer?: boolean;
      };
      if (data.course) {
        setActiveCourse((prev) => {
          if (prev && JSON.stringify(prev) === JSON.stringify(data.course)) {
            return prev;
          }
          return data.course!;
        });
      }
      if (data.sessionMissingOnServer) {
        // Pulihkan sesi & riwayat laporan ke server secara otomatis di latar belakang
        void syncPendingReportsWithServer({
          sessionId: activeSession.id,
          token,
          isOfflineSimulated: simulatedOffline,
          forceSyncAllAccepted: true,
          sessionOverride: activeSession,
          onStatusUpdate: (updated) => setLocalReports(updated),
        });
        return;
      }
      if (data.session) {
        setActiveSession((prev) => {
          const next = mergeServerSessionSafely(prev, data.session!);
          if (prev && JSON.stringify(prev) === JSON.stringify(next)) {
            return prev;
          }
          return next;
        });
      }
    } catch {
      // Abaikan kesalahan jaringan saat background polling
    }
  }, [
    activeSession,
    activeCourse?.id,
    token,
    isEffectivelyOnline,
    cameraActiveFor,
    simulatedOffline,
    mergeServerSessionSafely,
  ]);

  useEffect(() => {
    if (!activeSession || !token || !isEffectivelyOnline || cameraActiveFor) {
      return;
    }
    syncLatestCourseAndSession();
    const poll = window.setInterval(syncLatestCourseAndSession, 5000);
    return () => window.clearInterval(poll);
  }, [
    activeSession?.id,
    token,
    isEffectivelyOnline,
    cameraActiveFor,
    syncLatestCourseAndSession,
  ]);

  // Fungsi memicu sinkronisasi antrean laporan checkpoint ke server
  const triggerSyncQueue = useCallback(
    async (
      showSilentIfEmpty = true,
      sessionOverride?: ParticipantSession | null
    ) => {
      const targetSession = sessionOverride || activeSession;
      if (!targetSession || !token) return;
      setIsSyncing(true);
      const outcome = await syncPendingReportsWithServer({
        sessionId: targetSession.id,
        token,
        isOfflineSimulated: simulatedOffline,
        sessionOverride: targetSession,
        onStatusUpdate: (updated) => setLocalReports(updated),
      });
      setIsSyncing(false);

      if (outcome.updatedSession) {
        setActiveSession((prev) =>
          mergeServerSessionSafely(prev || targetSession, outcome.updatedSession!)
        );
      }

      if (outcome.attempted > 0) {
        if (outcome.errorMessage) {
          setFeedbackBanner({
            type: 'warning',
            text: outcome.errorMessage,
          });
        } else if (outcome.rejectedCount > 0) {
          setFeedbackBanner({
            type: 'error',
            text: `Sinkronisasi selesai: ${outcome.syncedCount} diterima server, ${outcome.rejectedCount} ditolak server. Periksa alasan pada riwayat laporan.`,
          });
        } else if (!showSilentIfEmpty) {
          setFeedbackBanner({
            type: 'success',
            text: `Sinkronisasi berhasil! ${outcome.syncedCount} laporan divalidasi server.`,
          });
        }
      } else if (!showSilentIfEmpty) {
        setFeedbackBanner({
          type: 'success',
          text: 'Semua laporan di perangkat sudah tersinkronisasi dengan server.',
        });
      }
    },
    [activeSession, token, simulatedOffline, mergeServerSessionSafely]
  );

  // Pemeriksa apakah suatu kode QR adalah Setup QR (untuk menangani Kondisi A & Kondisi B)
  const checkAccidentalSetupQrScan = useCallback(
    (scannedValue: string): boolean => {
      const clean = scannedValue.trim();
      if (!clean) return false;
      const isSetupQr =
        clean.startsWith('BARAKA:SETUP:') ||
        (activeCourse !== null && clean === activeCourse.setupQrCode);

      if (!isSetupQr) return false;

      triggerRunnerFeedback('error');
      if (!sessionCanRecordCheckpoints) {
        // KONDISI A: Sudah scan Setup QR (sudah masuk Course), tapi BELUM scan Start QR
        const msg = 'Anda sudah scan Setup, silakan scan Start.';
        setFeedbackBanner({ type: 'warning', text: msg });
        showRunnerToast('warning', 'SUDAH DI DALAM COURSE', msg);
      } else {
        // KONDISI B: Sudah scan Start QR / sesi sedang berjalan aktif
        const msg = 'Ditolak: Silakan scan Check Point atau Finish.';
        setFeedbackBanner({ type: 'error', text: msg });
        showRunnerToast('error', 'SETUP QR DITOLAK', msg);
      }
      return true;
    },
    [activeCourse, sessionCanRecordCheckpoints, showRunnerToast]
  );

  // Ambil koordinat GPS secara cepat di latar belakang saat scan pos
  const getQuickGpsCoordinates = useCallback((): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null> => {
    return new Promise((resolve) => {
      if (gpsCoords) {
        resolve(gpsCoords);
        return;
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy),
          };
          setGpsCoords(coords);
          resolve(coords);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 3500, maximumAge: 15000 }
      );
    });
  }, [gpsCoords]);

  const triggerSilentPeriodicLocationUpdate = useCallback(async () => {
    if (!token || !participant || !activeSession || !activeCourse) return;
    if (!activeCourse.allowParticipantMapVisibility) return;

    const perm = await checkGeolocationPermission();
    if (perm === 'unsupported' || perm === 'denied') return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const payload: PendingLocationPayload = {
          sessionId: activeSession.id,
          participantId: participant.id,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(pos.coords.accuracy),
          measuredAt: new Date(pos.timestamp || Date.now()).toISOString(),
        };
        lastPeriodicAttemptMsRef.current = Date.now();
        const res = await sendLastLocationToServer({
          token,
          payload,
          isOfflineSimulated: simulatedOffline,
        });
        if (res.lastLocation) {
          setActiveSession((prev) =>
            prev ? { ...prev, lastLocation: res.lastLocation } : prev
          );
        }
      },
      () => {
        // Hening di latar belakang
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [token, participant, activeSession, activeCourse, simulatedOffline]);

  useEffect(() => {
    async function flushPendingLastLocation() {
      if (!isEffectivelyOnline || !token || !activeSession) return;
      const pending = loadPendingLastLocationOnly(activeSession.id);
      if (!pending) return;

      const res = await sendLastLocationToServer({
        token,
        payload: pending,
        isOfflineSimulated: simulatedOffline,
      });
      if (res.lastLocation) {
        setActiveSession((prev) =>
          prev ? { ...prev, lastLocation: res.lastLocation } : prev
        );
      }
    }
    flushPendingLastLocation();
  }, [isEffectivelyOnline, token, activeSession?.id, simulatedOffline]);

  useEffect(() => {
    if (!isSessionActivelyRunning || !activeCourse || !activeSession) return;
    if (!activeCourse.allowParticipantMapVisibility) return;

    if (lastPeriodicAttemptMsRef.current === 0) {
      triggerSilentPeriodicLocationUpdate();
    }

    const intervalId = window.setInterval(() => {
      triggerSilentPeriodicLocationUpdate();
    }, GPS_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastPeriodicAttemptMsRef.current;
        if (elapsed >= GPS_INTERVAL_MS) {
          triggerSilentPeriodicLocationUpdate();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    isSessionActivelyRunning,
    activeCourse,
    activeSession,
    triggerSilentPeriodicLocationUpdate,
  ]);

  // Pantau perubahan koneksi internet
  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      if (!simulatedOffline) {
        triggerSyncQueue(true);
      }
    };
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [simulatedOffline, triggerSyncQueue]);

  useEffect(() => {
    if (isEffectivelyOnline && activeSession && token) {
      triggerSyncQueue(true);
    }
  }, [isEffectivelyOnline, activeSession?.id, token, triggerSyncQueue]);

  useEffect(() => {
    if (!isEffectivelyOnline || !activeSession || !token) return;
    const hasPending = localReports.some(
      (r) =>
        r.syncStatus === SyncStatus.SAVED_LOCAL ||
        r.syncStatus === SyncStatus.PENDING_SYNC
    );
    if (!hasPending) return;

    const timer = window.setInterval(() => {
      triggerSyncQueue(true);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [
    isEffectivelyOnline,
    activeSession,
    token,
    localReports,
    triggerSyncQueue,
  ]);

  useEffect(() => {
    const handleVisibilityResume = () => {
      if (
        document.visibilityState === 'visible' &&
        isEffectivelyOnline &&
        activeSession &&
        token
      ) {
        triggerSyncQueue(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityResume);
    window.addEventListener('pageshow', handleVisibilityResume);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityResume);
      window.removeEventListener('pageshow', handleVisibilityResume);
    };
  }, [isEffectivelyOnline, activeSession, token, triggerSyncQueue]);

  // Pengaman cegah tutup tab tidak sengaja saat sesi sedang berjalan aktif
  useEffect(() => {
    const hasUnsynced = localReports.some(
      (r) =>
        r.syncStatus === SyncStatus.SAVED_LOCAL ||
        r.syncStatus === SyncStatus.PENDING_SYNC ||
        r.syncStatus === SyncStatus.SENDING
    );
    if (!isSessionActivelyRunning && !hasUnsynced) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSessionActivelyRunning, localReports]);

  // ==========================================================================
  // FUNGSI INTI SIMPAN LAPORAN OFFLINE-FIRST & AUTO-PROSES HASIL SCAN KAMERA
  // ==========================================================================

  const recordAndQueueReport = useCallback(
    async (params: {
      checkpointId: string;
      reportType: 'START' | 'CHECKPOINT' | 'FINISH';
      validationUsed: 'QR' | 'GPS' | 'QR_AND_GPS';
      qrPayloadScanned?: string;
      latitude?: number;
      longitude?: number;
      accuracyMeters?: number;
      displayLabel?: string;
    }) => {
      if (!participant || !activeCourse || !activeSession || !token) return;

      const measuredAt = new Date().toISOString();
      const newReport: CheckpointReport = {
        reportId: createUniqueReportId(params.reportType.toLowerCase()),
        courseId: activeCourse.id,
        sessionId: activeSession.id,
        participantId: participant.id,
        checkpointId: params.checkpointId,
        reportType: params.reportType,
        validationUsed: params.validationUsed,
        qrPayloadScanned: params.qrPayloadScanned,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracyMeters: params.accuracyMeters,
        measuredAt,
        syncStatus: SyncStatus.SAVED_LOCAL,
        serverVerified: false,
      };

      // Simpan ke IndexedDB lokal SEBELUM sinkronisasi server
      await saveReportsLocally([newReport]);
      const updatedLocal = await getLocalReportsForSession(activeSession.id);
      setLocalReports(updatedLocal);

      // Langsung kunci status sesi secara lokal (ACTIVE saat START, FINISHED saat FINISH)
      // agar tidak pernah tertimpa atau memunculkan peringatan "Harus scan Start dulu" saat scan CP!
      let nextSessionState: ParticipantSession = activeSession;
      if (params.reportType === 'START') {
        nextSessionState = {
          ...activeSession,
          status: SessionStatus.ACTIVE,
          startedAt: activeSession.startedAt || measuredAt,
        };
        setActiveSession(nextSessionState);
        savePersistedParticipantState({
          token,
          participant,
          activeCourse,
          activeSession: nextSessionState,
          simulatedOffline,
        });
      } else if (params.reportType === 'FINISH') {
        nextSessionState = {
          ...activeSession,
          status: SessionStatus.FINISHED,
          finishedAt: activeSession.finishedAt || measuredAt,
        };
        setActiveSession(nextSessionState);
        savePersistedParticipantState({
          token,
          participant,
          activeCourse,
          activeSession: nextSessionState,
          simulatedOffline,
        });
      }

      const timeStr = new Date(measuredAt).toLocaleTimeString('id-ID');
      const label = params.displayLabel || params.reportType;

      triggerRunnerFeedback('success');

      if (params.reportType === 'START') {
        showRunnerToast(
          'success',
          '🚀 START BERHASIL!',
          `Waktu lomba dimulai (${timeStr}). Semangat berlari!`
        );
      } else if (params.reportType === 'FINISH') {
        showRunnerToast(
          'success',
          '🏁 FINISH TERCATAT!',
          `Waktu Finish disimpan (${timeStr}). Kerja bagus!`
        );
      } else {
        showRunnerToast(
          'success',
          `✅ POS ${label} TERCATAT!`,
          `Tersimpan pukul ${timeStr}. Lanjut ke pos berikutnya!`
        );
      }

      setFeedbackBanner({
        type: 'success',
        text: `${label} berhasil disimpan di perangkat (${timeStr}).`,
      });

      // Sinkronisasi ke server di latar belakang dengan menyertakan snapshot sesi terbaru
      await triggerSyncQueue(true, nextSessionState);
    },
    [
      participant,
      activeCourse,
      activeSession,
      token,
      simulatedOffline,
      showRunnerToast,
      triggerSyncQueue,
    ]
  );

  const forceNewSessionRef = useRef<boolean>(false);

  // Fungsi Load Course langsung dari nilai QR yang dipindai
  const executeLoadCourseByQr = useCallback(
    async (qrValue: string) => {
      if (!token) return;
      const trimmed = qrValue.trim();
      if (!trimmed) return;

      setSetupQrInput(trimmed);
      setFeedbackBanner(null);

      try {
        const backupCourses = loadOrganizerCoursesBackup();
        const res = await fetch('/api/participant/load-event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            setupQrCode: trimmed,
            backupCourses,
            participantSnapshot: participant,
            forceNewSession: forceNewSessionRef.current,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          triggerRunnerFeedback('error');
          const errMsg = data.error || 'Gagal memuat Course dari Setup QR.';
          setFeedbackBanner({ type: 'error', text: errMsg });
          showRunnerToast('error', 'SETUP QR TIDAK DIKENALI', errMsg);
          return;
        }

        forceNewSessionRef.current = false;
        setActiveCourse(data.course);
        setActiveSession(data.session);
        setConfirmingLeaveCourse(false);
        if (data.course.checkpoints.length > 0) {
          setSelectedCheckpointId(data.course.checkpoints[0].id);
        }
        const attemptNum = data.session?.attemptNumber || 1;
        const attemptLabel =
          attemptNum > 1
            ? ` (Percobaan #${attemptNum} / Re-run — Data sebelumnya tetap tersimpan)`
            : '';
        triggerRunnerFeedback('success');
        showRunnerToast(
          'success',
          '🗺️ COURSE DIMUAT!',
          `${data.course.name}${attemptLabel} siap. Silakan Scan Start QR saat siap lari.`
        );
        setFeedbackBanner({
          type: 'success',
          text: `Course "${data.course.name}"${attemptLabel} berhasil dimuat! Silakan tekan tombol SCAN START QR saat siap memulai.`,
        });
      } catch {
        triggerRunnerFeedback('error');
        const msg =
          'Memuat Course membutuhkan koneksi internet awal sebelum turun ke lapangan.';
        setFeedbackBanner({ type: 'error', text: msg });
        showRunnerToast('error', 'GAGAL MEMUAT COURSE', msg);
      }
    },
    [token, participant, showRunnerToast]
  );

  /**
   * Pemroses Otomatis Hasil Scan Kamera Layar Penuh (1-Tap Runner Flow):
   * Mengenali otomatis apakah QR yang di-scan adalah Setup, Start, Checkpoint (CP1..CPn), atau Finish,
   * lalu langsung memproses dan menyimpannya detik itu juga tanpa perlu klik tombol ke-2!
   */
  const handleQrCodeDetectedFromCamera = useCallback(
    async (rawScanned: string) => {
      const scanned = rawScanned.trim();
      if (!scanned || isProcessingScanRef.current) return;
      isProcessingScanRef.current = true;

      // Tutup kamera full-screen seketika agar peserta langsung melihat konfirmasi besar
      setCameraActiveFor(null);
      setFlashOn(false);

      try {
        // KASUS 1: Peserta belum memuat Course (atau sedang di mode SETUP)
        if (!activeCourse || !activeSession || cameraActiveFor === 'SETUP') {
          if (activeCourse && activeSession && cameraActiveFor !== 'SETUP') {
            // Sudah di dalam course
          } else {
            await executeLoadCourseByQr(scanned);
            return;
          }
        }

        // KASUS 2: Peserta sudah di dalam Course, cek apakah tidak sengaja scan Setup QR (Kondisi A & B)
        if (checkAccidentalSetupQrScan(scanned)) {
          return;
        }

        const upperScanned = scanned.toUpperCase();
        const expectedStartCode = `BARAKA:START:${activeCourse.id}`.toUpperCase();
        const expectedFinishCode = `BARAKA:FINISH:${activeCourse.id}`.toUpperCase();

        // KASUS 3: Deteksi apakah ini START QR atau sedang menekan tombol SCAN START
        if (
          upperScanned.startsWith('BARAKA:START:') ||
          cameraActiveFor === 'START'
        ) {
          if (sessionCanRecordCheckpoints) {
            triggerRunnerFeedback('error');
            const msg =
              'Waktu Start Anda sudah berjalan. Silakan scan Pos Checkpoint atau Finish.';
            setFeedbackBanner({ type: 'warning', text: msg });
            showRunnerToast('warning', 'SUDAH START', msg);
            return;
          }

          // Jika peserta menekan tombol SCAN START tetapi mengarahkan kamera ke QR CP atau FINISH
          if (!upperScanned.startsWith('BARAKA:START:')) {
            triggerRunnerFeedback('error');
            const msg = upperScanned.startsWith('BARAKA:CP:')
              ? 'Itu adalah QR Pos Checkpoint! Silakan scan QR START terlebih dahulu.'
              : upperScanned.startsWith('BARAKA:FINISH:')
              ? 'Itu adalah QR Finish! Silakan scan QR START terlebih dahulu.'
              : 'QR yang dipindai bukan kode START. Silakan scan QR START resmi dari panitia.';
            setFeedbackBanner({ type: 'error', text: msg });
            showRunnerToast('error', 'BUKAN QR START!', msg);
            return;
          }

          // Pastikan QR START adalah milik Course yang sedang dimuat
          if (
            upperScanned !== expectedStartCode &&
            scanned !== activeCourse.startQrCode
          ) {
            triggerRunnerFeedback('error');
            const msg = `QR Start ini milik Course lain. Pastikan Anda memindai QR START untuk "${activeCourse.name}".`;
            setFeedbackBanner({ type: 'error', text: msg });
            showRunnerToast('error', 'QR START TIDAK COCOK', msg);
            return;
          }

          await recordAndQueueReport({
            checkpointId: 'START',
            reportType: 'START',
            validationUsed: 'QR',
            qrPayloadScanned: scanned,
            displayLabel: 'START',
          });
          return;
        }

        // KASUS 4: Deteksi apakah ini FINISH QR
        const isFinishQr =
          upperScanned.startsWith('BARAKA:FINISH:') ||
          cameraActiveFor === 'FINISH';

        if (isFinishQr && !upperScanned.startsWith('BARAKA:CP:')) {
          if (!sessionCanRecordCheckpoints) {
            triggerRunnerFeedback('error');
            const msg =
              'Anda belum melakukan Scan Start QR! Silakan scan Start QR terlebih dahulu.';
            setFeedbackBanner({ type: 'error', text: msg });
            showRunnerToast('error', 'BELUM START!', msg);
            return;
          }
          if (
            upperScanned !== expectedFinishCode &&
            scanned !== activeCourse.finishQrCode
          ) {
            triggerRunnerFeedback('error');
            const msg = `QR yang dipindai bukan kode FINISH untuk "${activeCourse.name}".`;
            setFeedbackBanner({ type: 'error', text: msg });
            showRunnerToast('error', 'BUKAN QR FINISH!', msg);
            return;
          }
          await recordAndQueueReport({
            checkpointId: 'FINISH',
            reportType: 'FINISH',
            validationUsed: 'QR',
            qrPayloadScanned: scanned,
            displayLabel: 'FINISH',
          });
          return;
        }

        // KASUS 5: Deteksi otomatis Pos Checkpoint dari isi QR (format BARAKA:CP:<courseId>:<cpCode>:<secret> atau kode CP)
        if (!sessionCanRecordCheckpoints) {
          triggerRunnerFeedback('error');
          const msg =
            'Silakan scan Start QR terlebih dahulu sebelum memindai Pos Checkpoint!';
          setFeedbackBanner({ type: 'error', text: msg });
          showRunnerToast('error', 'BELUM SCAN START!', msg);
          return;
        }

        let matchedCp: Checkpoint | undefined;

        // Coba ekstrak kode pos dari format BARAKA:CP:<courseId>:<cpCode>:<secret>
        if (upperScanned.startsWith('BARAKA:CP:')) {
          const parts = scanned.split(':');
          // parts[0]=BARAKA, parts[1]=CP, parts[2]=courseId, parts[3]=cpCode
          const extractedCode = parts[3]?.trim().toUpperCase();
          if (extractedCode) {
            matchedCp = activeCourse.checkpoints.find(
              (c) => c.code.toUpperCase() === extractedCode
            );
          }
        }

        // Jika belum ketemu, cari checkpoint yang kodenya terkandung di dalam string QR
        if (!matchedCp) {
          matchedCp = activeCourse.checkpoints.find(
            (c) =>
              upperScanned.includes(`:${c.code.toUpperCase()}:`) ||
              upperScanned.endsWith(`:${c.code.toUpperCase()}`) ||
              upperScanned === c.code.toUpperCase()
          );
        }

        // Fallback ke pos yang sedang dipilih jika format kustom
        if (!matchedCp && selectedCheckpointId) {
          matchedCp = activeCourse.checkpoints.find(
            (c) => c.id === selectedCheckpointId
          );
        }

        if (!matchedCp) {
          triggerRunnerFeedback('error');
          const msg = `QR Code (${scanned}) tidak cocok dengan pos mana pun pada Course ini.`;
          setFeedbackBanner({ type: 'error', text: msg });
          showRunnerToast('error', 'QR POS TIDAK DIKENALI', msg);
          return;
        }

        // Jika Course membutuhkan GPS (QR_AND_GPS), ambil GPS otomatis di latar belakang tanpa merepotkan peserta
        let coordsToUse = gpsCoords;
        if (
          activeCourse.validationMethod === ValidationMethod.QR_AND_GPS ||
          activeCourse.validationMethod === ValidationMethod.GPS_AUTO
        ) {
          coordsToUse = await getQuickGpsCoordinates();
        }

        const validationUsed: 'QR' | 'GPS' | 'QR_AND_GPS' = coordsToUse
          ? 'QR_AND_GPS'
          : 'QR';

        await recordAndQueueReport({
          checkpointId: matchedCp.id,
          reportType: 'CHECKPOINT',
          validationUsed,
          qrPayloadScanned: scanned,
          latitude: coordsToUse?.latitude,
          longitude: coordsToUse?.longitude,
          accuracyMeters: coordsToUse?.accuracy,
          displayLabel: matchedCp.name
            ? `${matchedCp.code} (${matchedCp.name})`
            : matchedCp.code,
        });

        // Otomatis arahkan pilihan pos berikutnya
        const currentIndex = activeCourse.checkpoints.findIndex(
          (c) => c.id === matchedCp!.id
        );
        if (
          currentIndex >= 0 &&
          currentIndex + 1 < activeCourse.checkpoints.length
        ) {
          setSelectedCheckpointId(
            activeCourse.checkpoints[currentIndex + 1].id
          );
        }
      } finally {
        window.setTimeout(() => {
          isProcessingScanRef.current = false;
        }, 600);
      }
    },
    [
      activeCourse,
      activeSession,
      cameraActiveFor,
      checkAccidentalSetupQrScan,
      executeLoadCourseByQr,
      getQuickGpsCoordinates,
      gpsCoords,
      recordAndQueueReport,
      selectedCheckpointId,
      sessionCanRecordCheckpoints,
      showRunnerToast,
    ]
  );

  // ==========================================================================
  // KAMERA FULL-SCREEN (BARCODE DETECTOR + JSQR UNIVERSAL FALLBACK + TORCH/FLASH)
  // ==========================================================================

  const toggleCameraFlash = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const nextFlash = !flashOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextFlash } as MediaTrackConstraintSet],
      });
      setFlashOn(nextFlash);
    } catch {
      setFlashSupported(false);
    }
  }, [flashOn]);

  // Simpan referensi handler QR ke dalam useRef agar useEffect kamera HANYA bergantung pada [cameraActiveFor]
  // sehingga stream kamera tidak pernah berkedip / restart saat ada update GPS atau polling di latar belakang!
  const qrDetectedHandlerRef = useRef(handleQrCodeDetectedFromCamera);
  useEffect(() => {
    qrDetectedHandlerRef.current = handleQrCodeDetectedFromCamera;
  }, [handleQrCodeDetectedFromCamera]);

  useEffect(() => {
    if (!cameraActiveFor) return;

    let isCancelled = false;
    let stream: MediaStream | null = null;
    let scanTimer: number | null = null;
    const offscreenCanvas = document.createElement('canvas');
    const offscreenCtx = offscreenCanvas.getContext('2d', {
      willReadFrequently: true,
    });

    async function startCamera() {
      setFlashOn(false);
      setFlashSupported(true);

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (isCancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        stream = mediaStream;
        streamRef.current = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play().catch(() => {});
        }

        const BarcodeDetectorClass = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => {
              detect: (
                video: HTMLVideoElement
              ) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;

        const nativeDetector = BarcodeDetectorClass
          ? new BarcodeDetectorClass({ formats: ['qr_code'] })
          : null;

        scanTimer = window.setInterval(async () => {
          const video = videoRef.current;
          if (
            isCancelled ||
            !video ||
            video.readyState < 2 ||
            isProcessingScanRef.current
          ) {
            return;
          }

          // 1. Coba gunakan Native BarcodeDetector jika tersedia
          if (nativeDetector) {
            try {
              const codes = await nativeDetector.detect(video);
              if (codes.length > 0 && codes[0].rawValue) {
                void qrDetectedHandlerRef.current(codes[0].rawValue);
                return;
              }
            } catch {
              // Lanjut ke fallback jsQR di bawah
            }
          }

          // 2. Fallback Universal jsQR (Bekerja di semua HP Android & iPhone Safari)
          if (offscreenCtx && video.videoWidth > 0 && video.videoHeight > 0) {
            try {
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              const cropSize = Math.min(vw, vh) * 0.75;
              const sx = (vw - cropSize) / 2;
              const sy = (vh - cropSize) / 2;
              const targetDim = 420;

              offscreenCanvas.width = targetDim;
              offscreenCanvas.height = targetDim;
              offscreenCtx.drawImage(
                video,
                sx,
                sy,
                cropSize,
                cropSize,
                0,
                0,
                targetDim,
                targetDim
              );

              const imageData = offscreenCtx.getImageData(
                0,
                0,
                targetDim,
                targetDim
              );
              const decoded = jsQR(
                imageData.data,
                imageData.width,
                imageData.height,
                { inversionAttempts: 'dontInvert' }
              );
              if (decoded && decoded.data) {
                void qrDetectedHandlerRef.current(decoded.data);
              }
            } catch {
              // Abaikan frame gagal
            }
          }
        }, 200);
      } catch {
        if (!isCancelled) {
          setFeedbackBanner({
            type: 'warning',
            text: 'Kamera tidak dapat diakses. Pastikan izin kamera diberikan atau gunakan menu Input Manual di bawah.',
          });
          setCameraActiveFor(null);
        }
      }
    }

    startCamera();

    return () => {
      isCancelled = true;
      if (scanTimer) window.clearInterval(scanTimer);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
    };
  }, [cameraActiveFor]);

  // ==========================================================================
  // HANDLER AUTENTIKASI & INPUT MANUAL
  // ==========================================================================

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackBanner(null);

    if (!regTeam.trim()) {
      setFeedbackBanner({
        type: 'error',
        text: 'Nama Tim wajib diisi.',
      });
      return;
    }

    try {
      const res = await fetch('/api/participant/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          teamName: regTeam.trim(),
          gender: regGender,
          ageGroup: regAgeGroup,
          phone: regPhone.trim(),
          pin: regPin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedbackBanner({
          type: 'error',
          text:
            data.error ||
            `Registrasi gagal (HTTP ${res.status}). Pastikan endpoint API tersedia.`,
        });
        return;
      }
      try {
        localStorage.removeItem('baraka_organizer_token');
      } catch {
        // Abaikan
      }
      if (data.participantBackup) {
        mergeAndSaveOrganizerVaultBackup({
          participants: [data.participantBackup],
        });
      }
      setToken(data.token);
      setParticipant(data.participant);
      triggerRunnerFeedback('success');
      setFeedbackBanner({
        type: 'success',
        text: `Registrasi berhasil! Nomor BIB Anda: ${data.participant.bibNumber} (Tim: ${data.participant.teamName}). Silakan tekan tombol SCAN SETUP QR.`,
      });
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: 'Registrasi awal membutuhkan koneksi ke server.',
      });
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackBanner(null);
    try {
      const localVault = loadOrganizerVaultBackup();
      const res = await fetch('/api/participant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bibOrName: loginIdentity,
          pin: loginPin,
          vaultParticipants: localVault.participants,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedbackBanner({
          type: 'error',
          text:
            data.error ||
            `Login gagal (HTTP ${res.status}). Pastikan server API aktif.`,
        });
        return;
      }
      try {
        localStorage.removeItem('baraka_organizer_token');
      } catch {
        // Abaikan
      }
      if (data.participantBackup) {
        mergeAndSaveOrganizerVaultBackup({
          participants: [data.participantBackup],
        });
      }
      setToken(data.token);
      setParticipant(data.participant);
      triggerRunnerFeedback('success');
      if (data.activeCourse && data.latestSession) {
        setActiveCourse(data.activeCourse);
        setActiveSession(data.latestSession);
        setFeedbackBanner({
          type: 'success',
          text: `Selamat datang kembali, ${data.participant.name} (${data.participant.teamName})! Sesi Course "${data.activeCourse.name}" Anda siap dilanjutkan.`,
        });
      } else {
        setFeedbackBanner({
          type: 'success',
          text: `Login berhasil: ${data.participant.name} — Tim ${data.participant.teamName} (${data.participant.bibNumber}).`,
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: 'Gagal terhubung ke server untuk login.',
      });
    }
  }

  function handleLogout() {
    setToken(null);
    setParticipant(null);
    setActiveCourse(null);
    setActiveSession(null);
    setConfirmingLeaveCourse(false);
    clearPersistedParticipantState();
    setFeedbackBanner(null);
    onLogout?.();
  }

  async function handleRestartFromBeginning() {
    // Pastikan semua laporan sesi sebelumnya sudah disinkronkan ke server sebelum membuka layar Scan Setup QR baru
    if (activeSession && token && isEffectivelyOnline) {
      await triggerSyncQueue(true);
    }
    forceNewSessionRef.current = true;
    setActiveCourse(null);
    setActiveSession(null);
    setLocalReports([]);
    setSelectedCheckpointId('');
    setSetupQrInput('');
    setStartQrInput('');
    setCheckpointQrInput('');
    setFinishQrInput('');
    setConfirmingLeaveCourse(false);
    savePersistedParticipantState({
      token,
      participant,
      activeCourse: null,
      activeSession: null,
      simulatedOffline,
    });
    setFeedbackBanner({
      type: 'success',
      text: 'Data hasil lari sebelumnya tetap tersimpan aman di server. Silakan Scan Setup QR untuk memulai lagi dari awal!',
    });
  }

  function handleConfirmLeaveCourse() {
    void handleRestartFromBeginning();
  }

  async function handleLoadCourse(e: React.FormEvent) {
    e.preventDefault();
    await executeLoadCourseByQr(setupQrInput);
  }

  async function handleStartSession(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = startQrInput.trim();
    if (!trimmed) {
      setFeedbackBanner({
        type: 'error',
        text: 'Silakan pindai atau masukkan Start QR Code terlebih dahulu.',
      });
      return;
    }

    if (checkAccidentalSetupQrScan(trimmed)) {
      setStartQrInput('');
      return;
    }

    if (activeCourse) {
      const upperTrimmed = trimmed.toUpperCase();
      const expectedStart = `BARAKA:START:${activeCourse.id}`.toUpperCase();
      if (
        upperTrimmed !== expectedStart &&
        trimmed !== activeCourse.startQrCode
      ) {
        triggerRunnerFeedback('error');
        setFeedbackBanner({
          type: 'error',
          text: `Kode Start QR tidak cocok dengan Course "${activeCourse.name}". Pastikan Anda memasukkan kode Start yang benar.`,
        });
        return;
      }
    }

    await recordAndQueueReport({
      checkpointId: 'START',
      reportType: 'START',
      validationUsed: 'QR',
      qrPayloadScanned: trimmed,
      displayLabel: 'START',
    });
    setStartQrInput('');
  }

  async function handleReportCheckpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCourse || !selectedCheckpointId) return;

    const trimmedQr = checkpointQrInput.trim();

    if (trimmedQr && checkAccidentalSetupQrScan(trimmedQr)) {
      setCheckpointQrInput('');
      return;
    }

    const method = activeCourse.validationMethod;
    const needsQr =
      method === ValidationMethod.QR_ONLY ||
      method === ValidationMethod.QR_AND_GPS;
    const needsGps =
      method === ValidationMethod.GPS_AUTO ||
      method === ValidationMethod.QR_AND_GPS;

    if (needsQr && !trimmedQr) {
      setFeedbackBanner({
        type: 'error',
        text: 'Course ini mewajibkan pemindaian QR Code Checkpoint.',
      });
      return;
    }

    let coordsToUse = gpsCoords;
    if (needsGps && !coordsToUse) {
      coordsToUse = await getQuickGpsCoordinates();
    }

    if (needsGps && !coordsToUse) {
      setFeedbackBanner({
        type: 'error',
        text: 'Course ini membutuhkan koordinat GPS peserta. Tekan tombol "Ambil Posisi GPS" terlebih dahulu.',
      });
      return;
    }

    if (method === ValidationMethod.QR_OR_GPS && !trimmedQr && !coordsToUse) {
      setFeedbackBanner({
        type: 'error',
        text: 'Silakan pindai QR Checkpoint atau ambil posisi GPS Anda.',
      });
      return;
    }

    const validationUsed: 'QR' | 'GPS' | 'QR_AND_GPS' =
      trimmedQr && coordsToUse ? 'QR_AND_GPS' : coordsToUse ? 'GPS' : 'QR';

    const cpObj = activeCourse.checkpoints.find(
      (c) => c.id === selectedCheckpointId
    );

    await recordAndQueueReport({
      checkpointId: selectedCheckpointId,
      reportType: 'CHECKPOINT',
      validationUsed,
      qrPayloadScanned: trimmedQr || undefined,
      latitude: coordsToUse?.latitude,
      longitude: coordsToUse?.longitude,
      accuracyMeters: coordsToUse?.accuracy,
      displayLabel: cpObj
        ? cpObj.name
          ? `${cpObj.code} (${cpObj.name})`
          : cpObj.code
        : 'CHECKPOINT',
    });

    setCheckpointQrInput('');

    const currentIndex = activeCourse.checkpoints.findIndex(
      (c) => c.id === selectedCheckpointId
    );
    if (
      currentIndex >= 0 &&
      currentIndex + 1 < activeCourse.checkpoints.length
    ) {
      setSelectedCheckpointId(activeCourse.checkpoints[currentIndex + 1].id);
    }
  }

  async function handleFinishSession(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = finishQrInput.trim();
    if (!trimmed) {
      setFeedbackBanner({
        type: 'error',
        text: 'Silakan pindai Finish QR Code untuk menyelesaikan kegiatan.',
      });
      return;
    }

    if (checkAccidentalSetupQrScan(trimmed)) {
      setFinishQrInput('');
      return;
    }

    await recordAndQueueReport({
      checkpointId: 'FINISH',
      reportType: 'FINISH',
      validationUsed: 'QR',
      qrPayloadScanned: trimmed,
      displayLabel: 'FINISH',
    });
    setFinishQrInput('');
  }

  function handleReadDeviceGps(simulateMatchingCheckpoint?: Checkpoint) {
    if (simulateMatchingCheckpoint) {
      setGpsCoords({
        latitude: simulateMatchingCheckpoint.latitude,
        longitude: simulateMatchingCheckpoint.longitude,
        accuracy: 8,
      });
      setFeedbackBanner({
        type: 'success',
        text: `Koordinat GPS tepat di ${simulateMatchingCheckpoint.code} berhasil dimuat (±8m).`,
      });
      return;
    }

    if (!navigator.geolocation) {
      setFeedbackBanner({
        type: 'error',
        text: 'Perangkat/browser ini tidak mendukung Geolocation GPS.',
      });
      return;
    }

    setIsReadingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsReadingGps(false);
        setGpsCoords({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        setIsReadingGps(false);
        setFeedbackBanner({
          type: 'warning',
          text: `Gagal membaca GPS perangkat (${err.message}). Anda dapat menggunakan tombol "Simulasi GPS di Pos" untuk pengujian.`,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  function handleDownloadProofCard() {
    if (!participant || !activeCourse || !activeSession) return;

    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, canvas.width, 8);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('BARAKA ADVENTURE — BUKTI CADANGAN PESERTA', 32, 48);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(
      `${participant.name} — Tim ${participant.teamName} (${participant.bibNumber})`,
      32,
      90
    );

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Course: ${activeCourse.name}`, 32, 128);
    ctx.fillText(
      `Lokasi: ${activeCourse.locationName} (${activeCourse.date})`,
      32,
      155
    );
    ctx.fillText(`ID Sesi: ${activeSession.id}`, 32, 182);

    const validatedCount = activeSession.validatedCheckpointIds.length;
    const localRecordedCount = new Set(
      localReports
        .filter((r) => r.reportType === 'CHECKPOINT')
        .map((r) => r.checkpointId)
    ).size;

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(
      `Pos Tervalidasi Server: ${validatedCount} / ${activeCourse.checkpoints.length} Pos`,
      32,
      228
    );
    ctx.fillText(
      `Pos Tercatat di Perangkat: ${localRecordedCount} / ${activeCourse.checkpoints.length} Pos`,
      32,
      258
    );
    ctx.fillText(
      `Total Skor Resmi Server: ${activeSession.totalScore} Poin`,
      32,
      288
    );
    ctx.fillText(
      `Status Sesi Server: ${activeSession.status} | Durasi: ${
        activeSession.durationSeconds !== undefined
          ? `${activeSession.durationSeconds} detik`
          : 'Belum selesai / Menunggu sinkronisasi'
      }`,
      32,
      318
    );

    ctx.fillStyle = '#64748b';
    ctx.font = '13px monospace';
    ctx.fillText(
      `Dicetak dari perangkat pada: ${new Date().toISOString()}`,
      32,
      400
    );

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Bukti-Baraka-${participant.bibNumber}.png`;
    a.click();
  }

  const pendingSyncCount = localReports.filter(
    (r) =>
      r.syncStatus === SyncStatus.SAVED_LOCAL ||
      r.syncStatus === SyncStatus.PENDING_SYNC ||
      r.syncStatus === SyncStatus.SENDING
  ).length;

  const selectedCheckpoint = activeCourse?.checkpoints.find(
    (c) => c.id === selectedCheckpointId
  );

  // Hitung jumlah pos yang sudah tercatat (baik di perangkat lokal maupun server)
  const completedCheckpointCount = useMemo(() => {
    if (!activeCourse || !activeSession) return 0;
    const combined = new Set<string>(activeSession.validatedCheckpointIds);
    localReports.forEach((r) => {
      if (
        r.reportType === 'CHECKPOINT' &&
        r.syncStatus !== SyncStatus.REJECTED_SERVER
      ) {
        combined.add(r.checkpointId);
      }
    });
    return combined.size;
  }, [activeCourse, activeSession, localReports]);

  // Hitung waktu tempuh berjalan (Stopwatch)
  const effectiveStartIso = useMemo(() => {
    if (activeSession?.startedAt) return activeSession.startedAt;
    const localStart = localReports.find(
      (r) =>
        r.reportType === 'START' && r.syncStatus !== SyncStatus.REJECTED_SERVER
    );
    return localStart?.measuredAt || null;
  }, [activeSession?.startedAt, localReports]);

  const effectiveFinishIso = useMemo(() => {
    if (activeSession?.finishedAt) return activeSession.finishedAt;
    const localFinish = localReports.find(
      (r) =>
        r.reportType === 'FINISH' && r.syncStatus !== SyncStatus.REJECTED_SERVER
    );
    return localFinish?.measuredAt || null;
  }, [activeSession?.finishedAt, localReports]);

  const liveStopwatchSeconds = useMemo(() => {
    if (activeSession?.durationSeconds !== undefined) {
      return activeSession.durationSeconds;
    }
    if (!effectiveStartIso) return undefined;
    const endMs = effectiveFinishIso ? Date.parse(effectiveFinishIso) : nowTick;
    return Math.max(
      0,
      Math.floor((endMs - Date.parse(effectiveStartIso)) / 1000)
    );
  }, [
    activeSession?.durationSeconds,
    effectiveStartIso,
    effectiveFinishIso,
    nowTick,
  ]);

  // Hitung rincian Poin Kotor, Menit Terlambat (Overtime), Potongan Penalti, dan Skor Bersih
  const scoreBreakdown = useMemo(() => {
    if (!activeCourse || !activeSession) {
      return {
        grossScore: 0,
        overtimeMinutes: 0,
        penaltyPoints: 0,
        netScore: 0,
        isOvertime: false,
      };
    }

    const grossScore =
      activeSession.grossScore !== undefined
        ? activeSession.grossScore
        : activeCourse.scoringEnabled
        ? activeSession.validatedCheckpointIds.reduce((sum, id) => {
            const cp = activeCourse.checkpoints.find((c) => c.id === id);
            return sum + (cp ? Number(cp.points) || 0 : 0);
          }, 0)
        : activeSession.totalScore;

    const limitMin = Number(activeCourse.durationMinutes) || 0;
    let overtimeMinutes = activeSession.overtimeMinutes || 0;
    let penaltyPoints = activeSession.penaltyPoints || 0;

    if (
      limitMin > 0 &&
      liveStopwatchSeconds !== undefined &&
      liveStopwatchSeconds > limitMin * 60
    ) {
      const overSec = liveStopwatchSeconds - limitMin * 60;
      overtimeMinutes = Math.ceil(overSec / 60);
      if (activeCourse.overtimePenaltyEnabled) {
        penaltyPoints =
          overtimeMinutes *
          Math.max(0, Number(activeCourse.overtimePenaltyPointsPerMinute) || 0);
      }
    }

    const netScore = Math.max(0, grossScore - penaltyPoints);
    return {
      grossScore,
      overtimeMinutes,
      penaltyPoints,
      netScore,
      isOvertime: overtimeMinutes > 0,
    };
  }, [activeCourse, activeSession, liveStopwatchSeconds]);

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-12">
      {/* ====================================================================
          FULL-SCREEN QR SCANNER OVERLAY (PERSIS DESAIN REFERENSI iOrienteering)
          Langsung menutup seluruh layar HP tanpa perlu scroll!
         ==================================================================== */}
      {cameraActiveFor && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
          {/* TOP BAR GAYA iOrienteering: Nama Aplikasi di Kiri, FLASH ON & CANCEL di Kanan */}
          <div className="flex h-14 shrink-0 items-center justify-between bg-[#221c1d] px-4 text-white shadow-md z-20">
            <div className="text-lg font-normal tracking-wide text-white truncate">
              BARAKA ADVENTURE
            </div>
            <div className="flex items-center gap-5">
              {flashSupported && (
                <button
                  type="button"
                  onClick={toggleCameraFlash}
                  className={`text-sm sm:text-base font-medium uppercase tracking-wider transition ${
                    flashOn ? 'text-lime-400' : 'text-white hover:text-slate-200'
                  }`}
                >
                  {flashOn ? 'FLASH OFF' : 'FLASH ON'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setCameraActiveFor(null);
                  setFlashOn(false);
                }}
                className="text-sm sm:text-base font-medium uppercase tracking-wider text-white hover:text-slate-200"
              >
                CANCEL
              </button>
            </div>
          </div>

          {/* AREA KAMERA PENUH DENGAN KOTAK BIDIK PERSEGI BESAR, 4 SIKU HIJAU & GARIS MERAH */}
          <div className="relative flex-1 overflow-hidden bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              muted
            />

            {/* KOTAK BIDIK TENGAH (VIEWFINDER) BESAR DENGAN SHADOW GELAP DI KELILINGNYA */}
            <div
              className="relative z-10 h-64 w-64 sm:h-72 sm:w-72 bg-white/10"
              style={{
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.48)',
              }}
            >
              {/* Siku Kiri Atas (Hijau Terang) */}
              <div className="pointer-events-none absolute top-0 left-0 h-10 w-10 border-t-4 border-l-4 border-[#84cc16]" />
              {/* Siku Kanan Atas (Hijau Terang) */}
              <div className="pointer-events-none absolute top-0 right-0 h-10 w-10 border-t-4 border-r-4 border-[#84cc16]" />
              {/* Siku Kiri Bawah (Hijau Terang) */}
              <div className="pointer-events-none absolute bottom-0 left-0 h-10 w-10 border-b-4 border-l-4 border-[#84cc16]" />
              {/* Siku Kanan Bawah (Hijau Terang) */}
              <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-10 border-b-4 border-r-4 border-[#84cc16]" />

              {/* Garis Laser Merah Horizontal di Tengah Kotak Bidik */}
              <div className="pointer-events-none absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[1.5px] bg-red-500/85 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
            </div>

            {/* Petunjuk Mode Scan Singkat di Bagian Bawah Layar Kamera */}
            <div className=" absolute bottom-6 left-4 right-4 z-20 flex flex-col items-center gap-2 text-center">
              <div className="rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold text-slate-200 border border-white/15 backdrop-blur-sm">
                {!activeCourse || cameraActiveFor === 'SETUP'
                  ? 'Arahkan kotak ke Setup QR Code dari Panitia'
                  : !sessionCanRecordCheckpoints
                  ? 'Arahkan kotak ke START QR Code untuk mulai waktu'
                  : 'Arahkan kotak ke QR Pos Checkpoint atau FINISH QR'}
              </div>

              {/* Tombol Cepat Simulasi di dalam Kamera (berguna jika diuji lewat Laptop) */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                {!activeCourse || cameraActiveFor === 'SETUP' ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleQrCodeDetectedFromCamera(
                        DEMO_QR_CODES.SETUP_DEFAULT
                      )
                    }
                    className="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-[11px] font-bold text-white shadow"
                  >
                    Simulasi Scan Setup QR
                  </button>
                ) : !sessionCanRecordCheckpoints ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleQrCodeDetectedFromCamera(
                        activeCourse.id === 'crs-sprint-01'
                          ? DEMO_QR_CODES.START_SPRINT
                          : activeCourse.id === 'crs-amazing-02'
                          ? DEMO_QR_CODES.START_AMAZING
                          : `BARAKA:START:${activeCourse.id}`
                      )
                    }
                    className="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-[11px] font-bold text-white shadow"
                  >
                    Simulasi Scan Start QR
                  </button>
                ) : (
                  <>
                    {activeCourse.checkpoints.map((cp) => {
                      const codeMap =
                        activeCourse.id === 'crs-sprint-01'
                          ? DEMO_QR_CODES.CP_SPRINT
                          : DEMO_QR_CODES.CP_AMAZING;
                      const secret =
                        codeMap[cp.code] ||
                        `BARAKA:CP:${activeCourse.id}:${cp.code}`;
                      return (
                        <button
                          key={cp.id}
                          type="button"
                          onClick={() =>
                            void handleQrCodeDetectedFromCamera(secret)
                          }
                          className="rounded-lg bg-slate-900/90 border border-lime-400/50 px-2.5 py-1 text-[11px] font-bold text-lime-300"
                        >
                          Simulasi {cp.code}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() =>
                        void handleQrCodeDetectedFromCamera(
                          activeCourse.id === 'crs-sprint-01'
                            ? DEMO_QR_CODES.FINISH_SPRINT
                            : activeCourse.id === 'crs-amazing-02'
                            ? DEMO_QR_CODES.FINISH_AMAZING
                            : `BARAKA:FINISH:${activeCourse.id}`
                        )
                      }
                      className="rounded-lg bg-sky-600/90 px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      Simulasi Finish
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          KONFIRMASI INSTAN UKURAN BESAR SETELAH SCAN (MUDAH DILIRIK PELARI)
         ==================================================================== */}
      {instantScanToast && (
        <div className="fixed inset-x-4 top-16 z-40 mx-auto max-w-md animate-bounce">
          <div
            className={`rounded-2xl border-2 p-4 shadow-2xl backdrop-blur-md ${
              instantScanToast.type === 'success'
                ? 'border-lime-400 bg-emerald-950/95 text-white'
                : instantScanToast.type === 'warning'
                ? 'border-amber-400 bg-amber-950/95 text-white'
                : 'border-rose-400 bg-rose-950/95 text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-extrabold tracking-wide">
                {instantScanToast.title}
              </div>
              <Volume2 className="h-5 w-5 shrink-0 opacity-80" />
            </div>
            <div className="mt-1 text-xs sm:text-sm font-medium opacity-95">
              {instantScanToast.subtitle}
            </div>
          </div>
        </div>
      )}

      {/* BANNER PENGAMAN OFFLINE BROWSER & OPSI PASANG IKON DI LAYAR HP */}
      <PWAInstallBanner />

      {/* BAR STATUS JARINGAN RINGKAS */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2.5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isEffectivelyOnline ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Wifi className="h-3.5 w-3.5" />
              </span>
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <WifiOff className="h-3.5 w-3.5" />
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-100">
                  {isEffectivelyOnline ? 'Online' : 'Mode Offline (Tetap Aman)'}
                </span>
                {pendingSyncCount > 0 && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 border border-amber-500/30">
                    {pendingSyncCount} Antrean
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSimulatedOffline((prev) => !prev)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition border ${
                simulatedOffline
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {simulatedOffline ? 'Offline: ON' : 'Simulasi Offline'}
            </button>

            {activeSession && (
              <button
                type="button"
                onClick={() => triggerSyncQueue(false)}
                disabled={isSyncing}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`}
                />
                Sync
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BANNER NOTIFIKASI STATUS / ERROR */}
      {feedbackBanner && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs sm:text-sm ${
            feedbackBanner.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
              : feedbackBanner.type === 'warning'
              ? 'border-amber-500/40 bg-amber-950/60 text-amber-200'
              : 'border-rose-500/40 bg-rose-950/60 text-rose-200'
          }`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{feedbackBanner.text}</div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Tutup
          </button>
        </div>
      )}

      {/* ====================================================================
          LANGKAH 1: REGISTRASI (NAMA TIM WAJIB) ATAU LOGIN PESERTA
         ==================================================================== */}
      {!participant ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Langkah 1 — Identitas Peserta
              </span>
              <h2 className="text-lg font-bold text-white">
                Masuk / Daftar Peserta
              </h2>
            </div>
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setAuthTab('login')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  authTab === 'login'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sudah Punya BIB
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('register')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  authTab === 'register'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Daftar Baru
              </button>
            </div>
          </div>

          {authTab === 'register' ? (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nama Peserta / Ketua Tim{' '}
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Tim (Wajib) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regTeam}
                    onChange={(e) => setRegTeam(e.target.value)}
                    placeholder="Contoh: Elang Rimba"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Gender (Kategori)
                  </label>
                  <select
                    value={regGender}
                    onChange={(e) => setRegGender(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {ORIENTEERING_GENDER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Kelompok Umur (Orienteering)
                  </label>
                  <select
                    value={regAgeGroup}
                    onChange={(e) => setRegAgeGroup(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {ORIENTEERING_AGE_GROUPS.map((ag) => (
                      <option key={ag} value={ag}>
                        {ag === 'Semua Umur'
                          ? 'Semua Umur (Tanpa Kelompok Umur)'
                          : `${ag} Tahun`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Buat PIN Keamanan (Minimal 4 digit){' '}
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={regPin}
                  onChange={(e) => setRegPin(e.target.value)}
                  placeholder="Contoh: 1234"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition"
              >
                Daftar &amp; Lanjut Scan Setup QR
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="rounded-lg bg-slate-950/90 p-3 text-xs text-slate-400 border border-slate-800">
                Akun contoh siap uji: Nomor BIB{' '}
                <strong className="text-slate-200">BRK-101</strong> dengan PIN{' '}
                <strong className="text-slate-200">1111</strong>.
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nomor BIB, Nama Peserta, atau Nama Tim
                </label>
                <input
                  type="text"
                  required
                  value={loginIdentity}
                  onChange={(e) => setLoginIdentity(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  PIN Peserta
                </label>
                <input
                  type="password"
                  required
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition"
              >
                Masuk Peserta
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          {/* HEADER PROFIL PESERTA AKTIF */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-12 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                {participant.bibNumber}
              </div>
              <div>
                <div className="text-sm font-bold text-white leading-tight">
                  {participant.name}
                </div>
                <div className="text-xs text-emerald-400 font-medium">
                  Tim: {participant.teamName} • {participant.gender || 'Other'} •{' '}
                  {participant.ageGroup || 'Semua Umur'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" /> Ganti Akun
            </button>
          </div>

          {/* ==================================================================
              LANGKAH 2: LOAD COURSE (HANYA MUNCUL JIKA BELUM MASUK KE COURSE!)
              Dilengkapi Tombol Besar Scan Kamera Layar Penuh
             ================================================================== */}
          {!activeCourse || !activeSession ? (
            <div className="rounded-xl border border-emerald-500/40 bg-slate-900/90 p-5 space-y-4">
              <div className="text-center space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Langkah 2 — Masuk ke Course
                </span>
                <h3 className="text-lg font-extrabold text-white">
                  Scan Setup QR dari Panitia
                </h3>
                <p className="text-xs text-slate-400">
                  Tekan tombol di bawah untuk membuka kamera layar penuh, lalu arahkan ke Setup QR Code.
                </p>
              </div>

              {/* TOMBOL UTAMA BESAR: BUKA KAMERA LAYAR PENUH */}
              <button
                type="button"
                onClick={() => setCameraActiveFor('SETUP')}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] py-6 px-4 text-white shadow-lg shadow-emerald-950/60 transition cursor-pointer"
              >
                <Camera className="h-10 w-10" />
                <span className="text-lg font-extrabold tracking-wide uppercase">
                  SCAN SETUP QR (LAYAR PENUH)
                </span>
                <span className="text-xs text-emerald-100 font-medium">
                  Otomatis memuat Course begitu QR terbaca kamera
                </span>
              </button>

              {/* OPSI INPUT MANUAL SETUP QR JIKA DIBUTUHKAN */}
              <form
                onSubmit={handleLoadCourse}
                className="pt-2 border-t border-slate-800 space-y-2"
              >
                <label className="block text-[11px] text-slate-400">
                  Atau muat dengan kode Setup QR (untuk uji coba di laptop):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={setupQrInput}
                    onChange={(e) => setSetupQrInput(e.target.value)}
                    placeholder="BARAKA:SETUP:..."
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-slate-700"
                  >
                    <QrCode className="h-4 w-4" /> Muat
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ==================================================================
               TAMPILAN UTAMA PELARI (ANTI-RIBET, TANPA PERLU SCROLL UNTUK SCAN!)
               ================================================================== */
            <>
              {/* KARTU UTAMA PELARI: STOPWATCH BESAR + TOMBOL RAKSASA 1-TAP SCAN QR */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="truncate">
                    <div className="text-[11px] font-medium text-emerald-400 truncate">
                      {activeCourse.locationName
                        ? `${activeCourse.locationName} • `
                        : ''}
                      {activeCourse.enforceOrder
                        ? 'Wajib Berurutan'
                        : 'Acak / Score'}
                      {activeCourse.durationMinutes &&
                      activeCourse.durationMinutes > 0
                        ? ` • Batas: ${activeCourse.durationMinutes} Menit`
                        : ''}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white truncate">
                      {activeCourse.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeSession.attemptNumber &&
                      activeSession.attemptNumber > 1 && (
                        <span className="rounded-md px-2 py-1 text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          Attempt #{activeSession.attemptNumber} (Re-run)
                        </span>
                      )}
                    {scoreBreakdown.isOvertime && (
                      <span className="rounded-md px-2 py-1 text-[10px] font-mono font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                        OVERTIME +{scoreBreakdown.overtimeMinutes}M
                      </span>
                    )}
                    <span
                      className={`rounded-md px-2.5 py-1 text-xs font-extrabold ${
                        sessionMarkedFinishedLocallyOrServer
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : sessionCanRecordCheckpoints
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {sessionMarkedFinishedLocallyOrServer
                        ? 'FINISHED'
                        : sessionCanRecordCheckpoints
                        ? 'SEDANG LARI'
                        : 'SIAP START'}
                    </span>
                  </div>
                </div>

                {/* PANEL ANGKA KONTRAS TINGGI UNTUK PELARI */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div
                    className={`col-span-3 sm:col-span-1 rounded-xl border py-3 px-2 ${
                      scoreBreakdown.isOvertime
                        ? 'border-rose-500/50 bg-rose-950/30'
                        : 'border-slate-800 bg-slate-950'
                    }`}
                  >
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">
                      Waktu Lomba
                      {activeCourse.durationMinutes &&
                      activeCourse.durationMinutes > 0
                        ? ` (Maks ${activeCourse.durationMinutes}m)`
                        : ''}
                    </div>
                    <div
                      className={`text-2xl sm:text-xl font-mono font-extrabold mt-0.5 ${
                        scoreBreakdown.isOvertime
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {effectiveStartIso
                        ? formatStopwatchSeconds(liveStopwatchSeconds)
                        : '00:00:00'}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-800 bg-slate-950 py-3 px-2">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">
                      Pos Tercapai
                    </div>
                    <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
                      {completedCheckpointCount} /{' '}
                      {activeCourse.checkpoints.length}
                    </div>
                  </div>
                  <div className="col-span-1 rounded-xl border border-slate-800 bg-slate-950 py-3 px-2">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">
                      Skor Akhir
                    </div>
                    <div className="text-xl font-extrabold text-white mt-0.5">
                      {scoreBreakdown.netScore}
                    </div>
                    {scoreBreakdown.penaltyPoints > 0 && (
                      <div className="text-[10px] font-mono text-rose-400">
                        (-{scoreBreakdown.penaltyPoints} penalti)
                      </div>
                    )}
                  </div>
                </div>

                {/* ============================================================
                    TOMBOL SCAN UTAMA RAKSASA (TEPAT DI ATAS, TANPA PERLU SCROLL!)
                   ============================================================ */}
                {!sessionCanRecordCheckpoints ? (
                  <button
                    type="button"
                    onClick={() => setCameraActiveFor('START')}
                    className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] py-6 px-4 text-white shadow-lg shadow-emerald-950/80 transition cursor-pointer"
                  >
                    <Play className="h-10 w-10 fill-current" />
                    <span className="text-xl font-extrabold tracking-wide uppercase">
                      SCAN START QR
                    </span>
                    <span className="text-xs text-emerald-100 font-medium">
                      Buka kamera layar penuh &amp; otomatis mulai waktu lomba
                    </span>
                  </button>
                ) : !sessionMarkedFinishedLocallyOrServer ? (
                  <button
                    type="button"
                    onClick={() => setCameraActiveFor('AUTO_RACE')}
                    className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] py-7 px-4 text-white shadow-lg shadow-emerald-950/80 transition cursor-pointer border-2 border-lime-400/50"
                  >
                    <Camera className="h-11 w-11" />
                    <span className="text-xl sm:text-2xl font-extrabold tracking-wide uppercase">
                      SCAN QR POS / FINISH
                    </span>
                    <span className="text-xs text-emerald-100 font-medium">
                      Kamera layar penuh • Otomatis kenali CP1–CP
                      {activeCourse.checkpoints.length} atau Finish
                    </span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 p-4 text-center space-y-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
                      <Flag className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-white">
                        Selamat! Anda Telah Menyelesaikan Lomba
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Total Waktu:{' '}
                        <strong className="font-mono text-amber-300">
                          {formatStopwatchSeconds(liveStopwatchSeconds)}
                        </strong>{' '}
                        • Pos Tercapai:{' '}
                        <strong>
                          {completedCheckpointCount}/
                          {activeCourse.checkpoints.length}
                        </strong>
                      </p>
                      {scoreBreakdown.penaltyPoints > 0 && (
                        <div className="mt-2 inline-flex flex-wrap items-center justify-center gap-2 rounded-lg bg-slate-950/90 border border-rose-500/40 px-3 py-1.5 text-xs font-mono">
                          <span className="text-slate-300">
                            Poin Pos: <strong>{scoreBreakdown.grossScore}</strong>
                          </span>
                          <span className="text-rose-400">
                            • Penalti Telat ({scoreBreakdown.overtimeMinutes}m):{' '}
                            <strong>-{scoreBreakdown.penaltyPoints}</strong>
                          </span>
                          <span className="text-emerald-300">
                            • Skor Akhir: <strong>{scoreBreakdown.netScore}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleDownloadProofCard}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 py-3 text-xs sm:text-sm font-bold text-white transition cursor-pointer"
                      >
                        <Download className="h-4 w-4" /> Unduh Kartu Bukti Hasil (PNG)
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleRestartFromBeginning()}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 py-3 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-emerald-950/60 transition cursor-pointer"
                      >
                        <RefreshCw className="h-4 w-4" /> Mulai Lagi dari Awal (Scan Setup QR)
                      </button>
                      <p className="text-[11px] text-slate-400">
                        Tenang, hasil lari Anda di atas tetap tersimpan di server &amp; Leaderboard panitia.
                      </p>
                    </div>
                  </div>
                )}

                {/* DAFTAR RINGKAS POS CHECKPOINT */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Daftar Pos Checkpoint
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Hijau = Sudah Tercatat
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {activeCourse.checkpoints.map((cp) => {
                      const isServerValidated =
                        activeSession.validatedCheckpointIds.includes(cp.id);
                      const localCpReport = [...localReports]
                        .reverse()
                        .find(
                          (r) =>
                            r.reportType === 'CHECKPOINT' &&
                            r.checkpointId === cp.id &&
                            r.syncStatus !== SyncStatus.REJECTED_SERVER
                        );
                      const isDone = isServerValidated || Boolean(localCpReport);

                      return (
                        <div
                          key={cp.id}
                          className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs transition ${
                            isDone
                              ? 'border-emerald-500/50 bg-emerald-950/35'
                              : 'border-slate-800 bg-slate-950/90'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                                isDone
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {isDone ? '✓' : cp.orderIndex}
                            </span>
                            <div>
                              <span className="font-bold text-white">
                                {cp.code}
                              </span>
                              {cp.name ? (
                                <>
                                  {' '}
                                  —{' '}
                                  <span className="text-slate-300">
                                    {cp.name}
                                  </span>
                                </>
                              ) : null}
                              <div className="text-[11px] text-slate-400">
                                {cp.points} Poin
                              </div>
                            </div>
                          </div>
                          <div>
                            {isServerValidated ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                                <ShieldCheck className="h-3.5 w-3.5" /> Sah
                              </span>
                            ) : localCpReport ? (
                              <SyncBadge status={localCpReport.syncStatus} />
                            ) : (
                              <span className="text-[11px] text-slate-500">
                                Belum
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ==============================================================
                  TOMBOL UNDUH BUKTI CADANGAN (SELALU MUDAH DIAKSES)
                 ============================================================== */}
              {!sessionMarkedFinishedLocallyOrServer && (
                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                  <div className="text-xs text-slate-300">
                    Butuh simpan bukti cadangan ke galeri HP?
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadProofCard}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" /> Unduh PNG
                  </button>
                </div>
              )}

              {/* ==============================================================
                  MENU LIPAT: MODE DARURAT / INPUT MANUAL & SIMULASI
                  (Disembunyikan secara default agar layar pelari pendek & bersih)
                 ============================================================== */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowManualTools((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
                >
                  <span className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-slate-400" />
                    Mode Bantuan / Input Kode Manual &amp; Simulasi
                  </span>
                  {showManualTools ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showManualTools && (
                  <div className="border-t border-slate-800 p-4 space-y-5 bg-slate-950/50">
                    {/* Input Manual Start QR */}
                    {!sessionCanRecordCheckpoints && (
                      <form onSubmit={handleStartSession} className="space-y-2">
                        <label className="block text-xs font-bold text-emerald-400">
                          Input Manual Start QR:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={startQrInput}
                            onChange={(e) => setStartQrInput(e.target.value)}
                            placeholder="BARAKA:START:..."
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white"
                          >
                            Mulai
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setStartQrInput(
                              activeCourse.id === 'crs-sprint-01'
                                ? DEMO_QR_CODES.START_SPRINT
                                : activeCourse.id === 'crs-amazing-02'
                                ? DEMO_QR_CODES.START_AMAZING
                                : `BARAKA:START:${activeCourse.id}`
                            )
                          }
                          className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300"
                        >
                          Isi Contoh Start QR
                        </button>
                      </form>
                    )}

                    {/* Input Manual Checkpoint */}
                    {sessionCanRecordCheckpoints &&
                      !sessionMarkedFinishedLocallyOrServer && (
                        <form
                          onSubmit={handleReportCheckpoint}
                          className="space-y-3"
                        >
                          <div className="text-xs font-bold text-emerald-400">
                            Input Manual Pos Checkpoint:
                          </div>
                          <div>
                            <select
                              value={selectedCheckpointId}
                              onChange={(e) =>
                                setSelectedCheckpointId(e.target.value)
                              }
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                            >
                              {activeCourse.checkpoints.map((cp) => (
                                <option key={cp.id} value={cp.id}>
                                  Pos #{cp.orderIndex} — {cp.code}: {cp.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {activeCourse.validationMethod !==
                            ValidationMethod.GPS_AUTO && (
                            <div className="space-y-1.5">
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={checkpointQrInput}
                                  onChange={(e) =>
                                    setCheckpointQrInput(e.target.value)
                                  }
                                  placeholder={`Kode QR ${
                                    selectedCheckpoint?.code || ''
                                  }...`}
                                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white"
                                >
                                  Simpan Pos
                                </button>
                              </div>
                              {selectedCheckpoint && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const codeMap =
                                      activeCourse.id === 'crs-sprint-01'
                                        ? DEMO_QR_CODES.CP_SPRINT
                                        : DEMO_QR_CODES.CP_AMAZING;
                                    const demoSecret =
                                      codeMap[selectedCheckpoint.code] ||
                                      `BARAKA:CP:${activeCourse.id}:${selectedCheckpoint.code}`;
                                    setCheckpointQrInput(demoSecret);
                                  }}
                                  className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300"
                                >
                                  Isi Contoh QR {selectedCheckpoint.code}
                                </button>
                              )}
                            </div>
                          )}

                          {activeCourse.validationMethod !==
                            ValidationMethod.QR_ONLY && (
                            <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5 space-y-2">
                              <div className="flex items-center justify-between text-[11px] text-slate-300">
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                                  GPS (Radius: {selectedCheckpoint?.radiusMeters}
                                  m)
                                </span>
                                {gpsCoords && (
                                  <span className="font-mono text-emerald-400">
                                    {gpsCoords.latitude.toFixed(4)},{' '}
                                    {gpsCoords.longitude.toFixed(4)}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleReadDeviceGps()}
                                  disabled={isReadingGps}
                                  className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] text-white"
                                >
                                  <Compass className="h-3 w-3" />
                                  {isReadingGps ? 'Membaca...' : 'Ambil GPS HP'}
                                </button>
                                {selectedCheckpoint && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleReadDeviceGps(selectedCheckpoint)
                                    }
                                    className="rounded border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-[11px] text-emerald-300"
                                  >
                                    Simulasi GPS di {selectedCheckpoint.code}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </form>
                      )}

                    {/* Input Manual Finish QR */}
                    {sessionCanRecordCheckpoints &&
                      !sessionMarkedFinishedLocallyOrServer && (
                        <form
                          onSubmit={handleFinishSession}
                          className="space-y-2 pt-3 border-t border-slate-800"
                        >
                          <label className="block text-xs font-bold text-sky-400">
                            Input Manual Finish QR:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={finishQrInput}
                              onChange={(e) => setFinishQrInput(e.target.value)}
                              placeholder="BARAKA:FINISH:..."
                              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                            />
                            <button
                              type="submit"
                              className="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-bold text-white"
                            >
                              Finish
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setFinishQrInput(
                                activeCourse.id === 'crs-sprint-01'
                                  ? DEMO_QR_CODES.FINISH_SPRINT
                                  : activeCourse.id === 'crs-amazing-02'
                                  ? DEMO_QR_CODES.FINISH_AMAZING
                                  : `BARAKA:FINISH:${activeCourse.id}`
                              )
                            }
                            className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300"
                          >
                            Isi Contoh Finish QR
                          </button>
                        </form>
                      )}
                  </div>
                )}
              </div>

              {/* ==============================================================
                  MENU LIPAT: RIWAYAT ANTREAN LAPORAN PERANGKAT (INDEXEDDB)
                 ============================================================== */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHistoryLogs((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    Riwayat Waktu &amp; Sinkronisasi ({localReports.length}{' '}
                    Laporan)
                  </span>
                  {showHistoryLogs ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showHistoryLogs && (
                  <div className="border-t border-slate-800 p-4 space-y-2 bg-slate-950/50">
                    {localReports.length === 0 ? (
                      <div className="text-center text-xs text-slate-500 py-2">
                        Belum ada laporan pada sesi ini.
                      </div>
                    ) : (
                      [...localReports].reverse().map((rep) => {
                        const cpObj = activeCourse.checkpoints.find(
                          (c) => c.id === rep.checkpointId
                        );
                        const title =
                          rep.reportType === 'START'
                            ? 'START QR'
                            : rep.reportType === 'FINISH'
                            ? 'FINISH QR'
                            : `${cpObj?.code || rep.checkpointId} — ${
                                cpObj?.name || ''
                              }`;

                        return (
                          <div
                            key={rep.reportId}
                            className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 space-y-1 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-slate-100">
                                {title}
                              </span>
                              <SyncBadge status={rep.syncStatus} />
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Waktu Scan:{' '}
                              {new Date(rep.measuredAt).toLocaleTimeString(
                                'id-ID'
                              )}
                            </div>
                            {rep.rejectionReason && (
                              <div className="rounded bg-rose-950/60 border border-rose-500/30 px-2 py-1 text-[11px] text-rose-300">
                                Catatan Server: {rep.rejectionReason}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* ==============================================================
                  TOMBOL "MULAI LAGI DARI AWAL / GANTI COURSE" (DENGAN KONFIRMASI)
                 ============================================================== */}
              <div className="pt-4 flex flex-col items-center justify-center">
                {!confirmingLeaveCourse ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingLeaveCourse(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                    Mulai Lagi dari Awal / Scan Setup QR Baru
                  </button>
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3.5 text-center space-y-2.5 max-w-xs shadow-lg">
                    <p className="text-xs text-slate-200 leading-relaxed">
                      Kembali ke menu <strong>Scan Setup QR</strong> untuk mulai dari awal?{' '}
                      <span className="text-emerald-400 block mt-0.5 text-[11px]">
                        (Data sesi yang sudah tercatat tetap disimpan di server)
                      </span>
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingLeaveCourse(false)}
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmLeaveCourse}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer"
                      >
                        Ya, Mulai Lagi (Scan Setup)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
