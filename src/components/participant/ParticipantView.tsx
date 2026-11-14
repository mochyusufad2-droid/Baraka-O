import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Download,
  Flag,
  KeyRound,
  LogOut,
  MapPin,
  Play,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Volume2,
  Wifi,
  WifiOff,
  X,
  XCircle,
  Zap,
  Lock,
  Unlock,
  Users,
} from 'lucide-react';
import {
  Checkpoint,
  CheckpointReport,
  Course,
  CourseRaceMode,
  ORIENTEERING_AGE_GROUPS,
  ORIENTEERING_GENDER_OPTIONS,
  ParticipantPublic,
  ParticipantSession,
  RelayDnfScoringMode,
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
import { ParticipantCourseMap } from './ParticipantCourseMap';

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

function calculateClientHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
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

/**
 * Umpan balik suara (Beep) & getar instan menggunakan Web Audio API (100% bekerja offline)
 * agar peserta yang sedang berlari langsung tahu hasil scan tanpa harus membaca teks kecil.
 */
function triggerRunnerFeedback(type: 'success' | 'error') {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'success') {
        // GETAR MANTAP ATLET (BUZZ-BUZZ TEGAS 2 KALI): 140ms getar, 60ms jeda, 200ms getar panjang
        navigator.vibrate([140, 60, 200]);
      } else {
        // TIGA KETUKAN PERINGATAN (TRIPLE BUZZ): 200ms, 80ms, 200ms, 80ms, 200ms
        navigator.vibrate([200, 80, 200, 80, 200]);
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
      // DUAL TONE NADA TINGGI SUKSES (C6 -> E6): Jelas terdengar di alam terbuka
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1318.5, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else {
      // LOW SAWTOOTH DUA KALI NADA RENDAH PERINGATAN
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.26);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    }
  } catch {
    // Abaikan jika Web Audio diblokir browser
  }
}

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

interface RelayTeamLegInfo {
  legIndex: number;
  sessionId?: string;
  participantTeamName?: string | null;
  memberNames?: string | null;
  status?: SessionStatus | null;
  isDnf?: boolean;
  checkpointsCompleted?: number;
  totalScore?: number;
  durationSeconds?: number;
  relayOverrideUnlocked?: boolean;
  isMe?: boolean;
}

interface RelayExistingParentTeam {
  parentTeamKey: string;
  parentTeamName: string;
  takenLegs: {
    legIndex: number;
    participantTeamName?: string | null;
    status?: SessionStatus | null;
    isDnf?: boolean;
    isMe?: boolean;
  }[];
}

interface RelayTeamStatus {
  isRelayLocked: boolean;
  lockReason?: string | null;
  waitingOnLeg?: number | null;
  parentTeamName?: string | null;
  legIndex?: number | null;
  subTeamCount: number;
  legs: RelayTeamLegInfo[];
  existingParentTeams?: RelayExistingParentTeam[];
}

interface ParticipantViewProps {
  onAuthenticated?: () => void;
  onLogout?: () => void;
  onActiveCourseModeChange?: (inActiveCourse: boolean) => void;
}

