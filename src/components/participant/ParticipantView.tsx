import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
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
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
  Checkpoint,
  CheckpointReport,
  Course,
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
  loadPersistedParticipantState,
  loadPersistedParticipantStateFromIdbFallback,
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

// Data kode QR contoh untuk mempermudah pengujian simulasi kamera di browser
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
          <WifiOff className="h-3 w-3" /> Menunggu Sinkronisasi
        </span>
      );
    case SyncStatus.SENDING:
      return (
        <span className="inline-flex items-center gap-1 rounded bg-indigo-950/80 px-2 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-500/40">
          <RefreshCw className="h-3 w-3 animate-spin" /> Sedang Dikirim...
        </span>
      );
    case SyncStatus.ACCEPTED_SERVER:
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-950/80 px-2 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-500/40">
          <CheckCircle2 className="h-3 w-3" /> Diterima & Tervalidasi Server
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

export default function ParticipantView() {
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
  const [authTab, setAuthTab] = useState<'register' | 'login'>('register');
  const [regName, setRegName] = useState('');
  const [regTeam, setRegTeam] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPin, setRegPin] = useState('');
  const [loginIdentity, setLoginIdentity] = useState('BRK-101');
  const [loginPin, setLoginPin] = useState('1111');

  // Input QR & Checkpoint
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

  // Konfirmasi keluar Course (ditempatkan jauh dari tombol Scan)
  const [confirmingLeaveCourse, setConfirmingLeaveCourse] = useState(false);

  // Pelacakan lokasi berkala (~5 menit) berjalan di latar belakang tanpa menampilkan panel teknis di layar peserta
  const lastPeriodicAttemptMsRef = useRef<number>(0);

  // Kamera QR Scanner
  const [cameraActiveFor, setCameraActiveFor] = useState<
    null | 'SETUP' | 'START' | 'CHECKPOINT' | 'FINISH'
  >(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Daftar laporan lokal & status antrean
  const [localReports, setLocalReports] = useState<CheckpointReport[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const isEffectivelyOnline = browserOnline && !simulatedOffline;

  // Live stopwatch tick (tetap akurat dari waktu Start asli walaupun tab pernah ditutup)
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Pemulihan otomatis dari IndexedDB jika localStorage kosong / terhapus oleh browser HP
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

  // Pilih checkpoint pertama secara default ketika course dimuat
  useEffect(() => {
    if (activeCourse && activeCourse.checkpoints.length > 0 && !selectedCheckpointId) {
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

  // Fungsi memicu sinkronisasi antrean laporan checkpoint ke server
  const triggerSyncQueue = useCallback(
    async (showSilentIfEmpty = true) => {
      if (!activeSession || !token) return;
      setIsSyncing(true);
      const outcome = await syncPendingReportsWithServer({
        sessionId: activeSession.id,
        token,
        isOfflineSimulated: simulatedOffline,
        onStatusUpdate: (updated) => setLocalReports(updated),
      });
      setIsSyncing(false);

      if (outcome.updatedSession) {
        setActiveSession(outcome.updatedSession);
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
        } else {
          setFeedbackBanner({
            type: 'success',
            text: `Sinkronisasi berhasil! ${outcome.syncedCount} laporan telah diterima dan divalidasi resmi oleh server.`,
          });
        }
      } else if (!showSilentIfEmpty) {
        setFeedbackBanner({
          type: 'success',
          text: 'Semua laporan di perangkat sudah tersinkronisasi dengan server.',
        });
      }
    },
    [activeSession, token, simulatedOffline]
  );

  // ==========================================================================
  // PELAPORAN POSISI GPS TERAKHIR (~5 MENIT) SECARA OTOMATIS DI LATAR BELAKANG
  // (Tanpa memperlihatkan panel info teknis di layar peserta sesuai hasil diskusi)
  // ==========================================================================

  const hasLocalStartReport = localReports.some(
    (r) => r.reportType === 'START' && r.syncStatus !== SyncStatus.REJECTED_SERVER
  );
  const hasLocalFinishReport = localReports.some(
    (r) => r.reportType === 'FINISH' && r.syncStatus !== SyncStatus.REJECTED_SERVER
  );
  const sessionCanRecordCheckpoints =
    activeSession?.status === SessionStatus.ACTIVE || hasLocalStartReport;
  const sessionMarkedFinishedLocallyOrServer =
    activeSession?.status === SessionStatus.FINISHED || hasLocalFinishReport;

  const isSessionActivelyRunning =
    sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer;

  // Pemeriksa apakah suatu kode QR adalah Setup QR (untuk menangani Kondisi A & Kondisi B)
  const checkAccidentalSetupQrScan = useCallback(
    (scannedValue: string): boolean => {
      const clean = scannedValue.trim();
      if (!clean) return false;
      const isSetupQr =
        clean.startsWith('BARAKA:SETUP:') ||
        (activeCourse !== null && clean === activeCourse.setupQrCode);

      if (!isSetupQr) return false;

      if (!sessionCanRecordCheckpoints) {
        // KONDISI A: Sudah scan Setup QR (sudah masuk Course), tapi BELUM scan Start QR
        setFeedbackBanner({
          type: 'warning',
          text: 'Anda sudah scan Setup, silakan scan Start.',
        });
      } else {
        // KONDISI B: Sudah scan Start QR / sesi sedang berjalan aktif
        setFeedbackBanner({
          type: 'error',
          text: 'Ditolak: Silakan scan Check Point atau Finish.',
        });
      }
      return true;
    },
    [activeCourse, sessionCanRecordCheckpoints]
  );

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
        // Berjalan hening di latar belakang tanpa mengganggu layar peserta
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

  // Pantau perubahan koneksi internet (auto-retry saat koneksi kembali pulih)
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
  }, [isEffectivelyOnline, activeSession, token, localReports, triggerSyncQueue]);

  // Sinkronisasi otomatis setiap kali layar HP menyala kembali / tab dibuka kembali
  useEffect(() => {
    const handleVisibilityResume = () => {
      if (document.visibilityState === 'visible' && isEffectivelyOnline && activeSession && token) {
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

  // Pengaman cegah tutup tab tidak sengaja saat sesi sedang berjalan aktif atau masih ada antrean lokal
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

  // Kamera Pemindai QR
  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanTimer: number | null = null;

    async function startCamera() {
      if (!cameraActiveFor) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
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

        if (BarcodeDetectorClass) {
          const detector = new BarcodeDetectorClass({ formats: ['qr_code'] });
          scanTimer = window.setInterval(async () => {
            if (!videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0 && codes[0].rawValue) {
                const scanned = codes[0].rawValue.trim();
                setCameraActiveFor(null);

                // Jika peserta sudah di dalam Course namun tidak sengaja men-scan Setup QR
                if (
                  cameraActiveFor !== 'SETUP' &&
                  checkAccidentalSetupQrScan(scanned)
                ) {
                  return;
                }

                if (cameraActiveFor === 'SETUP') setSetupQrInput(scanned);
                if (cameraActiveFor === 'START') setStartQrInput(scanned);
                if (cameraActiveFor === 'CHECKPOINT') setCheckpointQrInput(scanned);
                if (cameraActiveFor === 'FINISH') setFinishQrInput(scanned);

                setFeedbackBanner({
                  type: 'success',
                  text: `QR Code berhasil terbaca kamera: ${scanned}`,
                });
              }
            } catch {
              // Abaikan frame yang gagal dibaca
            }
          }, 500);
        }
      } catch {
        setFeedbackBanner({
          type: 'warning',
          text: 'Kamera tidak dapat diakses pada perangkat ini. Silakan masukkan atau pindai QR Code.',
        });
        setCameraActiveFor(null);
      }
    }

    startCamera();

    return () => {
      if (scanTimer) window.clearInterval(scanTimer);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraActiveFor, checkAccidentalSetupQrScan]);

  // ==========================================================================
  // HANDLER 1: REGISTRASI (NAMA TIM WAJIB) & LOGIN PESERTA
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
          phone: regPhone.trim(),
          pin: regPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackBanner({ type: 'error', text: data.error || 'Registrasi gagal.' });
        return;
      }
      setToken(data.token);
      setParticipant(data.participant);
      setFeedbackBanner({
        type: 'success',
        text: `Registrasi berhasil! Nomor Peserta (BIB) Anda adalah ${data.participant.bibNumber} (Tim: ${data.participant.teamName}). Silakan pindai Setup QR dari panitia.`,
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
      const res = await fetch('/api/participant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bibOrName: loginIdentity,
          pin: loginPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackBanner({ type: 'error', text: data.error || 'Login gagal.' });
        return;
      }
      setToken(data.token);
      setParticipant(data.participant);
      if (data.activeCourse && data.latestSession) {
        setActiveCourse(data.activeCourse);
        setActiveSession(data.latestSession);
        setFeedbackBanner({
          type: 'success',
          text: `Selamat datang kembali, ${data.participant.name} (${data.participant.teamName})! Sesi Course "${data.activeCourse.name}" Anda otomatis dipulihkan.`,
        });
      } else {
        setFeedbackBanner({
          type: 'success',
          text: `Selamat datang kembali, ${data.participant.name} — Tim ${data.participant.teamName} (${data.participant.bibNumber})!`,
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
  }

  // Keluar dari Course sebelum Finish (setelah dikonfirmasi peserta)
  function handleConfirmLeaveCourse() {
    setActiveCourse(null);
    setActiveSession(null);
    setSelectedCheckpointId('');
    setStartQrInput('');
    setCheckpointQrInput('');
    setFinishQrInput('');
    setConfirmingLeaveCourse(false);
    setFeedbackBanner({
      type: 'warning',
      text: 'Anda telah keluar dari Course. Silakan pindai Setup QR untuk memuat Course kembali.',
    });
  }

  // ==========================================================================
  // HANDLER 2: LOAD COURSE (SCAN SETUP QR — OTOMATIS HILANG SETELAH MASUK COURSE)
  // ==========================================================================

  async function handleLoadCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setFeedbackBanner(null);

    try {
      const res = await fetch('/api/participant/load-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ setupQrCode: setupQrInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackBanner({
          type: 'error',
          text: data.error || 'Gagal memuat Course dari Setup QR.',
        });
        return;
      }

      setActiveCourse(data.course);
      setActiveSession(data.session);
      setConfirmingLeaveCourse(false);
      if (data.course.checkpoints.length > 0) {
        setSelectedCheckpointId(data.course.checkpoints[0].id);
      }
      setFeedbackBanner({
        type: 'success',
        text: `Course "${data.course.name}" berhasil dimuat! Silakan pindai Start QR saat Anda siap memulai.`,
      });
    } catch {
      setFeedbackBanner({
        type: 'error',
        text: 'Memuat Course membutuhkan koneksi internet awal sebelum turun ke lapangan.',
      });
    }
  }

  // ==========================================================================
  // HANDLER 3: SIMPAN LAPORAN OFFLINE-FIRST (START, CHECKPOINT, FINISH)
  // ==========================================================================

  async function recordAndQueueReport(params: {
    checkpointId: string;
    reportType: 'START' | 'CHECKPOINT' | 'FINISH';
    validationUsed: 'QR' | 'GPS' | 'QR_AND_GPS';
    qrPayloadScanned?: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
  }) {
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

    // LANGKAH 1 WAJIB: Simpan ke penyimpanan lokal permanen (IndexedDB) SEBELUM kirim ke server
    await saveReportsLocally([newReport]);
    const updatedLocal = await getLocalReportsForSession(activeSession.id);
    setLocalReports(updatedLocal);

    // LANGKAH 2: Berikan konfirmasi bahwa laporan sudah aman tersimpan di perangkat
    setFeedbackBanner({
      type: 'success',
      text: `Laporan ${params.reportType} telah tersimpan aman di perangkat (${new Date(
        measuredAt
      ).toLocaleTimeString('id-ID')}). Anda dapat langsung melanjutkan kegiatan!`,
    });

    // LANGKAH 3: Coba kirim ke server di latar belakang tanpa memblokir peserta
    await triggerSyncQueue(true);
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

    // Cek Kondisi A: jika tidak sengaja ter-scan Setup QR saat mau Start
    if (checkAccidentalSetupQrScan(trimmed)) {
      setStartQrInput('');
      return;
    }

    await recordAndQueueReport({
      checkpointId: 'START',
      reportType: 'START',
      validationUsed: 'QR',
      qrPayloadScanned: trimmed,
    });
    setStartQrInput('');
  }

  async function handleReportCheckpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCourse || !selectedCheckpointId) return;

    const trimmedQr = checkpointQrInput.trim();

    // Cek Kondisi B: jika sedang sesi aktif namun tidak sengaja ter-scan Setup QR
    if (trimmedQr && checkAccidentalSetupQrScan(trimmedQr)) {
      setCheckpointQrInput('');
      return;
    }

    const method = activeCourse.validationMethod;
    const needsQr =
      method === ValidationMethod.QR_ONLY || method === ValidationMethod.QR_AND_GPS;
    const needsGps =
      method === ValidationMethod.GPS_AUTO || method === ValidationMethod.QR_AND_GPS;

    if (needsQr && !trimmedQr) {
      setFeedbackBanner({
        type: 'error',
        text: 'Course ini mewajibkan pemindaian QR Code Checkpoint.',
      });
      return;
    }

    if (needsGps && !gpsCoords) {
      setFeedbackBanner({
        type: 'error',
        text: 'Course ini membutuhkan koordinat GPS peserta. Tekan tombol "Ambil Posisi GPS" terlebih dahulu.',
      });
      return;
    }

    if (method === ValidationMethod.QR_OR_GPS && !trimmedQr && !gpsCoords) {
      setFeedbackBanner({
        type: 'error',
        text: 'Silakan pindai QR Checkpoint atau ambil posisi GPS Anda.',
      });
      return;
    }

    const validationUsed: 'QR' | 'GPS' | 'QR_AND_GPS' =
      trimmedQr && gpsCoords ? 'QR_AND_GPS' : gpsCoords ? 'GPS' : 'QR';

    await recordAndQueueReport({
      checkpointId: selectedCheckpointId,
      reportType: 'CHECKPOINT',
      validationUsed,
      qrPayloadScanned: trimmedQr || undefined,
      latitude: gpsCoords?.latitude,
      longitude: gpsCoords?.longitude,
      accuracyMeters: gpsCoords?.accuracy,
    });

    setCheckpointQrInput('');

    const currentIndex = activeCourse.checkpoints.findIndex(
      (c) => c.id === selectedCheckpointId
    );
    if (currentIndex >= 0 && currentIndex + 1 < activeCourse.checkpoints.length) {
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

    // Cek Kondisi B: jika sedang sesi aktif namun tidak sengaja ter-scan Setup QR
    if (checkAccidentalSetupQrScan(trimmed)) {
      setFinishQrInput('');
      return;
    }

    await recordAndQueueReport({
      checkpointId: 'FINISH',
      reportType: 'FINISH',
      validationUsed: 'QR',
      qrPayloadScanned: trimmed,
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
    ctx.fillText(`Lokasi: ${activeCourse.locationName} (${activeCourse.date})`, 32, 155);
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
    ctx.fillText(`Total Skor Resmi Server: ${activeSession.totalScore} Poin`, 32, 288);
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

  // Hitung waktu tempuh berjalan (Stopwatch) dari waktu Start asli (server atau lokal) agar tidak pernah reset walau tab ditutup
  const effectiveStartIso = useMemo(() => {
    if (activeSession?.startedAt) return activeSession.startedAt;
    const localStart = localReports.find(
      (r) => r.reportType === 'START' && r.syncStatus !== SyncStatus.REJECTED_SERVER
    );
    return localStart?.measuredAt || null;
  }, [activeSession?.startedAt, localReports]);

  const effectiveFinishIso = useMemo(() => {
    if (activeSession?.finishedAt) return activeSession.finishedAt;
    const localFinish = localReports.find(
      (r) => r.reportType === 'FINISH' && r.syncStatus !== SyncStatus.REJECTED_SERVER
    );
    return localFinish?.measuredAt || null;
  }, [activeSession?.finishedAt, localReports]);

  const liveStopwatchSeconds = useMemo(() => {
    if (activeSession?.durationSeconds !== undefined) {
      return activeSession.durationSeconds;
    }
    if (!effectiveStartIso) return undefined;
    const endMs = effectiveFinishIso ? Date.parse(effectiveFinishIso) : nowTick;
    return Math.max(0, Math.floor((endMs - Date.parse(effectiveStartIso)) / 1000));
  }, [activeSession?.durationSeconds, effectiveStartIso, effectiveFinishIso, nowTick]);

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-12">
      {/* BANNER PENGAMAN OFFLINE BROWSER & OPSI PASANG IKON DI LAYAR HP */}
      <PWAInstallBanner />

      {/* BAR STATUS JARINGAN & SIMULASI OFFLINE */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isEffectivelyOnline ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Wifi className="h-4 w-4" />
              </span>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <WifiOff className="h-4 w-4" />
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">
                  {isEffectivelyOnline ? 'Terhubung (Online)' : 'Mode Offline Aktif'}
                </span>
                {pendingSyncCount > 0 && (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
                    {pendingSyncCount} Antrean Lokal
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {isEffectivelyOnline
                  ? 'Laporan pos otomatis dikirim & divalidasi server.'
                  : 'Tanpa sinyal: Laporan disimpan permanen di perangkat (IndexedDB).'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSimulatedOffline((prev) => !prev)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition border ${
                simulatedOffline
                  ? 'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {simulatedOffline ? 'Matikan Simulasi Offline' : 'Uji Simulasi Offline'}
            </button>

            {activeSession && (
              <button
                type="button"
                onClick={() => triggerSyncQueue(false)}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BANNER NOTIFIKASI STATUS / ERROR */}
      {feedbackBanner && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm ${
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

      {/* MODAL PEMINDAI KAMERA QR JIKA DIAKTIFKAN */}
      {cameraActiveFor && (
        <div className="rounded-xl border border-emerald-500/40 bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-300">
              Arahkan Kamera ke QR Code ({cameraActiveFor})
            </span>
            <button
              type="button"
              onClick={() => setCameraActiveFor(null)}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
            >
              Tutup Kamera
            </button>
          </div>
          <video
            ref={videoRef}
            className="h-56 w-full rounded-lg bg-black object-cover"
            playsInline
            muted
          />
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
                Registrasi / Masuk Peserta
              </h2>
            </div>
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setAuthTab('register')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  authTab === 'register'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Register Baru
              </button>
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
            </div>
          </div>

          {authTab === 'register' ? (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nama Peserta / Ketua Tim <span className="text-rose-400">*</span>
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
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Buat PIN Keamanan (Minimal 4 digit — Disimpan Terenkripsi/Hash){' '}
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
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition"
              >
                Daftar & Lanjut ke Scan Setup QR
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
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition"
              >
                Masuk Peserta
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          {/* HEADER PROFIL PESERTA AKTIF */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                {participant.bibNumber}
              </div>
              <div>
                <div className="text-sm font-bold text-white">{participant.name}</div>
                <div className="text-xs text-emerald-400 font-medium">
                  Tim: {participant.teamName}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" /> Ganti Akun
            </button>
          </div>

          {/* ==================================================================
              LANGKAH 2: LOAD COURSE (HANYA MUNCUL JIKA BELUM MASUK KE COURSE!)
              Begitu peserta berhasil Load Course, menu ini langsung hilang.
              Pilihan setup hanya diatur oleh Penyelenggara saat membuat Course.
             ================================================================== */}
          {!activeCourse || !activeSession ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Langkah 2 — Masuk ke Course
                </span>
                <h3 className="text-base font-bold text-white">
                  Pindai Setup QR Code dari Panitia
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Seluruh aturan Course telah dikonfigurasi oleh Penyelenggara. Pindai Setup QR untuk memuat Course Anda.
                </p>
              </div>

              <form onSubmit={handleLoadCourse} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={setupQrInput}
                    onChange={(e) => setSetupQrInput(e.target.value)}
                    placeholder="Pindai Setup QR Code dari panitia..."
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCameraActiveFor('SETUP')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    <Camera className="h-4 w-4" /> Scan Kamera
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition"
                >
                  <QrCode className="h-4 w-4" /> Muat Course (Scan Setup QR)
                </button>
              </form>
            </div>
          ) : (
            /* ==================================================================
               INFORMASI COURSE & SESI AKTIF (TAMPIL SETELAH SETUP QR DIPINDAI)
               ================================================================== */
            <>
              {/* RINGKASAN STATUS SESI & PROGRES */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="text-xs font-medium text-emerald-400">
                      {activeCourse.locationName} • {activeCourse.date}
                    </div>
                    <h3 className="text-base font-bold text-white">
                      {activeCourse.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Metode Validasi:{' '}
                      <strong className="text-slate-200">
                        {activeCourse.validationMethod}
                      </strong>{' '}
                      | Urutan Pos:{' '}
                      <strong className="text-slate-200">
                        {activeCourse.enforceOrder ? 'Wajib Berurutan' : 'Bebas (Score)'}
                      </strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Status Resmi Server</span>
                    <span
                      className={`inline-block mt-0.5 rounded px-2.5 py-0.5 text-xs font-bold ${
                        activeSession.status === SessionStatus.ACTIVE
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : activeSession.status === SessionStatus.FINISHED
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {activeSession.status}
                    </span>
                  </div>
                </div>

                {/* INDIKATOR PROGRES RESMI SERVER VS LOKAL PERANGKAT + STOPWATCH ANTI-RESET */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <div className="text-xs text-slate-400">Waktu Lomba</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-amber-400">
                      {effectiveStartIso
                        ? formatStopwatchSeconds(liveStopwatchSeconds)
                        : 'Belum Start'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <div className="text-xs text-slate-400">Valid Server</div>
                    <div className="text-lg font-bold text-emerald-400">
                      {activeSession.validatedCheckpointIds.length} /{' '}
                      {activeCourse.checkpoints.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <div className="text-xs text-slate-400">Antrean Lokal</div>
                    <div className="text-lg font-bold text-amber-400">
                      {pendingSyncCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <div className="text-xs text-slate-400">Skor Resmi</div>
                    <div className="text-lg font-bold text-white">
                      {activeSession.totalScore}
                    </div>
                  </div>
                </div>

                {/* DAFTAR POS CHECKPOINT & STATUSNYA */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Daftar Pos Checkpoint
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {activeCourse.checkpoints.map((cp) => {
                      const isServerValidated =
                        activeSession.validatedCheckpointIds.includes(cp.id);
                      const localCpReport = [...localReports]
                        .reverse()
                        .find(
                          (r) =>
                            r.reportType === 'CHECKPOINT' && r.checkpointId === cp.id
                        );

                      return (
                        <div
                          key={cp.id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                            isServerValidated
                              ? 'border-emerald-500/40 bg-emerald-950/30'
                              : localCpReport
                              ? 'border-amber-500/40 bg-amber-950/20'
                              : 'border-slate-800 bg-slate-950'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-white">
                              #{cp.orderIndex} {cp.code}
                            </span>{' '}
                            — <span className="text-slate-300">{cp.name}</span>
                            <div className="text-[11px] text-slate-400">
                              Radius GPS: {cp.radiusMeters}m | Poin: {cp.points}
                            </div>
                          </div>
                          <div>
                            {isServerValidated ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                                <ShieldCheck className="h-3.5 w-3.5" /> Sah di Server
                              </span>
                            ) : localCpReport ? (
                              <SyncBadge status={localCpReport.syncStatus} />
                            ) : (
                              <span className="text-slate-500">Belum Dikunjungi</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ==============================================================
                  LANGKAH 3: PINDAI START QR CODE (KONDISI A: BELUM START)
                 ============================================================== */}
              {!sessionCanRecordCheckpoints && (
                <div className="rounded-xl border border-emerald-500/40 bg-slate-900/90 p-5 space-y-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      Langkah 3 — Mulai Sesi
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Pindai Start QR Code
                    </h3>
                    <p className="text-xs text-slate-400">
                      Hanya pindai Start QR saat Anda benar-benar siap memulai perhitungan waktu sesi.
                    </p>
                  </div>

                  <form onSubmit={handleStartSession} className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={startQrInput}
                        onChange={(e) => setStartQrInput(e.target.value)}
                        placeholder="Pindai Start QR Code..."
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setCameraActiveFor('START')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200"
                      >
                        <Camera className="h-4 w-4" /> Kamera
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
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
                        className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-emerald-500/50"
                      >
                        Simulasi Scan Start QR
                      </button>
                    </div>

                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      <Play className="h-4 w-4" /> Scan Start QR & Mulai Sesi
                    </button>
                  </form>
                </div>
              )}

              {/* ==============================================================
                  LANGKAH 4: LAPOR CHECKPOINT (OFFLINE-FIRST, KONDISI B)
                 ============================================================== */}
              {sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      Langkah 4 — Kunjungi & Laporkan Pos (Offline-First)
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Scan Check Point
                    </h3>
                    <p className="text-xs text-slate-400">
                      Laporan disimpan permanen di perangkat sebelum dikirim. Anda dapat langsung lanjut ke pos berikutnya tanpa menunggu sinyal.
                    </p>
                  </div>

                  <form onSubmit={handleReportCheckpoint} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Pilih Pos Checkpoint yang Dikunjungi
                      </label>
                      <select
                        value={selectedCheckpointId}
                        onChange={(e) => setSelectedCheckpointId(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      >
                        {activeCourse.checkpoints.map((cp) => (
                          <option key={cp.id} value={cp.id}>
                            Pos #{cp.orderIndex} — {cp.code}: {cp.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* INPUT QR CHECKPOINT */}
                    {activeCourse.validationMethod !== ValidationMethod.GPS_AUTO && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-300">
                          QR Code Checkpoint ({selectedCheckpoint?.code})
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={checkpointQrInput}
                            onChange={(e) => setCheckpointQrInput(e.target.value)}
                            placeholder="Pindai QR Checkpoint..."
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setCameraActiveFor('CHECKPOINT')}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200"
                          >
                            <Camera className="h-4 w-4" /> Kamera
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
                            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-emerald-500/50"
                          >
                            Simulasi Scan QR {selectedCheckpoint.code}
                          </button>
                        )}
                      </div>
                    )}

                    {/* INPUT KOORDINAT GPS */}
                    {activeCourse.validationMethod !== ValidationMethod.QR_ONLY && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                            Validasi Koordinat GPS (Radius Maks:{' '}
                            {selectedCheckpoint?.radiusMeters}m)
                          </span>
                          {gpsCoords && (
                            <span className="text-[11px] font-mono text-emerald-400">
                              {gpsCoords.latitude.toFixed(5)},{' '}
                              {gpsCoords.longitude.toFixed(5)} (±{gpsCoords.accuracy}m)
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleReadDeviceGps()}
                            disabled={isReadingGps}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                          >
                            <Compass className="h-3.5 w-3.5" />
                            {isReadingGps ? 'Membaca GPS...' : 'Ambil Posisi GPS HP'}
                          </button>
                          {selectedCheckpoint && (
                            <button
                              type="button"
                              onClick={() => handleReadDeviceGps(selectedCheckpoint)}
                              className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/50"
                            >
                              Simulasi GPS Tepat di {selectedCheckpoint.code}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition"
                    >
                      Simpan & Laporkan {selectedCheckpoint?.code || 'Checkpoint'}
                    </button>
                  </form>
                </div>
              )}

              {/* ==============================================================
                  LANGKAH 5: PINDAI FINISH QR CODE
                 ============================================================== */}
              {sessionCanRecordCheckpoints && !sessionMarkedFinishedLocallyOrServer && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                      Langkah 5 — Selesaikan Kegiatan
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Pindai Finish QR Code
                    </h3>
                  </div>

                  <form onSubmit={handleFinishSession} className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={finishQrInput}
                        onChange={(e) => setFinishQrInput(e.target.value)}
                        placeholder="Pindai Finish QR Code..."
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setCameraActiveFor('FINISH')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200"
                      >
                        <Camera className="h-4 w-4" /> Kamera
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
                      className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-sky-500/50"
                    >
                      Simulasi Scan Finish QR
                    </button>

                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-500"
                    >
                      <Flag className="h-4 w-4" /> Scan Finish QR & Selesaikan Sesi
                    </button>
                  </form>
                </div>
              )}

              {/* ==============================================================
                  LANGKAH 6: BUKTI CADANGAN HASIL PESERTA
                 ============================================================== */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      Langkah 6 — Bukti Cadangan
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Simpan Bukti Hasil Peserta
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadProofCard}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-slate-700"
                  >
                    <Download className="h-4 w-4" /> Unduh Gambar Bukti (PNG)
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Anda dapat mengunduh kartu bukti hasil (PNG) atau melakukan screenshot layar ini sebagai bukti cadangan kepada panitia di garis Finish.
                </p>
              </div>

              {/* ==============================================================
                  LOG ANTREAN LAPORAN OFFLINE-FIRST (5 STATUS SINKRONISASI JELAS)
                 ============================================================== */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Riwayat & Antrean Laporan Perangkat (IndexedDB)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Tetap tersimpan meskipun aplikasi ditutup atau perangkat direstart.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Total: {localReports.length} laporan
                  </span>
                </div>

                {localReports.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-500">
                    Belum ada laporan pada sesi ini.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...localReports].reverse().map((rep) => {
                      const cpObj = activeCourse.checkpoints.find(
                        (c) => c.id === rep.checkpointId
                      );
                      const title =
                        rep.reportType === 'START'
                          ? 'START QR'
                          : rep.reportType === 'FINISH'
                          ? 'FINISH QR'
                          : `${cpObj?.code || rep.checkpointId} — ${cpObj?.name || ''}`;

                      return (
                        <div
                          key={rep.reportId}
                          className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-100">{title}</span>
                            <SyncBadge status={rep.syncStatus} />
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                            <span>
                              Waktu Perangkat:{' '}
                              {new Date(rep.measuredAt).toLocaleTimeString('id-ID')}
                            </span>
                            {rep.receivedAt && (
                              <span>
                                Diterima Server:{' '}
                                {new Date(rep.receivedAt).toLocaleTimeString('id-ID')}
                              </span>
                            )}
                            <span className="font-mono text-slate-500">
                              ID: {rep.reportId.slice(0, 16)}...
                            </span>
                          </div>
                          {rep.rejectionReason && (
                            <div className="rounded bg-rose-950/60 border border-rose-500/30 px-2.5 py-1 text-[11px] text-rose-300">
                              Catatan Server: {rep.rejectionReason}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ==============================================================
                  TOMBOL KECIL "KELUAR COURSE" (JAUH DARI TOMBOL SCAN + KONFIRMASI)
                 ============================================================== */}
              <div className="pt-8 border-t border-slate-900 flex flex-col items-center justify-center">
                {!confirmingLeaveCourse ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingLeaveCourse(true)}
                    className="rounded px-2.5 py-1 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-900 transition"
                  >
                    Keluar dari Course Ini (Sebelum / Sesudah Finish)
                  </button>
                ) : (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3 text-center space-y-2 max-w-xs">
                    <p className="text-[11px] text-slate-300">
                      Yakin ingin keluar dari Course <strong>{activeCourse.name}</strong>?
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingLeaveCourse(false)}
                        className="rounded bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmLeaveCourse}
                        className="rounded bg-rose-950 border border-rose-500/40 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900"
                      >
                        Ya, Keluar Course
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