export default function ParticipantView({
  onAuthenticated,
  onLogout,
  onActiveCourseModeChange,
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

  useEffect(() => {
    onActiveCourseModeChange?.(Boolean(participant && activeCourse && activeSession));
    return () => {
      onActiveCourseModeChange?.(false);
    };
  }, [participant, activeCourse, activeSession, onActiveCourseModeChange]);
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
  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPin, setLoginPin] = useState('');

  // Ganti Password Tim (Self-service Peserta)
  const [isChangeParticipantPasswordOpen, setIsChangeParticipantPasswordOpen] = useState(false);
  const [partPassCurrent, setPartPassCurrent] = useState('');
  const [partPassNew, setPartPassNew] = useState('');
  const [partPassConfirm, setPartPassConfirm] = useState('');
  const [partPassLoading, setPartPassLoading] = useState(false);
  const [partPassError, setPartPassError] = useState<string | null>(null);

  // Koordinat GPS peserta dari perangkat fisik (Real-time via watchPosition + fallback getCurrentPosition)
  const [gpsCoords, setGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const gpsCoordsRef = useRef<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const lastGpsFixTimestampRef = useRef<number>(0);
  const lastGpsStateUpdateMsRef = useRef<number>(0);
  const [isReadingGps, setIsReadingGps] = useState(false);

  const updateRealtimeGpsCoords = useCallback(
    (
      next: { latitude: number; longitude: number; accuracy: number },
      forceStateUpdate = false
    ) => {
      const now = Date.now();
      lastGpsFixTimestampRef.current = now;
      const prev = gpsCoordsRef.current;
      gpsCoordsRef.current = next;

      if (forceStateUpdate || !prev) {
        lastGpsStateUpdateMsRef.current = now;
        setGpsCoords(next);
        return;
      }

      const movedMeters = calculateClientHaversineMeters(
        prev.latitude,
        prev.longitude,
        next.latitude,
        next.longitude
      );
      const accuracyDiff = Math.abs((prev.accuracy || 0) - (next.accuracy || 0));
      const elapsedSinceUiUpdate = now - lastGpsStateUpdateMsRef.current;

      // Update UI state segera jika peserta bergerak >= 0.8 meter, akurasi berubah >= 3m, atau >= 1.5 detik berlalu
      if (movedMeters >= 0.8 || accuracyDiff >= 3 || elapsedSinceUiUpdate >= 1500) {
        lastGpsStateUpdateMsRef.current = now;
        setGpsCoords(next);
      }
    },
    []
  );

  // Mode Kunci Saku Cepat (Pocket Mode) — Layar OLED Hitam Pekat, bebas ghost touch di saku, hemat baterai 60%
  const [isPocketLocked, setIsPocketLocked] = useState(false);
  const [unlockHoldProgress, setUnlockHoldProgress] = useState(0);
  const [unlockScanHoldProgress, setUnlockScanHoldProgress] = useState(0);
  const unlockTimerRef = useRef<number | null>(null);
  const wakeLockSentinelRef = useRef<any>(null);
  const [showRelayDetailWhileRunning, setShowRelayDetailWhileRunning] = useState(false);

  // Panel riwayat antrean laporan lokal
  const [showHistoryLogs, setShowHistoryLogs] = useState(false);
  // Tab tampilan peserta di dalam Course: 'COURSE' (Daftar Pos) | 'MAP' (Peta Lintasan Peserta jika diizinkan Organizer)
  const [runnerViewTab, setRunnerViewTab] = useState<'COURSE' | 'MAP'>('COURSE');

  // Konfirmasi keluar Course (ditempatkan jauh dari tombol Scan)
  const [confirmingLeaveCourse, setConfirmingLeaveCourse] = useState(false);

  // Pelacakan lokasi berkala (~5 menit) berjalan di latar belakang ke server
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
  const [showDnfLogoutModal, setShowDnfLogoutModal] = useState(false);
  const [isSubmittingDnf, setIsSubmittingDnf] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // State khusus Mode Relay (Estafet Akumulasi Sub-Team)
  const [relayStatus, setRelayStatus] = useState<RelayTeamStatus | null>(null);
  const [relayParentInput, setRelayParentInput] = useState<string>(
    initialPersisted.activeSession?.relayParentTeamName || ''
  );
  const [relayLegInput, setRelayLegInput] = useState<number>(
    initialPersisted.activeSession?.relayLegIndex || 1
  );
  const [relayMembersInput, setRelayMembersInput] = useState<string>(
    initialPersisted.activeSession?.relayMemberNames || ''
  );
  const [isSavingRelayProfile, setIsSavingRelayProfile] = useState<boolean>(false);
  const [isEditingRelayIdentity, setIsEditingRelayIdentity] = useState<boolean>(false);

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

  // Otomatis hilangkan banner pemberitahuan setelah 4 detik (Auto-Dismiss)
  useEffect(() => {
    if (!feedbackBanner) return;
    const timer = window.setTimeout(() => {
      setFeedbackBanner(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [feedbackBanner]);

  // Tampilkan toast instan (2,6 detik untuk sukses, 3,8 detik untuk peringatan/error)
  const showRunnerToast = useCallback(
    (
      type: 'success' | 'error' | 'warning',
      title: string,
      subtitle: string
    ) => {
      setInstantScanToast({ type, title, subtitle });
      const durationMs = type === 'success' ? 2600 : 3800;
      window.setTimeout(() => {
        setInstantScanToast((prev) =>
          prev && prev.title === title ? null : prev
        );
      }, durationMs);
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



  // Jika Organizer menonaktifkan tampilan peta untuk peserta, kembalikan tab ke 'COURSE'
  useEffect(() => {
    if (
      activeCourse &&
      activeCourse.allowParticipantMapVisibility === false &&
      runnerViewTab === 'MAP'
    ) {
      setRunnerViewTab('COURSE');
    }
  }, [activeCourse, runnerViewTab]);

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

  // Daftar ID checkpoint yang sudah tervalidasi di sesi ini (gabungan server + lokal yang sah)
  const effectiveValidatedCheckpointIds = useMemo(() => {
    const ids = new Set<string>(activeSession?.validatedCheckpointIds || []);
    for (const r of localReports) {
      if (
        r.reportType === 'CHECKPOINT' &&
        r.syncStatus !== SyncStatus.REJECTED_SERVER &&
        r.checkpointId &&
        r.checkpointId !== 'START' &&
        r.checkpointId !== 'FINISH'
      ) {
        ids.add(r.checkpointId);
      }
    }
    return Array.from(ids);
  }, [activeSession?.validatedCheckpointIds, localReports]);

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

      // Pertahankan identitas Relay jika belum terisi pada respon parsial
      merged.relayParentTeamName =
        incoming.relayParentTeamName ?? prev.relayParentTeamName;
      merged.relayParentTeamKey =
        incoming.relayParentTeamKey ?? prev.relayParentTeamKey;
      merged.relayLegIndex = incoming.relayLegIndex ?? prev.relayLegIndex;
      merged.relayMemberNames = incoming.relayMemberNames ?? prev.relayMemberNames;
      merged.relayOverrideUnlocked = Boolean(
        incoming.relayOverrideUnlocked || prev.relayOverrideUnlocked
      );
      merged.relayOverrideReason =
        incoming.relayOverrideReason ?? prev.relayOverrideReason;
      merged.relayOverrideAt = incoming.relayOverrideAt ?? prev.relayOverrideAt;

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

  // Sinkronisasi Real-Time Pengaturan Course & Sesi dari Server (ketika panitia mengedit Course / Checkpoint / Relay)
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
          setRelayStatus(null);
          setFeedbackBanner({
            type: 'warning',
            text: 'Course telah dihapus oleh panitia. Silakan scan Setup QR Course yang baru.',
          });
        }
        return;
      }
      if (!res.ok) return;
      const rawText = await res.text().catch(() => '');
      let data: {
        session?: ParticipantSession;
        course?: Course | null;
        sessionMissingOnServer?: boolean;
        relayStatus?: RelayTeamStatus | null;
      };
      try {
        data = JSON.parse(rawText);
      } catch {
        return;
      }
      if (data.course) {
        const incomingCourse = data.course;
        setActiveCourse((prev) => {
          if (prev && JSON.stringify(prev) === JSON.stringify(incomingCourse)) {
            return prev;
          }
          if (
            prev &&
            prev.raceMode !== CourseRaceMode.RELAY &&
            incomingCourse.raceMode === CourseRaceMode.RELAY
          ) {
            setFeedbackBanner({
              type: 'warning',
              text: `Panitia baru saja mengaktifkan Mode Relay (${incomingCourse.relaySubTeamCount || 3} Sub-Team) pada Course "${incomingCourse.name}". Silakan isi Nama Tim Induk & Urutan Sub-Team Anda!`,
            });
          }
          return incomingCourse;
        });
      }
      if (data.relayStatus !== undefined) {
        setRelayStatus((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data.relayStatus || null)) {
            return prev;
          }
          return data.relayStatus || null;
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

      if (outcome.relayStatus !== undefined) {
        setRelayStatus(outcome.relayStatus || null);
      }

      const validLocalStartAfterSync = outcome.allSessionReports.some(
        (r) => r.reportType === 'START' && r.syncStatus !== SyncStatus.REJECTED_SERVER
      );
      const rejectedStartReport = [...outcome.allSessionReports]
        .reverse()
        .find(
          (r) => r.reportType === 'START' && r.syncStatus === SyncStatus.REJECTED_SERVER
        );

      if (
        !validLocalStartAfterSync &&
        outcome.updatedSession?.status === SessionStatus.NOT_STARTED
      ) {
        // Server menolak START (misal karena Relay Lock): rollback status lokal agar stopwatch tidak berjalan!
        setActiveSession(outcome.updatedSession);
        triggerRunnerFeedback('error');
        const rejectMsg =
          rejectedStartReport?.rejectionReason ||
          'Start ditolak oleh server (Giliran Estafet belum terbuka).';
        setFeedbackBanner({ type: 'error', text: rejectMsg });
        showRunnerToast('error', 'START DITOLAK SERVER', rejectMsg);
        return;
      }

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
    [activeSession, token, simulatedOffline, mergeServerSessionSafely, showRunnerToast]
  );

  // Simpan Identitas Tim Induk & Urutan Sub-Team pada Course Mode Relay
  const handleSaveRelayProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !activeCourse || !token) return;
    if (!relayParentInput.trim()) {
      setFeedbackBanner({
        type: 'error',
        text: 'Nama Tim Induk wajib diisi untuk lomba Mode Relay.',
      });
      return;
    }
    setIsSavingRelayProfile(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch('/api/participant/relay-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: activeSession.id,
          relayParentTeamName: relayParentInput.trim(),
          relayLegIndex: relayLegInput,
          relayMemberNames: relayMembersInput.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerRunnerFeedback('error');
        setFeedbackBanner({
          type: 'error',
          text: data.error || 'Gagal menyimpan identitas Sub-Team Relay.',
        });
        return;
      }
      if (data.session) {
        setActiveSession(data.session);
      }
      if (data.relayStatus !== undefined) {
        setRelayStatus(data.relayStatus || null);
      }
      setIsEditingRelayIdentity(false);
      triggerRunnerFeedback('success');
      setFeedbackBanner({
        type: 'success',
        text: `Identitas estafet disimpan: Tim Induk "${data.session?.relayParentTeamName}" • Sub-Team #${data.session?.relayLegIndex}.`,
      });
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: 'Menyimpan identitas Tim Induk membutuhkan koneksi ke server agar tidak bentrok dengan Sub-Team lain.',
      });
    } finally {
      setIsSavingRelayProfile(false);
    }
  };

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

  // Ambil koordinat GPS secara cepat & segar saat scan pos atau buka peta
  const getQuickGpsCoordinates = useCallback((): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null> => {
    return new Promise((resolve) => {
      const now = Date.now();
      // Gunakan koordinat dari watchPosition hanya jika sangat baru (<= 3 detik terakhir)
      if (
        gpsCoordsRef.current &&
        now - lastGpsFixTimestampRef.current <= 3000
      ) {
        resolve(gpsCoordsRef.current);
        return;
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(gpsCoordsRef.current || null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy),
          };
          updateRealtimeGpsCoords(coords, true);
          resolve(coords);
        },
        () => {
          // Jika sinyal satelit sesaat terhalang pohon/gedung, gunakan fix terakhir dari watchPosition jika ada
          resolve(gpsCoordsRef.current || null);
        },
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
      );
    });
  }, [updateRealtimeGpsCoords]);

  // Pelacakan GPS Lokal Real-Time (watchPosition) di HP Peserta (0 Kuota Data, memperbarui titik biru di Peta setiap peserta melangkah)
  useEffect(() => {
    if (!token || !participant || !activeCourse) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;
    let isCancelled = false;

    checkGeolocationPermission().then((perm) => {
      if (isCancelled || perm === 'unsupported' || perm === 'denied') return;

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy),
          };
          updateRealtimeGpsCoords(coords, false);
        },
        () => {
          // Abaikan error sementara saat mencari satelit
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        }
      );
    });

    return () => {
      isCancelled = true;
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [token, participant, activeCourse?.id, updateRealtimeGpsCoords]);

  const triggerSilentPeriodicLocationUpdate = useCallback(async () => {
    if (!token || !participant || !activeSession || !activeCourse) return;

    const perm = await checkGeolocationPermission();
    if (perm === 'unsupported' || perm === 'denied') return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        };
        updateRealtimeGpsCoords(coords, true);
        const payload: PendingLocationPayload = {
          sessionId: activeSession.id,
          participantId: participant.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, [
    token,
    participant,
    activeSession,
    activeCourse,
    simulatedOffline,
    updateRealtimeGpsCoords,
  ]);

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

  // PELACAKAN LOKASI BERKALA KE SERVER PANITIA (Mengirim 1 koordinat terakhir setiap GPS_INTERVAL_MS)
  useEffect(() => {
    if (!isSessionActivelyRunning || !activeCourse || !activeSession) return;

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

  // Matikan Mode Saku (Pocket Lock) otomatis jika sesi sudah Finish/berhenti
  useEffect(() => {
    if (!isSessionActivelyRunning && isPocketLocked) {
      setIsPocketLocked(false);
      setUnlockHoldProgress(0);
    }
  }, [isSessionActivelyRunning, isPocketLocked]);

  // SCREEN WAKE LOCK API: Mencegah layar HP tidur otomatis saat lomba berlangsung
  useEffect(() => {
    let released = false;

    async function requestWakeLock() {
      if (
        !isSessionActivelyRunning ||
        typeof navigator === 'undefined' ||
        !('wakeLock' in navigator)
      ) {
        return;
      }
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        if (!released) {
          wakeLockSentinelRef.current = lock;
        } else {
          lock.release().catch(() => {});
        }
      } catch {
        // Abaikan jika browser membatasi wakeLock karena daya baterai kritis
      }
    }

    if (isSessionActivelyRunning) {
      requestWakeLock();
    } else if (wakeLockSentinelRef.current) {
      wakeLockSentinelRef.current.release().catch(() => {});
      wakeLockSentinelRef.current = null;
    }

    const handleVisibilityForWakeLock = () => {
      if (document.visibilityState === 'visible' && isSessionActivelyRunning) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityForWakeLock);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityForWakeLock);
      if (wakeLockSentinelRef.current) {
        wakeLockSentinelRef.current.release().catch(() => {});
        wakeLockSentinelRef.current = null;
      }
    };
  }, [isSessionActivelyRunning]);

  // PROTEKSI TAB TERKUNCI: Cegah peserta menutup tab web secara tidak sengaja di saku/tangan
  useEffect(() => {
    if (!isSessionActivelyRunning) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Sesi lomba Anda sedang aktif berjalan. Yakin ingin keluar?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSessionActivelyRunning]);

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
      } else if (params.reportType === 'CHECKPOINT') {
        const existingValidated = Array.isArray(
          activeSession.validatedCheckpointIds
        )
          ? activeSession.validatedCheckpointIds
          : [];
        const updatedValidated = existingValidated.includes(params.checkpointId)
          ? existingValidated
          : [...existingValidated, params.checkpointId];
        nextSessionState = {
          ...activeSession,
          validatedCheckpointIds: updatedValidated,
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

      // Dual-Trigger: Setiap kali peserta scan QR (Start, CP, Finish), langsung perbarui posisi secara instan
      let instantLat = params.latitude;
      let instantLng = params.longitude;
      let instantAcc = params.accuracyMeters;

      if (instantLat === undefined || instantLng === undefined) {
        if (params.reportType === 'CHECKPOINT') {
          const cp = activeCourse.checkpoints.find(
            (c) => c.id === params.checkpointId
          );
          if (cp) {
            instantLat = cp.latitude;
            instantLng = cp.longitude;
            instantAcc = cp.radiusMeters || 15;
          }
        } else if (params.reportType === 'START' && activeCourse.startLocation) {
          instantLat = activeCourse.startLocation.latitude;
          instantLng = activeCourse.startLocation.longitude;
          instantAcc = 15;
        } else if (params.reportType === 'FINISH' && activeCourse.finishLocation) {
          instantLat = activeCourse.finishLocation.latitude;
          instantLng = activeCourse.finishLocation.longitude;
          instantAcc = 15;
        }
      }

      if (instantLat !== undefined && instantLng !== undefined) {
        const instantLocPayload: PendingLocationPayload = {
          sessionId: activeSession.id,
          participantId: participant.id,
          latitude: instantLat,
          longitude: instantLng,
          accuracyMeters: instantAcc || 15,
          measuredAt,
        };
        nextSessionState = {
          ...nextSessionState,
          lastLocation: {
            ...instantLocPayload,
            receivedAt: measuredAt,
          },
        };
        setActiveSession(nextSessionState);
        void sendLastLocationToServer({
          token,
          payload: instantLocPayload,
          isOfflineSimulated: simulatedOffline,
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

  /**
   * Validasi Instan di Sisi Peserta SEBELUM menyimpan laporan Checkpoint:
   * Memastikan Urutan Pos (enforceOrder), Duplikat Pos, serta Aturan Validasi Course
   * (QR_ONLY, QR_AND_GPS + Radius, GPS_AUTO + Radius, QR_OR_GPS) langsung diperiksa detik itu juga.
   */
  const validateCheckpointBeforeRecord = useCallback(
    (params: {
      checkpoint: Checkpoint;
      scannedQr?: string;
      coords?: { latitude: number; longitude: number; accuracy: number } | null;
    }):
      | { ok: true }
      | {
          ok: false;
          severity: 'error' | 'warning';
          title: string;
          message: string;
        } => {
      if (!activeCourse || !activeSession) {
        return {
          ok: false,
          severity: 'error',
          title: 'BELUM MEMUAT COURSE',
          message: 'Silakan pindai Setup QR Course terlebih dahulu.',
        };
      }

      if (!sessionCanRecordCheckpoints) {
        return {
          ok: false,
          severity: 'error',
          title: 'BELUM SCAN START!',
          message:
            'Silakan scan Start QR terlebih dahulu sebelum memindai Pos Checkpoint!',
        };
      }

      if (sessionMarkedFinishedLocallyOrServer) {
        return {
          ok: false,
          severity: 'warning',
          title: 'SESI SUDAH FINISH',
          message:
            'Sesi lari Anda sudah selesai (Finished). Tidak dapat menambah pos baru.',
        };
      }

      const { checkpoint, scannedQr, coords } = params;
      const sortedCheckpoints = [...activeCourse.checkpoints].sort(
        (a, b) => a.orderIndex - b.orderIndex
      );

      // 1. Cek apakah pos ini sudah pernah tervalidasi sebelumnya
      if (effectiveValidatedCheckpointIds.includes(checkpoint.id)) {
        const nextUnvisited = sortedCheckpoints.find(
          (c) => !effectiveValidatedCheckpointIds.includes(c.id)
        );
        const nextHint = nextUnvisited
          ? ` Silakan lanjut ke Pos #${nextUnvisited.orderIndex} (${nextUnvisited.code}).`
          : ' Semua pos telah selesai, silakan menuju FINISH.';
        return {
          ok: false,
          severity: 'warning',
          title: `POS ${checkpoint.code} SUDAH TERCATAT`,
          message: `Pos ${checkpoint.code} sudah tercatat sebelumnya (tidak dihitung ganda).${nextHint}`,
        };
      }

      // 2. Cek aturan Wajib Urut (enforceOrder)
      if (activeCourse.enforceOrder) {
        const expectedCp = sortedCheckpoints.find(
          (c) => !effectiveValidatedCheckpointIds.includes(c.id)
        );
        if (expectedCp && expectedCp.id !== checkpoint.id) {
          const expectedLabel = expectedCp.name
            ? `${expectedCp.code} (${expectedCp.name})`
            : expectedCp.code;
          const scannedLabel = checkpoint.name
            ? `${checkpoint.code} (${checkpoint.name})`
            : checkpoint.code;
          return {
            ok: false,
            severity: 'error',
            title: 'URUTAN POS TIDAK SESUAI!',
            message: `Course ini wajib berurutan! Anda harus memindai Pos #${expectedCp.orderIndex} (${expectedLabel}) terlebih dahulu sebelum Pos #${checkpoint.orderIndex} (${scannedLabel}).`,
          };
        }
      }

      // 3. Evaluasi kecocokan QR dan jarak Radius GPS sesuai Metode Validasi Course
      const cleanQr = (scannedQr || '').trim();
      const upperQr = cleanQr.toUpperCase();
      const expectedCpPrefix =
        `BARAKA:CP:${activeCourse.id}:${checkpoint.code}`.toUpperCase();
      const qrMatch =
        Boolean(cleanQr) &&
        (cleanQr === checkpoint.qrSecret ||
          upperQr === expectedCpPrefix ||
          upperQr.startsWith(`${expectedCpPrefix}:`));

      const baseRadius =
        checkpoint.radiusMeters || activeCourse.defaultGpsRadiusMeters || 35;
      // Toleransi Lapangan Olahraga Orienteering: Gabungkan radius pos dasar dengan separuh estimasi ketelitian akurasi HP (maksimal toleransi tambahan 25m)
      const accuracyBuffer = Math.min(25, Math.round((coords?.accuracy || 10) * 0.5));
      const allowedRadius = baseRadius + accuracyBuffer;
      const maxAcceptableAccuracy = 150;
      let distanceMeters: number | null = null;
      let accuracyOk = true;
      let gpsMatch = false;

      if (
        coords &&
        typeof coords.latitude === 'number' &&
        typeof coords.longitude === 'number' &&
        !Number.isNaN(coords.latitude) &&
        !Number.isNaN(coords.longitude)
      ) {
        distanceMeters = Math.round(
          calculateClientHaversineMeters(
            checkpoint.latitude,
            checkpoint.longitude,
            coords.latitude,
            coords.longitude
          )
        );
        accuracyOk =
          coords.accuracy === undefined ||
          coords.accuracy <= maxAcceptableAccuracy;
        gpsMatch = distanceMeters <= allowedRadius && accuracyOk;
      }

      switch (activeCourse.validationMethod) {
        case ValidationMethod.QR_ONLY:
          if (!qrMatch) {
            return {
              ok: false,
              severity: 'error',
              title: 'QR POS TIDAK COCOK!',
              message: `Kode QR yang dipindai tidak sesuai dengan Pos ${checkpoint.code}. Pastikan memindai QR resmi Pos ${checkpoint.code}.`,
            };
          }
          break;

        case ValidationMethod.QR_AND_GPS:
          if (!qrMatch) {
            return {
              ok: false,
              severity: 'error',
              title: 'QR POS TIDAK COCOK!',
              message: `Wajib QR + GPS: Kode QR yang dipindai tidak sesuai dengan Pos ${checkpoint.code}.`,
            };
          }
          if (distanceMeters === null) {
            return {
              ok: false,
              severity: 'error',
              title: 'GPS BELUM TERBACA!',
              message: `Course ini mewajibkan QR + GPS! Sinyal GPS perangkat belum aktif/terbaca. Aktifkan lokasi GPS lalu scan ulang di Pos ${checkpoint.code}.`,
            };
          }
          if (!accuracyOk) {
            return {
              ok: false,
              severity: 'error',
              title: 'AKURASI GPS RENDAH!',
              message: `Wajib QR + GPS: Akurasi GPS terlalu rendah (±${Math.round(
                coords?.accuracy || 0
              )}m, batas maksimal ${maxAcceptableAccuracy}m). Tunggu sinyal GPS stabil lalu scan ulang.`,
            };
          }
          if (!gpsMatch) {
            return {
              ok: false,
              severity: 'error',
              title: 'DI LUAR RADIUS GPS!',
              message: `Wajib QR + GPS: Kode QR cocok, tetapi posisi GPS Anda berjarak ${distanceMeters}m dari Pos ${checkpoint.code} (Radius sah: ${allowedRadius}m termasuk kompensasi satelit). Dekati titik pos lalu scan ulang!`,
            };
          }
          break;

        case ValidationMethod.GPS_AUTO:
          if (distanceMeters === null) {
            return {
              ok: false,
              severity: 'error',
              title: 'GPS BELUM TERBACA!',
              message:
                'Course ini menggunakan validasi GPS! Aktifkan lokasi GPS perangkat Anda terlebih dahulu.',
            };
          }
          if (!accuracyOk) {
            return {
              ok: false,
              severity: 'error',
              title: 'AKURASI GPS RENDAH!',
              message: `Akurasi GPS terlalu rendah (±${Math.round(
                coords?.accuracy || 0
              )}m > batas ${maxAcceptableAccuracy}m).`,
            };
          }
          if (!gpsMatch) {
            return {
              ok: false,
              severity: 'error',
              title: 'DI LUAR RADIUS GPS!',
              message: `Posisi GPS Anda berada di luar radius Pos ${checkpoint.code} (Jarak Anda: ${distanceMeters}m, Batas radius: ${allowedRadius}m). Dekati titik pos terlebih dahulu!`,
            };
          }
          break;

        case ValidationMethod.QR_OR_GPS:
          if (!qrMatch && !gpsMatch) {
            if (distanceMeters !== null && !accuracyOk) {
              return {
                ok: false,
                severity: 'error',
                title: 'QR / AKURASI GPS GAGAL!',
                message: `Kode QR tidak cocok dan akurasi GPS terlalu rendah (±${Math.round(
                  coords?.accuracy || 0
                )}m > ${maxAcceptableAccuracy}m).`,
              };
            }
            if (distanceMeters !== null) {
              return {
                ok: false,
                severity: 'error',
                title: 'DI LUAR RADIUS GPS!',
                message: `Metode QR atau GPS: Kode QR tidak cocok dan jarak GPS Anda (${distanceMeters}m) di luar radius Pos ${checkpoint.code} (Batas radius: ${allowedRadius}m).`,
              };
            }
            return {
              ok: false,
              severity: 'error',
              title: 'QR POS TIDAK COCOK!',
              message: `Kode QR tidak sesuai dengan Pos ${checkpoint.code} dan posisi GPS belum terbaca (Batas radius: ${allowedRadius}m).`,
            };
          }
          break;
      }

      return { ok: true };
    },
    [
      activeCourse,
      activeSession,
      sessionCanRecordCheckpoints,
      sessionMarkedFinishedLocallyOrServer,
      effectiveValidatedCheckpointIds,
    ]
  );

  /**
   * Validasi Instan sebelum menyimpan laporan FINISH:
   * Memastikan sudah Start, kode QR Finish sesuai Course, dan jika Course Wajib Urut (enforceOrder)
   * maka seluruh pos harus sudah selesai sebelum bisa Finish.
   */
  const validateFinishBeforeRecord = useCallback(
    (
      scannedFinishQr: string
    ):
      | { ok: true }
      | {
          ok: false;
          severity: 'error' | 'warning';
          title: string;
          message: string;
        } => {
      if (!activeCourse || !activeSession) {
        return {
          ok: false,
          severity: 'error',
          title: 'BELUM MEMUAT COURSE',
          message: 'Silakan pindai Setup QR Course terlebih dahulu.',
        };
      }

      if (!sessionCanRecordCheckpoints) {
        return {
          ok: false,
          severity: 'error',
          title: 'BELUM SCAN START!',
          message:
            'Anda belum melakukan Scan Start QR! Silakan scan Start QR terlebih dahulu.',
        };
      }

      const clean = scannedFinishQr.trim();
      const upper = clean.toUpperCase();
      const expectedFinishCode =
        `BARAKA:FINISH:${activeCourse.id}`.toUpperCase();

      if (upper !== expectedFinishCode && clean !== activeCourse.finishQrCode) {
        return {
          ok: false,
          severity: 'error',
          title: 'BUKAN QR FINISH!',
          message: `QR yang dipindai bukan kode FINISH untuk "${activeCourse.name}".`,
        };
      }

      if (
        activeCourse.enforceOrder &&
        effectiveValidatedCheckpointIds.length < activeCourse.checkpoints.length
      ) {
        const sortedCheckpoints = [...activeCourse.checkpoints].sort(
          (a, b) => a.orderIndex - b.orderIndex
        );
        const missingCp = sortedCheckpoints.find(
          (c) => !effectiveValidatedCheckpointIds.includes(c.id)
        );
        const missingLabel = missingCp
          ? `Pos #${missingCp.orderIndex} (${missingCp.code})`
          : 'seluruh pos';
        return {
          ok: false,
          severity: 'error',
          title: 'POS BELUM LENGKAP!',
          message: `Course ini wajib berurutan (${effectiveValidatedCheckpointIds.length}/${activeCourse.checkpoints.length} pos selesai). Selesaikan ${missingLabel} terlebih dahulu sebelum Scan Finish!`,
        };
      }

      return { ok: true };
    },
    [
      activeCourse,
      activeSession,
      sessionCanRecordCheckpoints,
      effectiveValidatedCheckpointIds,
    ]
  );

  const forceNewSessionRef = useRef<boolean>(false);

  // Fungsi Load Course langsung dari nilai QR yang dipindai
  const executeLoadCourseByQr = useCallback(
    async (qrValue: string) => {
      if (!token) return;
      const trimmed = qrValue.trim();
      if (!trimmed) return;

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
        setRelayStatus(data.relayStatus || null);
        setRelayParentInput(data.session?.relayParentTeamName || '');
        setRelayLegInput(data.session?.relayLegIndex || 1);
        setRelayMembersInput(data.session?.relayMemberNames || '');
        setIsEditingRelayIdentity(false);
        setConfirmingLeaveCourse(false);
        const attemptNum = data.session?.attemptNumber || 1;
        const attemptLabel =
          attemptNum > 1
            ? ` (Percobaan #${attemptNum} / Re-run — Data sebelumnya tetap tersimpan)`
            : '';
        triggerRunnerFeedback('success');
        showRunnerToast(
          'success',
          '🗺️ COURSE DIMUAT!',
          data.course?.raceMode === CourseRaceMode.RELAY
            ? `${data.course.name}${attemptLabel} (Mode Relay). Isi Tim Induk & Urutan Sub-Team terlebih dahulu!`
            : `${data.course.name}${attemptLabel} siap. Silakan Scan Start QR saat siap lari.`
        );
        setFeedbackBanner({
          type: 'success',
          text:
            data.course?.raceMode === CourseRaceMode.RELAY
              ? `Course Relay "${data.course.name}"${attemptLabel} berhasil dimuat! Silakan isi Nama Tim Induk & Urutan Sub-Team sebelum Scan Start.`
              : `Course "${data.course.name}"${attemptLabel} berhasil dimuat! Silakan tekan tombol SCAN START QR saat siap memulai.`,
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

          // Khusus Mode Relay: Pastikan Identitas Sub-Team sudah diisi dan Giliran Estafet tidak terkunci
          if (activeCourse.raceMode === CourseRaceMode.RELAY) {
            if (!activeSession.relayParentTeamKey || !activeSession.relayLegIndex) {
              triggerRunnerFeedback('error');
              const msg =
                'Mode Relay aktif! Harap simpan Nama Tim Induk & Urutan Sub-Team Anda terlebih dahulu sebelum Scan Start QR.';
              setFeedbackBanner({ type: 'error', text: msg });
              showRunnerToast('error', 'ISI TIM INDUK DULU', msg);
              return;
            }
            if (relayStatus?.isRelayLocked) {
              triggerRunnerFeedback('error');
              const msg =
                relayStatus.lockReason ||
                'Giliran Estafet masih terkunci menunggu Sub-Team sebelumnya Finish/DNF atau Override Panitia.';
              setFeedbackBanner({ type: 'error', text: msg });
              showRunnerToast('error', 'GILIRAN ESTAFET TERKUNCI', msg);
              return;
            }
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
          const finishCheck = validateFinishBeforeRecord(scanned);
          if (!finishCheck.ok) {
            triggerRunnerFeedback('error');
            setFeedbackBanner({
              type: finishCheck.severity,
              text: finishCheck.message,
            });
            showRunnerToast(
              finishCheck.severity,
              finishCheck.title,
              finishCheck.message
            );
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
              upperScanned === c.code.toUpperCase() ||
              scanned === c.qrSecret
          );
        }

        if (!matchedCp) {
          triggerRunnerFeedback('error');
          const msg = `QR Code (${scanned}) tidak cocok dengan pos mana pun pada Course ini.`;
          setFeedbackBanner({ type: 'error', text: msg });
          showRunnerToast('error', 'QR POS TIDAK DIKENALI', msg);
          return;
        }

        // Jika Course membutuhkan GPS (QR_AND_GPS / GPS_AUTO / QR_OR_GPS), ambil GPS otomatis di latar belakang
        let coordsToUse = gpsCoords;
        if (
          activeCourse.validationMethod === ValidationMethod.QR_AND_GPS ||
          activeCourse.validationMethod === ValidationMethod.GPS_AUTO ||
          activeCourse.validationMethod === ValidationMethod.QR_OR_GPS
        ) {
          coordsToUse = await getQuickGpsCoordinates();
        }

        // VALIDASI INSTAN SEBELUM MENYIMPAN (Urutan Pos, Duplikat, Radius GPS, Kecocokan QR)
        const cpCheck = validateCheckpointBeforeRecord({
          checkpoint: matchedCp,
          scannedQr: scanned,
          coords: coordsToUse,
        });

        if (!cpCheck.ok) {
          triggerRunnerFeedback('error');
          setFeedbackBanner({
            type: cpCheck.severity,
            text: cpCheck.message,
          });
          showRunnerToast(cpCheck.severity, cpCheck.title, cpCheck.message);
          return;
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
      relayStatus,
      sessionCanRecordCheckpoints,
      showRunnerToast,
      validateCheckpointBeforeRecord,
      validateFinishBeforeRecord,
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

    if (regPin.trim().length < 6) {
      setFeedbackBanner({
        type: 'error',
        text: 'Password Tim minimal 6 karakter (huruf, angka, tanda baca, simbol, atau kombinasinya).',
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
          password: regPin.trim(),
          pin: regPin.trim(),
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
        text: `Registrasi berhasil! Tim: ${data.participant.teamName} (Pendaftar: ${data.participant.name}). Silakan tekan tombol SCAN SETUP QR.`,
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
          teamName: loginIdentity.trim(),
          bibOrName: loginIdentity.trim(),
          password: loginPin.trim(),
          pin: loginPin.trim(),
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
        setRelayStatus(data.relayStatus || null);
        setRelayParentInput(data.latestSession?.relayParentTeamName || '');
        setRelayLegInput(data.latestSession?.relayLegIndex || 1);
        setRelayMembersInput(data.latestSession?.relayMemberNames || '');
        setFeedbackBanner({
          type: 'success',
          text: `Selamat datang kembali, Tim ${data.participant.teamName}! Sesi Course "${data.activeCourse.name}" Anda siap dilanjutkan.`,
        });
      } else {
        setRelayStatus(null);
        setFeedbackBanner({
          type: 'success',
          text: `Login berhasil: Tim ${data.participant.teamName} (Pendaftar: ${data.participant.name}).`,
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: 'Gagal terhubung ke server untuk login.',
      });
    }
  }

  // Peserta: Ganti Password Tim Sendiri
  async function handleChangeParticipantPassword() {
    setPartPassError(null);
    if (!partPassCurrent.trim()) {
      setPartPassError('Password saat ini wajib diisi.');
      return;
    }
    if (partPassNew.trim().length < 6) {
      setPartPassError('Password baru minimal 6 karakter (bebas kombinasi huruf, angka, atau simbol).');
      return;
    }
    if (partPassNew.trim() !== partPassConfirm.trim()) {
      setPartPassError('Konfirmasi Password baru tidak sesuai.');
      return;
    }
    setPartPassLoading(true);
    try {
      const res = await fetch('/api/participant/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: partPassCurrent.trim(),
          newPassword: partPassNew.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPartPassError(data.error || 'Gagal mengubah password tim.');
        setPartPassLoading(false);
        return;
      }
      setIsChangeParticipantPasswordOpen(false);
      setPartPassCurrent('');
      setPartPassNew('');
      setPartPassConfirm('');
      if (data.participant) {
        setParticipant(data.participant);
      }
      setFeedbackBanner({
        type: 'success',
        text: 'Password tim berhasil diperbarui!',
      });
    } catch {
      setPartPassError('Kesalahan koneksi saat mengubah password tim.');
    } finally {
      setPartPassLoading(false);
    }
  }

  function handleLogout() {
    // Jika peserta sedang berada dalam sesi lomba yang aktif atau sudah scan Start tapi belum Finish
    if (sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer) {
      setShowDnfLogoutModal(true);
      return;
    }
    executeCleanLogout();
  }

  function executeCleanLogout() {
    setToken(null);
    setParticipant(null);
    setActiveCourse(null);
    setActiveSession(null);
    setRelayStatus(null);
    setConfirmingLeaveCourse(false);
    clearPersistedParticipantState();
    setFeedbackBanner(null);
    onLogout?.();
  }

  async function handleConfirmDnfLogout() {
    if (!activeSession) {
      setShowDnfLogoutModal(false);
      executeCleanLogout();
      return;
    }
    setIsSubmittingDnf(true);
    try {
      if (token) {
        await fetch('/api/participant/abandon-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId: activeSession.id,
            reason: 'Peserta menekan Keluar saat lomba berjalan (DNF Resmi)',
          }),
        }).catch(() => {});
      }
    } finally {
      setIsSubmittingDnf(false);
      setShowDnfLogoutModal(false);
      executeCleanLogout();
    }
  }

  async function handleRestartFromBeginning() {
    // JIKA SESI SEDANG BERJALAN AKTIF & BELUM FINISH:
    // Wajib tutup sesi saat ini di server sebagai DNF resmi sebelum peserta diizinkan scan Setup QR baru!
    if (sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer && activeSession && token) {
      try {
        await fetch('/api/participant/abandon-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId: activeSession.id,
            reason: 'Peserta membatalkan sesi berjalan & meminta Mulai Ulang (DNF Resmi)',
          }),
        }).catch(() => {});
      } catch {
        // Abaikan jika offline, server tetap mencatat saat sinkronisasi
      }
    }

    // Pastikan semua laporan lokal disinkronkan ke server
    if (activeSession && token && isEffectivelyOnline) {
      await triggerSyncQueue(true);
    }

    forceNewSessionRef.current = true;
    setActiveCourse(null);
    setActiveSession(null);
    setLocalReports([]);
    setConfirmingLeaveCourse(false);
    savePersistedParticipantState({
      token,
      participant,
      activeCourse: null,
      activeSession: null,
      simulatedOffline,
    });
    setFeedbackBanner({
      type: 'warning',
      text: sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer
        ? 'Sesi sebelumnya resmi ditutup sebagai DNF (Gugur). Silakan Scan Setup QR dari panitia untuk memulai lomba baru!'
        : 'Sesi sebelumnya tersimpan aman. Silakan Scan Setup QR untuk memulai Course baru!',
    });
  }

  function handleConfirmLeaveCourse() {
    void handleRestartFromBeginning();
  }

  function handleReadDeviceGps() {
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
        const coords = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        };
        updateRealtimeGpsCoords(coords, true);

        // Jika sesi sedang berjalan dan jeda kirim ke server >= 15 detik, sekalian perbarui titik di radar panitia
        if (
          isSessionActivelyRunning &&
          token &&
          participant &&
          activeSession &&
          Date.now() - lastPeriodicAttemptMsRef.current >= 15000
        ) {
          lastPeriodicAttemptMsRef.current = Date.now();
          const payload: PendingLocationPayload = {
            sessionId: activeSession.id,
            participantId: participant.id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyMeters: coords.accuracy,
            measuredAt: new Date(pos.timestamp || Date.now()).toISOString(),
          };
          void sendLastLocationToServer({
            token,
            payload,
            isOfflineSimulated: simulatedOffline,
          }).then((res) => {
            if (res.lastLocation) {
              setActiveSession((prev) =>
                prev ? { ...prev, lastLocation: res.lastLocation } : prev
              );
            }
          });
        }
      },
      (err) => {
        setIsReadingGps(false);
        setFeedbackBanner({
          type: 'warning',
          text: `Gagal membaca GPS perangkat (${err.message}). Pastikan izin lokasi (GPS) browser telah diaktifkan dan berada di area terbuka.`,
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

    ctx.fillStyle = '#051224';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ff6b00';
    ctx.fillRect(0, 0, canvas.width, 8);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('ORIENTRA — BUKTI CADANGAN PESERTA', 32, 48);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(
      `Tim ${participant.teamName} (${participant.name})`,
      32,
      90
    );

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Course: ${activeCourse.name}`, 32, 128);
    ctx.fillText(
      activeSession.relayParentTeamName
        ? `Tim Induk (Relay): ${activeSession.relayParentTeamName} • Sub-Team #${activeSession.relayLegIndex || '?'}`
        : `Lokasi: ${activeCourse.locationName || '-'} (${activeCourse.date})`,
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
    const safeTeamSlug =
      participant.teamName.replace(/[^a-zA-Z0-9-_]/g, '_') || 'Peserta';
    a.download = `Bukti-Orientra-${safeTeamSlug}.png`;
    a.click();
  }

  const pendingSyncCount = localReports.filter(
    (r) =>
      r.syncStatus === SyncStatus.SAVED_LOCAL ||
      r.syncStatus === SyncStatus.PENDING_SYNC ||
      r.syncStatus === SyncStatus.SENDING
  ).length;

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

    let netScore = Math.max(0, grossScore - penaltyPoints);
    if (activeSession.isDnf && activeCourse.raceMode === CourseRaceMode.RELAY) {
      const dnfMode = activeCourse.relayDnfScoringMode || RelayDnfScoringMode.ZERO;
      if (dnfMode === RelayDnfScoringMode.ZERO) {
        penaltyPoints = grossScore;
        netScore = 0;
      } else {
        const extraPenalty = Math.max(0, Number(activeCourse.relayDnfPenaltyPoints) || 0);
        penaltyPoints += extraPenalty;
        netScore = Math.max(0, grossScore - penaltyPoints);
      }
    }
    return {
      grossScore,
      overtimeMinutes,
      penaltyPoints,
      netScore,
      isOvertime: overtimeMinutes > 0,
    };
  }, [activeCourse, activeSession, liveStopwatchSeconds]);

  // Hitung Sisa Waktu Mundur (Countdown) jika Course memiliki batas durasi (durationMinutes > 0)
  const remainingTimeInfo = useMemo(() => {
    const limitMin = Number(activeCourse?.durationMinutes) || 0;
    if (!activeCourse || limitMin <= 0 || liveStopwatchSeconds === undefined) {
      return null;
    }
    const limitSec = limitMin * 60;
    const diffSec = limitSec - liveStopwatchSeconds;
    const isOver = diffSec < 0;
    const absSec = Math.abs(diffSec);
    const m = Math.floor(absSec / 60);
    const s = absSec % 60;
    const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return {
      isOver,
      isWarning: !isOver && diffSec <= 300, // <= 5 menit terakhir
      diffSec,
      formatted,
    };
  }, [activeCourse, liveStopwatchSeconds]);

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-12">
      {/* ====================================================================
          FULL-SCREEN QR SCANNER OVERLAY (PERSIS DESAIN REFERENSI iOrienteering)
          Langsung menutup seluruh layar HP tanpa perlu scroll!
         ==================================================================== */}
      {cameraActiveFor && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
          {/* TOP BAR GAYA iOrienteering: Nama Aplikasi di Kiri, FLASH ON & CANCEL di Kanan */}
          <div className="flex h-14 shrink-0 items-center justify-between bg-[#051224] border-b border-sky-500/30 px-4 text-white shadow-md z-20">
            <div className="flex items-center gap-2.5 truncate">
              <img
                src="/orientra-logo.jpeg"
                alt="ORIENTRA"
                className="h-7 w-7 rounded-md bg-white object-contain p-0.5 shrink-0"
              />
              <span className="text-base font-black tracking-wider text-white truncate">
                ORIENT<span className="text-amber-400">RA</span>
              </span>
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
            <div className="absolute bottom-6 left-4 right-4 z-20 flex flex-col items-center gap-2 text-center pointer-events-none">
              <div className="rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold text-slate-200 border border-white/15 backdrop-blur-sm shadow-lg">
                {!activeCourse || cameraActiveFor === 'SETUP'
                  ? 'Arahkan kotak ke Setup QR Code dari Panitia'
                  : !sessionCanRecordCheckpoints
                  ? 'Arahkan kotak ke START QR Code untuk mulai waktu'
                  : 'Arahkan kotak ke QR Pos Checkpoint atau FINISH QR'}
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

      {/* ====================================================================
          OVERLAY MODE KUNCI SAKU PENUH (POCKET SCREEN — OLED BLACKOUT 0 WATT)
          Layar dihitamkan pekat, anti-ghost-touch di saku, jam digital minimalis,
          tahan 1,5 detik untuk membuka kunci saat tiba di pos.
         ==================================================================== */}
      {isPocketLocked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black p-6 select-none touch-none text-white">
          {/* Header minimalis */}
          <div className="w-full flex items-center justify-between text-slate-500 pt-2">
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>GPS AKTIF DI SAKU</span>
            </div>
            {gpsCoords && (
              <span className="font-mono text-xs text-sky-400">
                ±{Math.round(gpsCoords.accuracy || 10)}m
              </span>
            )}
          </div>

          {/* Jam lari kontras tinggi di tengah */}
          <div className="text-center space-y-2.5 w-full max-w-sm">
            <div className="text-[11px] font-mono tracking-widest text-slate-500 uppercase">
              {activeCourse?.name || 'ORIENTRA'}
            </div>
            <div className="text-6xl sm:text-7xl font-mono font-extrabold text-amber-400 tracking-tight">
              {effectiveStartIso
                ? formatStopwatchSeconds(liveStopwatchSeconds)
                : '00:00:00'}
            </div>
            {remainingTimeInfo && (
              <div
                className={`inline-block rounded-lg px-3 py-1 text-xs font-mono font-extrabold border ${
                  remainingTimeInfo.isOver
                    ? 'bg-rose-950/60 border-rose-500/60 text-rose-300 animate-pulse'
                    : remainingTimeInfo.isWarning
                    ? 'bg-amber-950/60 border-amber-500/60 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                {remainingTimeInfo.isOver
                  ? `⚠️ LEWAT BATAS WAKTU +${remainingTimeInfo.formatted}`
                  : `⏳ Sisa Waktu: ${remainingTimeInfo.formatted}`}
              </div>
            )}
            <div className="text-sm font-semibold text-emerald-400">
              Pos: {completedCheckpointCount} / {activeCourse?.checkpoints.length || 0} Selesai • Skor: {scoreBreakdown.netScore}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Layar OLED 0-Watt • Sentuhan Terkunci di Saku
            </div>
          </div>

          {/* Tombol Tahan Buka Kunci & Langsung Scan (1-Step) atau Buka Kunci Biasa */}
          <div className="w-full max-w-xs space-y-2.5 pb-6">
            {/* Tombol 1: Tahan 1 Detik -> Langsung Buka Kamera Scanner */}
            <button
              type="button"
              onPointerDown={() => {
                let progress = 0;
                setUnlockScanHoldProgress(0);
                if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
                unlockTimerRef.current = window.setInterval(() => {
                  progress += 12.5;
                  setUnlockScanHoldProgress(progress);
                  if (progress >= 100) {
                    if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
                    setIsPocketLocked(false);
                    setUnlockScanHoldProgress(0);
                    triggerRunnerFeedback('success');
                    setCameraActiveFor('AUTO_RACE');
                  }
                }, 100);
              }}
              onPointerUp={() => {
                if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
                setUnlockScanHoldProgress(0);
              }}
              onPointerLeave={() => {
                if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
                setUnlockScanHoldProgress(0);
              }}
              className="relative w-full overflow-hidden rounded-2xl border-2 border-emerald-500/80 bg-emerald-950/70 py-4 px-4 text-center font-extrabold text-white transition active:scale-[0.98]"
            >
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500/50 transition-all duration-75"
                style={{ width: `${unlockScanHoldProgress}%` }}
              />
              <div className="relative z-10 flex items-center justify-center gap-2 text-sm">
                <Camera className="h-4 w-4 text-lime-300" />
                <span>
                  {unlockScanHoldProgress > 0
                    ? `Membuka Kamera... ${Math.round(unlockScanHoldProgress)}%`
                    : 'Tahan 1 Detik: Buka & Langsung Scan QR'}
                </span>
              </div>
            </button>

            {/* Tombol 2: Tahan 1.5 Detik -> Buka Kunci ke Layar Dashboard */}
            <button
              type="button"
              onPointerDown={() => {
                let progress = 0;
                setUnlockHoldProgress(0);
                if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
                unlockTimerRef.current = window.setInterval(() => {
                  progress += 10;
                  setUnlockHoldProgress(progress);
                  if (progress >= 100) {
                    if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
                    setIsPocketLocked(false);
                    setUnlockHoldProgress(0);
                    triggerRunnerFeedback('success');
                  }
                }, 120);
              }}
              onPointerUp={() => {
                if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
                setUnlockHoldProgress(0);
              }}
              onPointerLeave={() => {
                if (unlockTimerRef.current) clearInterval(unlockTimerRef.current);
                setUnlockHoldProgress(0);
              }}
              className="relative w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/90 py-3 px-4 text-center font-bold text-slate-300 transition active:scale-[0.98]"
            >
              {/* Progress bar pengisi tombol */}
              <div
                className="absolute inset-y-0 left-0 bg-sky-600/40 transition-all duration-75"
                style={{ width: `${unlockHoldProgress}%` }}
              />
              <div className="relative z-10 flex items-center justify-center gap-2 text-xs">
                <Unlock className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {unlockHoldProgress > 0
                    ? `Tahan... ${unlockHoldProgress}%`
                    : 'Tahan 1.5 Detik: Buka ke Layar Course / Peta'}
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* BANNER PENGAMAN OFFLINE BROWSER & OPSI PASANG IKON DI LAYAR HP */}
      <PWAInstallBanner />

      {/* PITA OTOMATIS ANTREAN OFFLINE (HANYA MUNCUL JIKA ADA DATA SCAN BELUM TERKIRIM KE SERVER) */}
      {pendingSyncCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200 shadow">
          <div className="flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>{pendingSyncCount} scan</strong> tersimpan di HP • Otomatis terkirim saat sinyal stabil
            </span>
          </div>
          <button
            type="button"
            onClick={() => triggerSyncQueue(false)}
            disabled={isSyncing}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50 shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`}
            />
            Sync
          </button>
        </div>
      )}

      {/* ====================================================================
          MODAL PERINGATAN DNF SAAT PESERTA MENEKAN KELUAR DI TENGAH LOMBA
         ==================================================================== */}
      {showDnfLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm select-none">
          <div className="w-full max-w-md rounded-2xl border-2 border-rose-500/80 bg-slate-900 p-5 shadow-2xl shadow-rose-950/70 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-rose-500/30 pb-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <AlertTriangle className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-400">
                  PERINGATAN RESMI LOMBA
                </span>
                <h3 className="text-base font-extrabold text-white">
                  Lomba Sedang Berjalan!
                </h3>
              </div>
            </div>

            <div className="rounded-xl bg-rose-950/40 border border-rose-500/30 p-3.5 space-y-2 text-xs text-rose-200">
              <p className="font-semibold text-white">
                Jika Anda memilih <span className="text-rose-400 underline decoration-rose-500">Keluar Sekarang</span>:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-rose-200/90 text-[11px] leading-relaxed">
                <li>
                  Sesi lomba ini langsung <strong>dihentikan</strong> dan Anda dinyatakan <strong>Tidak Menyelesaikan Course (DNF / Gugur)</strong>.
                </li>
                <li>
                  Stopwatch waktu lari Anda akan <strong>berhenti</strong> dan status DNF dicatat di papan klasemen panitia.
                </li>
                <li>
                  Sisa pos checkpoint tidak dapat lagi diambil untuk sesi ini.
                </li>
                <li>
                  Saat Anda login kembali nanti, Anda harus <strong>mengulang dari awal</strong> (Scan Setup QR &amp; Start QR baru, stopwatch mulai dari <strong>00:00:00</strong> sebagai attempt baru).
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDnfLogoutModal(false)}
                disabled={isSubmittingDnf}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] py-3 px-4 text-xs font-extrabold text-white shadow-lg shadow-emerald-950/50 transition cursor-pointer order-2 sm:order-1"
              >
                Lanjut Lari / Batal
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDnfLogout()}
                disabled={isSubmittingDnf}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/60 bg-rose-600/25 hover:bg-rose-600/40 active:scale-[0.98] py-3 px-4 text-xs font-bold text-rose-200 hover:text-white transition cursor-pointer order-1 sm:order-2"
              >
                {isSubmittingDnf ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Memproses...
                  </>
                ) : (
                  <>
                    <LogOut className="h-4 w-4" /> Ya, Keluar &amp; DNF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
                Login Tim
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
                  Nama Peserta Pendaftar{' '}
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
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      Nama Tim (Wajib) <span className="text-rose-400">*</span>
                    </label>
                    {regName.trim() && regTeam.trim() !== regName.trim() && (
                      <button
                        type="button"
                        onClick={() => setRegTeam(regName.trim())}
                        className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                      >
                        Peserta Individu? Pakai Nama Pendaftar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={regTeam}
                    onChange={(e) => setRegTeam(e.target.value)}
                    placeholder="Nama Tim (atau Nama Anda jika individu)"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-amber-300/90 leading-snug">
                    * Jika peserta individu, isi <strong>Nama Tim</strong> dengan <strong>Nama Peserta Pendaftar</strong>. Jika lomba <strong>Mode Relay (Estafet)</strong>, isi dengan nama unik Sub-Team Anda (contoh: <em>Garuda 1</em>); Nama Tim Induk dipilih setelah Scan Setup QR.
                  </p>
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
                  Buat Password Tim (Minimal 6 karakter){' '}
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={regPin}
                  onChange={(e) => setRegPin(e.target.value)}
                  placeholder="Contoh: orientra123"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Boleh gabungan huruf, angka, tanda baca, simbol (min. 6 karakter). Boleh sama dengan tim lain.
                </p>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition cursor-pointer"
              >
                Daftar &amp; Lanjut Scan Setup QR
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="rounded-lg bg-slate-950/90 p-3 text-xs text-slate-300 border border-slate-800">
                Masuk menggunakan <strong className="text-emerald-400">Nama Tim</strong> dan{' '}
                <strong className="text-emerald-400">Password</strong> Anda. Jika Anda peserta individu, masukkan nama Anda pada kolom Nama Tim.
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nama Tim <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ketik Nama Tim (atau Nama Anda jika individu)"
                  value={loginIdentity}
                  onChange={(e) => setLoginIdentity(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password Tim <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Masukkan Password"
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition cursor-pointer"
              >
                Masuk Peserta
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          {/* ==================================================================
              LANGKAH 2: LOAD COURSE (HANYA MUNCUL JIKA BELUM MASUK KE COURSE!)
              Dilengkapi Tombol Besar Scan Kamera Layar Penuh
             ================================================================== */}
          {!activeCourse || !activeSession ? (
            <div className="rounded-xl border border-emerald-500/40 bg-slate-900/90 p-5 space-y-4">
              <div className="text-center space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Langkah 2 — Tim: {participant.teamName}
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
            </div>
          ) : (
            /* ==================================================================
               TAMPILAN UTAMA PELARI: KOKPIT ATAS TERKUNCI (STICKY) SAAT DI-SCROLL!
               ================================================================== */
            <>
              {/* ==============================================================
                  PANEL KOKPIT LARI & TOMBOL SCAN QR (TERKUNCI DI ATAS / STICKY)
                  Saat peserta scroll ke bawah, Stopwatch & Tombol Scan QR tetap
                  menempel di bagian atas layar!
                 ============================================================== */}
              <div className="sticky top-0 z-30 rounded-2xl border border-slate-700/90 bg-slate-900/95 backdrop-blur-md p-2.5 sm:p-3 space-y-2 shadow-2xl shadow-black/80">
                {/* BARIS 1: LOGO ORIENTRA + TULISAN DIPERKECIL (KIRI) | STOPWATCH & COUNTDOWN (TENGAH) | KUNCI LAYAR KOTAK SEUKURAN LOGO (KANAN) */}
                <div className="flex items-center justify-between gap-2">
                  {/* Kiri: Kotak Putih Logo ORIENTRA + Tulisan ORIENTRA (Diperkecil & Rapi) */}
                  <div
                    className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-lg bg-white p-0.5 shadow-md border border-slate-200/80 flex flex-col items-center justify-center shrink-0 select-none"
                    title="ORIENTRA — Digital Orienteering & Race Platform"
                  >
                    <img
                      src="/orientra-logo.jpeg"
                      alt="ORIENTRA"
                      className="h-6 w-6 sm:h-7 sm:w-7 object-contain"
                    />
                    <span className="text-[6.5px] sm:text-[7.5px] font-black tracking-tighter leading-none mt-0.5 text-slate-900">
                      ORIENT<span className="text-orange-600">RA</span>
                    </span>
                  </div>

                  {/* Tengah: Timer Besar + Sisa Waktu */}
                  <div
                    className={`flex-1 rounded-xl border py-1 px-2 text-center flex flex-col items-center justify-center min-w-0 ${
                      scoreBreakdown.isOvertime
                        ? 'border-rose-500/50 bg-rose-950/30'
                        : 'border-slate-800/90 bg-slate-950/90'
                    }`}
                  >
                    <div
                      className={`text-2xl sm:text-4xl font-mono font-extrabold tracking-wider leading-none ${
                        scoreBreakdown.isOvertime
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {effectiveStartIso
                        ? formatStopwatchSeconds(liveStopwatchSeconds)
                        : '00:00:00'}
                    </div>
                    {remainingTimeInfo ? (
                      <div
                        className={`text-[11px] sm:text-xs font-mono font-bold leading-tight mt-0.5 ${
                          remainingTimeInfo.isOver
                            ? 'text-rose-300 animate-pulse'
                            : remainingTimeInfo.isWarning
                            ? 'text-amber-300'
                            : 'text-amber-300/90'
                        }`}
                      >
                        {remainingTimeInfo.isOver
                          ? `Lewat +${remainingTimeInfo.formatted}`
                          : `Sisa ${remainingTimeInfo.formatted}`}
                      </div>
                    ) : (
                      <div className="text-[10px] font-mono text-slate-400 leading-tight mt-0.5">
                        {sessionMarkedFinishedLocallyOrServer
                          ? 'Lomba Selesai'
                          : sessionCanRecordCheckpoints
                          ? 'Sedang Lari'
                          : 'Siap Start'}
                      </div>
                    )}
                  </div>

                  {/* Kanan: Tombol Kotak Kunci Layar (Diperkecil Seukuran Kotak Logo ORIENTRA) */}
                  <button
                    type="button"
                    onClick={() => setIsPocketLocked(true)}
                    className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-lg border border-sky-400/50 bg-sky-500/25 hover:bg-sky-500/35 active:scale-[0.97] p-0.5 flex flex-col items-center justify-center transition cursor-pointer shadow-md shrink-0"
                    title="Mode Saku / Kunci Layar Hitam (Hemat Baterai)"
                  >
                    <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-300 shrink-0" />
                    <span className="text-[7.5px] sm:text-[8.5px] font-extrabold text-white leading-none mt-0.5 text-center">
                      Kunci
                      <br />
                      Layar
                    </span>
                  </button>
                </div>

                {/* BARIS 2: STRIP STATUS TIPIS 1 BARIS (Tim • Course | Pos | Skor | Refresh) */}
                <div className="flex items-center justify-between gap-1.5 rounded-lg bg-slate-950/80 border border-slate-800/90 px-2.5 py-1 text-[11px] sm:text-xs">
                  <div className="min-w-0 flex-1 truncate text-slate-300 font-medium">
                    <span className="text-slate-400">Tim:</span>{' '}
                    <span className="font-bold text-white">{participant.teamName}</span>
                    {activeCourse.raceMode === CourseRaceMode.RELAY &&
                    activeSession.relayParentTeamName
                      ? ` (${activeSession.relayParentTeamName} #${activeSession.relayLegIndex || '?'})`
                      : ''}
                    {' • '}
                    <span className="font-semibold text-slate-200">{activeCourse.name}</span>
                    {' | '}
                    <span className="text-slate-400">Pos:</span>{' '}
                    <span className="font-extrabold text-emerald-400">
                      {completedCheckpointCount}/{activeCourse.checkpoints.length}
                    </span>
                    {' | '}
                    <span className="text-slate-400">Skor:</span>{' '}
                    <span className="font-extrabold text-white">
                      {scoreBreakdown.netScore}
                    </span>
                    {scoreBreakdown.penaltyPoints > 0 && (
                      <span className="text-[10px] font-mono text-rose-400 ml-1">
                        (-{scoreBreakdown.penaltyPoints})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {activeSession.attemptNumber &&
                      activeSession.attemptNumber > 1 && (
                        <span className="rounded px-1 py-0.5 text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          #{activeSession.attemptNumber}
                        </span>
                      )}
                    <button
                      type="button"
                      onClick={() => {
                        void syncLatestCourseAndSession();
                        setFeedbackBanner({
                          type: 'success',
                          text: 'Menyegarkan pengaturan Course & status sesi terbaru dari server...',
                        });
                      }}
                      className="rounded p-1 bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                      title="Segarkan Pengaturan Course dari Panitia"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* BARIS 3: TOMBOL SCAN QR HIJAU (+25% LEBIH BESAR DARI SEBELUMNYA, TANPA SUBTITLE) */}
                {!sessionCanRecordCheckpoints ? (
                  activeCourse.raceMode === CourseRaceMode.RELAY &&
                  (!activeSession.relayParentTeamKey ||
                    !activeSession.relayLegIndex ||
                    Boolean(relayStatus?.isRelayLocked)) ? (
                    <button
                      type="button"
                      onClick={() => {
                        triggerRunnerFeedback('error');
                        const lockMsg =
                          !activeSession.relayParentTeamKey ||
                          !activeSession.relayLegIndex
                            ? 'Lengkapi Nama Tim Induk & Urutan Sub-Team terlebih dahulu di kartu Mode Relay di bawah.'
                            : relayStatus?.lockReason ||
                              'Giliran Estafet belum terbuka. Tunggu Sub-Team sebelumnya Finish/DNF atau hubungi Panitia.';
                        setFeedbackBanner({ type: 'warning', text: lockMsg });
                        showRunnerToast(
                          'warning',
                          !activeSession.relayParentTeamKey
                            ? 'ISI TIM INDUK DULU'
                            : 'GILIRAN ESTAFET TERKUNCI',
                          lockMsg
                        );
                        void syncLatestCourseAndSession();
                      }}
                      className="w-full min-h-[96px] sm:min-h-[106px] flex items-center justify-center gap-3.5 rounded-xl bg-slate-800 border-2 border-amber-500/50 py-7 sm:py-8 px-6 text-amber-200 shadow-lg transition cursor-not-allowed"
                    >
                      <Lock className="h-8 w-8 text-amber-400 shrink-0" />
                      <div className="text-left">
                        <div className="text-base sm:text-lg font-extrabold tracking-wide uppercase">
                          {!activeSession.relayParentTeamKey ||
                          !activeSession.relayLegIndex
                            ? 'ISI IDENTITAS SUB-TEAM DI BAWAH'
                            : `MENUNGGU SUB-TEAM #${relayStatus?.waitingOnLeg || (activeSession.relayLegIndex - 1)}`}
                        </div>
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCameraActiveFor('START')}
                      className="w-full min-h-[96px] sm:min-h-[106px] flex items-center justify-center gap-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] py-7 sm:py-8 px-6 text-white shadow-lg shadow-emerald-950/80 transition cursor-pointer border-2 border-emerald-400/60"
                    >
                      <Play className="h-10 w-10 sm:h-11 sm:w-11 fill-current shrink-0" />
                      <span className="text-xl sm:text-3xl font-black tracking-wide uppercase leading-none">
                        SCAN START QR
                      </span>
                    </button>
                  )
                ) : !sessionMarkedFinishedLocallyOrServer ? (
                  <button
                    type="button"
                    onClick={() => setCameraActiveFor('AUTO_RACE')}
                    className="w-full min-h-[96px] sm:min-h-[106px] flex items-center justify-center gap-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] py-7 sm:py-8 px-6 text-white shadow-lg shadow-emerald-950/80 transition cursor-pointer border-2 border-lime-400/60"
                  >
                    <Camera className="h-10 w-10 sm:h-11 sm:w-11 shrink-0" />
                    <span className="text-xl sm:text-3xl font-black tracking-wide uppercase leading-none">
                      SCAN QR POS / FINISH
                    </span>
                  </button>
                ) : null}

                {/* BARIS 4: TAB NAVIGASI "Course | Map" TERKUNCI DI DALAM KOKPIT ATAS */}
                <div className="grid grid-cols-2 border-t border-slate-800/90 pt-1 -mx-1">
                  <button
                    type="button"
                    onClick={() => setRunnerViewTab('COURSE')}
                    className={`py-2 text-xs sm:text-sm font-bold tracking-wide transition border-b-2 cursor-pointer ${
                      runnerViewTab === 'COURSE'
                        ? 'border-amber-500 text-white bg-slate-950/60 rounded-t-lg'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Course ({completedCheckpointCount}/
                    {activeCourse.checkpoints.length})
                  </button>

                  {activeCourse.allowParticipantMapVisibility !== false ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRunnerViewTab('MAP');
                        void getQuickGpsCoordinates();
                      }}
                      className={`py-2 text-xs sm:text-sm font-bold tracking-wide transition border-b-2 cursor-pointer ${
                        runnerViewTab === 'MAP'
                          ? 'border-amber-500 text-amber-400 bg-slate-950/60 rounded-t-lg'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Map
                    </button>
                  ) : (
                    <div
                      className="py-2 text-center text-[11px] font-medium text-slate-500 border-b-2 border-transparent select-none"
                      title="Dinonaktifkan oleh Organizer untuk kompetisi navigasi murni"
                    >
                      Map (Nonaktif)
                    </div>
                  )}
                </div>
              </div>

              {/* ==============================================================
                  KONTEN BAWAH YANG BISA DI-SCROLL BEBAS OLEH PESERTA
                  (Sementara Tombol Scan QR & Stopwatch Tetap Terkunci di Atas)
                 ============================================================== */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 space-y-4 shadow-xl">
                {/* KARTU SELESAI LOMBA / DNF (MUNCUL SAAT SUDAH FINISH ATAU DNF) */}
                {sessionMarkedFinishedLocallyOrServer && (
                  <div
                    className={`rounded-xl border p-4 text-center space-y-3 ${
                      activeSession.isDnf
                        ? 'border-rose-500/40 bg-rose-950/30'
                        : 'border-sky-500/40 bg-sky-950/30'
                    }`}
                  >
                    <div
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
                        activeSession.isDnf
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {activeSession.isDnf ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : (
                        <Flag className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-white">
                        {activeSession.isDnf
                          ? 'Sesi Dihentikan (Status: DNF)'
                          : 'Selamat! Anda Telah Menyelesaikan Lomba'}
                      </h4>
                      {activeSession.isDnf && activeSession.dnfReason && (
                        <p className="text-[11px] text-rose-200 mt-1">
                          Alasan: {activeSession.dnfReason}
                        </p>
                      )}
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
                      {(scoreBreakdown.penaltyPoints > 0 || activeSession.isDnf) && (
                        <div className="mt-2 inline-flex flex-wrap items-center justify-center gap-2 rounded-lg bg-slate-950/90 border border-rose-500/40 px-3 py-1.5 text-xs font-mono">
                          <span className="text-slate-300">
                            Poin Pos: <strong>{scoreBreakdown.grossScore}</strong>
                          </span>
                          {scoreBreakdown.penaltyPoints > 0 && (
                            <span className="text-rose-400">
                              • Penalti
                              {scoreBreakdown.overtimeMinutes > 0
                                ? ` (${scoreBreakdown.overtimeMinutes}m`
                                : ''}
                              {activeSession.isDnf
                                ? scoreBreakdown.overtimeMinutes > 0
                                  ? ' + DNF)'
                                  : ' (DNF)'
                                : scoreBreakdown.overtimeMinutes > 0
                                ? ')'
                                : ''}
                              : <strong>-{scoreBreakdown.penaltyPoints}</strong>
                            </span>
                          )}
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

                {/* KARTU MODE RELAY (ESTAFET TIM INDUK & PROGRES SUB-TEAM) */}
                {activeCourse.raceMode === CourseRaceMode.RELAY && (
                  <div className="rounded-xl border border-purple-500/40 bg-purple-950/20 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-purple-300 font-bold">
                            Mode Lomba Relay (Estafet Akumulasi)
                          </div>
                          <div className="text-xs font-bold text-white">
                            {activeSession.relayParentTeamName
                              ? `${activeSession.relayParentTeamName} • Sub-Team #${activeSession.relayLegIndex}`
                              : `Lengkapi Tim Induk & Urutan (1–${activeCourse.relaySubTeamCount || 3})`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activeSession.status === SessionStatus.NOT_STARTED &&
                          activeSession.relayParentTeamKey &&
                          !isEditingRelayIdentity && (
                            <button
                              type="button"
                              onClick={() => {
                                setRelayParentInput(activeSession.relayParentTeamName || '');
                                setRelayLegInput(activeSession.relayLegIndex || 1);
                                setRelayMembersInput(activeSession.relayMemberNames || '');
                                setIsEditingRelayIdentity(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold cursor-pointer"
                            >
                              Ubah Sub-Team
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => void syncLatestCourseAndSession()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-[11px] font-bold cursor-pointer"
                          title="Periksa status giliran Sub-Team sebelumnya"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Cek Giliran
                        </button>
                      </div>
                    </div>

                    {/* Form Pilih Tim Induk & Urutan Sub-Team (Hanya sebelum Start) */}
                    {activeSession.status === SessionStatus.NOT_STARTED &&
                      (!activeSession.relayParentTeamKey ||
                        !activeSession.relayLegIndex ||
                        isEditingRelayIdentity) && (
                        <form
                          onSubmit={handleSaveRelayProfile}
                          className="space-y-2.5 pt-2 border-t border-purple-500/25 text-xs"
                        >
                          {/* Direktori Pilihan Cepat Tim Induk yang Sudah Ada di Course Ini (Anti-Typo) */}
                          {relayStatus?.existingParentTeams &&
                            relayStatus.existingParentTeams.length > 0 && (
                              <div className="rounded-lg bg-slate-950/90 border border-purple-500/30 p-2.5 space-y-1.5">
                                <div className="text-[11px] font-bold text-purple-200 flex items-center justify-between">
                                  <span>
                                    📋 Pilih Tim Induk yang Sudah Ada (Anti-Typo untuk Sub-Team #2, #3, dst.):
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    Ketuk untuk pilih
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
                                  {relayStatus.existingParentTeams.map((pt) => {
                                    const isSelectedParent =
                                      relayParentInput.trim().toUpperCase() === pt.parentTeamKey;
                                    const firstEmptyLeg = pt.takenLegs.find(
                                      (tl) => !tl.participantTeamName || tl.isMe
                                    );
                                    return (
                                      <button
                                        key={`pick-parent-${pt.parentTeamKey}`}
                                        type="button"
                                        onClick={() => {
                                          setRelayParentInput(pt.parentTeamName);
                                          if (firstEmptyLeg) {
                                            setRelayLegInput(firstEmptyLeg.legIndex);
                                          }
                                        }}
                                        className={`w-full text-left rounded-lg border px-2.5 py-2 transition cursor-pointer ${
                                          isSelectedParent
                                            ? 'border-purple-400 bg-purple-500/20 text-white'
                                            : 'border-slate-800 bg-slate-900/90 text-slate-200 hover:border-purple-500/50'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2 font-bold text-xs">
                                          <span className="truncate text-purple-200">
                                            {pt.parentTeamName}
                                          </span>
                                          <span className="text-[10px] font-mono text-emerald-300 shrink-0">
                                            {firstEmptyLeg
                                              ? `Pilih (Saran: #${firstEmptyLeg.legIndex})`
                                              : 'Penuh'}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {pt.takenLegs.map((tl) => (
                                            <span
                                              key={`pt-${pt.parentTeamKey}-leg-${tl.legIndex}`}
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                                tl.participantTeamName && !tl.isMe
                                                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold'
                                              }`}
                                            >
                                              #{tl.legIndex}:{' '}
                                              {tl.participantTeamName
                                                ? tl.isMe
                                                  ? 'Anda'
                                                  : tl.participantTeamName
                                                : 'Kosong'}
                                            </span>
                                          ))}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                          <div>
                            <label className="block text-purple-200 font-semibold mb-1">
                              Nama Tim Induk (Ketik baru jika Anda Sub-Team #1, atau klik daftar di atas) *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Contoh: GARUDA NUSANTARA"
                              value={relayParentInput}
                              onChange={(e) => setRelayParentInput(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-purple-500/40 text-white focus:border-purple-400 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-purple-200 font-semibold mb-1">
                              Urutan Giliran Sub-Team Anda *
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from(
                                { length: Math.max(2, Number(activeCourse.relaySubTeamCount) || 3) },
                                (_, i) => i + 1
                              ).map((legNum) => {
                                const matchedParent = relayStatus?.existingParentTeams?.find(
                                  (pt) =>
                                    pt.parentTeamKey ===
                                    relayParentInput.trim().replace(/\s+/g, ' ').toUpperCase()
                                );
                                const slotInfo = matchedParent?.takenLegs.find(
                                  (tl) => tl.legIndex === legNum
                                );
                                const occupiedByOther =
                                  Boolean(slotInfo?.participantTeamName) && !slotInfo?.isMe;
                                return (
                                  <button
                                    key={`leg-pick-${legNum}`}
                                    type="button"
                                    onClick={() => setRelayLegInput(legNum)}
                                    className={`px-3 py-1.5 rounded-lg font-mono font-bold border transition cursor-pointer ${
                                      relayLegInput === legNum
                                        ? 'bg-purple-500 text-white border-purple-300 shadow'
                                        : occupiedByOther
                                        ? 'bg-slate-950/60 text-slate-500 border-slate-800'
                                        : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-purple-400'
                                    }`}
                                  >
                                    Sub-Team #{legNum}
                                    {occupiedByOther
                                      ? ` (${slotInfo?.participantTeamName})`
                                      : ''}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <label className="block text-slate-300 mb-1">
                              Nama Anggota Sub-Team (Opsional)
                            </label>
                            <input
                              type="text"
                              placeholder="Contoh: Andi, Budi"
                              value={relayMembersInput}
                              onChange={(e) => setRelayMembersInput(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:border-purple-400 focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              disabled={isSavingRelayProfile}
                              className="flex-1 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition cursor-pointer disabled:opacity-50"
                            >
                              {isSavingRelayProfile
                                ? 'Menyimpan Identitas...'
                                : 'Simpan Identitas Sub-Team'}
                            </button>
                            {isEditingRelayIdentity && (
                              <button
                                type="button"
                                onClick={() => setIsEditingRelayIdentity(false)}
                                className="px-3 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-medium cursor-pointer"
                              >
                                Batal
                              </button>
                            )}
                          </div>
                        </form>
                      )}

                    {/* Papan Progres Giliran Estafet Sub-Team #1..#N */}
                    {relayStatus && relayStatus.legs && relayStatus.legs.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        {relayStatus.legs.map((leg) => (
                          <div
                            key={`relay-leg-pill-${leg.legIndex}`}
                            className={`rounded-lg border p-2 text-[10px] font-mono ${
                              leg.isMe
                                ? 'border-purple-400 bg-purple-500/20 text-white'
                                : leg.isDnf
                                ? 'border-rose-500/40 bg-rose-950/30 text-rose-200'
                                : leg.status === SessionStatus.FINISHED
                                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                                : leg.status === SessionStatus.ACTIVE
                                ? 'border-amber-500/40 bg-amber-950/30 text-amber-200'
                                : 'border-slate-800 bg-slate-950 text-slate-400'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span>
                                #{leg.legIndex}
                                {leg.isMe ? ' (Anda)' : ''}
                              </span>
                              <span>
                                {leg.isDnf
                                  ? 'DNF'
                                  : leg.status === SessionStatus.FINISHED
                                  ? '✓ Finish'
                                  : leg.status === SessionStatus.ACTIVE
                                  ? '🏃 Lari'
                                  : leg.relayOverrideUnlocked
                                  ? '🔓 Open'
                                  : '⏳ Siap'}
                              </span>
                            </div>
                            <div className="truncate opacity-85 mt-0.5">
                              {leg.participantTeamName || 'Belum daftar'}
                            </div>
                            {leg.status === SessionStatus.FINISHED && (
                              <div className="text-amber-300 font-bold mt-0.5">
                                {leg.totalScore || 0} pts
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Peringatan Kunci Giliran Estafet */}
                    {activeSession.status === SessionStatus.NOT_STARTED &&
                      relayStatus?.isRelayLocked &&
                      activeSession.relayParentTeamKey && (
                        <div className="rounded-lg bg-amber-500/15 border border-amber-500/40 p-2.5 text-[11px] text-amber-200 flex items-start gap-2">
                          <Lock className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                          <span>{relayStatus.lockReason}</span>
                        </div>
                      )}

                    {activeSession.relayOverrideUnlocked && (
                      <div className="rounded-lg bg-sky-500/15 border border-sky-500/40 p-2 text-[11px] text-sky-200 flex items-center gap-2">
                        <Unlock className="w-3.5 h-3.5 shrink-0 text-sky-300" />
                        <span>
                          Override Panitia Aktif — Kunci giliran Sub-Team Anda telah dibuka manual.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* KONTEN UTAMA SESUAI TAB "Course | Map" DI KOKPIT ATAS */}
                <div className="pt-0.5 space-y-3">

                  {runnerViewTab === 'MAP' &&
                  activeCourse.allowParticipantMapVisibility !== false ? (
                    <ParticipantCourseMap
                      course={activeCourse}
                      validatedCheckpointIds={effectiveValidatedCheckpointIds}
                      runnerCoords={gpsCoords}
                      onRefreshGps={() => handleReadDeviceGps()}
                      isReadingGps={isReadingGps}
                    />
                  ) : (
                    /* DAFTAR RINGKAS POS CHECKPOINT (GAYA KARTU #1, #2, #3 DENGAN BENDERA) */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Daftar Pos Checkpoint
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Hijau = Sudah Tercatat
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
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
                          const isDone =
                            isServerValidated || Boolean(localCpReport);

                          return (
                            <div
                              key={cp.id}
                              className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-xs shadow-sm transition ${
                                isDone
                                  ? 'border-emerald-500/50 bg-emerald-950/35'
                                  : 'border-slate-800 bg-slate-950/95'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <Flag
                                  className={`h-4 w-4 shrink-0 ${
                                    isDone
                                      ? 'text-emerald-400 fill-emerald-400'
                                      : 'text-slate-300 fill-slate-300'
                                  }`}
                                />
                                <span className="font-mono text-xs font-bold text-slate-400 w-7">
                                  #{cp.orderIndex}
                                </span>
                                <div>
                                  <span className="font-extrabold text-sm text-white">
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
                                    ▸ Belum
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                  TOMBOL "MULAI LAGI DARI AWAL / GANTI COURSE" (DENGAN KONFIRMASI TEGAS)
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
                  <div className={`rounded-xl border p-4 text-center space-y-3 max-w-sm shadow-2xl ${
                    sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer
                      ? 'border-rose-500/80 bg-slate-900 shadow-rose-950/60'
                      : 'border-slate-700 bg-slate-900/95'
                  }`}>
                    <div className="flex items-center justify-center gap-2 text-rose-400 font-extrabold text-xs uppercase tracking-wider">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer ? 'PERINGATAN DNF RESMI' : 'KONFIRMASI MULAI AWAL'}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer ? (
                        <>
                          Lomba Anda sedang berjalan! Memilih mulai ulang sekarang akan{' '}
                          <strong className="text-rose-400 underline decoration-rose-500">
                            LANGSUNG MENCATAT SESI INI SEBAGAI DNF (GUGUR)
                          </strong>{' '}
                          di papan skor panitia.
                        </>
                      ) : (
                        <>
                          Kembali ke menu <strong>Scan Setup QR</strong> untuk memulai dari awal? Data sesi sebelumnya tetap tersimpan di server.
                        </>
                      )}
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmingLeaveCourse(false)}
                        className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                      >
                        Batal / Lanjut Lari
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmLeaveCourse}
                        className={`rounded-lg px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer transition ${
                          sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer
                            ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/60'
                            : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        {sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer
                          ? 'Ya, Setuju DNF & Mulai Baru'
                          : 'Ya, Mulai Baru'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ==================================================================
              FOOTER AKUN TIM, GANTI PASSWORD, KELUAR & SINKRONISASI (PALING BAWAH)
              Ditempatkan di bagian paling bawah agar tidak memenuhi layar atas
              dan tidak berisiko terpencet tidak sengaja saat berlari.
             ================================================================== */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 px-2 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold uppercase">
                  TIM
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-white leading-tight">
                    {participant.teamName}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-medium">
                    Pendaftar: {participant.name} • {participant.gender || 'Other'} •{' '}
                    {participant.ageGroup || 'Semua Umur'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {activeSession && (
                  <button
                    type="button"
                    onClick={() => triggerSyncQueue(false)}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                    title="Sinkronisasi Manual ke Server"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                    />
                    <span>Sync</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsChangeParticipantPasswordOpen(true);
                    setPartPassError(null);
                    setPartPassCurrent('');
                    setPartPassNew('');
                    setPartPassConfirm('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer shrink-0"
                  title="Ganti Password Tim"
                >
                  <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                  <span>Ganti Password</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 shrink-0 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" /> Keluar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Ganti Password Tim Peserta */}
      {isChangeParticipantPasswordOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Ganti Password Tim</h3>
                  <p className="text-xs text-slate-400">
                    Tim: {participant?.teamName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsChangeParticipantPasswordOpen(false);
                  setPartPassError(null);
                  setPartPassCurrent('');
                  setPartPassNew('');
                  setPartPassConfirm('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleChangeParticipantPassword();
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password Tim Saat Ini <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={partPassCurrent}
                  onChange={(e) => setPartPassCurrent(e.target.value)}
                  placeholder="Masukkan password saat ini"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password Tim Baru (Min. 6 Karakter) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={partPassNew}
                  onChange={(e) => setPartPassNew(e.target.value)}
                  placeholder="Minimal 6 karakter (bebas kombinasi)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Boleh huruf, angka, tanda baca, simbol, atau gabungan. Boleh sama dengan tim lain.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Konfirmasi Password Tim Baru <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={partPassConfirm}
                  onChange={(e) => setPartPassConfirm(e.target.value)}
                  placeholder="Ulangi password baru"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {partPassError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {partPassError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsChangeParticipantPasswordOpen(false);
                    setPartPassError(null);
                    setPartPassCurrent('');
                    setPartPassNew('');
                    setPartPassConfirm('');
                  }}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={partPassLoading}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  {partPassLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan Password Baru'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
