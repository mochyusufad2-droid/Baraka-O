import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutDashboard,
  Map as MapIcon,
  Radio,
  Trophy,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Navigation,
  Shield,
  Lock,
  LogOut,
  FileSpreadsheet,
  Printer,
  Calendar,
  MapPin,
  Edit3,
  X,
  Check,
  Timer,
} from 'lucide-react';
import {
  Course,
  Checkpoint,
  CheckpointReport,
  GeoPointLocation,
  OrganizerPublic,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus,
  ValidationMethod,
} from '../../types';
import { BulkQrPrintModal } from './QrPrintModals';
import { CourseMapPlanner } from './CourseMapPlanner';
import { syncCourseToFirestore } from '../../firebase';
import {
  clearPersistedParticipantState,
  loadOrganizerCoursesBackup,
  removeCourseFromOrganizerBackup,
  saveOrganizerCoursesBackup,
} from '../../services/offlineQueue';

interface DashboardApiData {
  serverTime: string;
  currentOrganizer?: OrganizerPublic;
  organizers?: OrganizerPublic[];
  courses: Course[];
  participants: ParticipantPublic[];
  sessions: ParticipantSession[];
  reports: CheckpointReport[];
}

type OrganizerTab = 'OVERVIEW' | 'COURSES' | 'MONITORING' | 'RESULT' | 'ORGANIZERS';

const ORG_TOKEN_STORAGE_KEY = 'baraka_organizer_token';

function formatElapsedSeconds(sec?: number): string {
  if (sec === undefined || sec === null || sec < 0) return '-';
  const totalSeconds = Math.floor(sec);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');
}

function formatTimeAgo(isoString?: string): string {
  if (!isoString) return 'Belum ada data';
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return `${Math.max(0, diffSec)} dtk lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour} jam lalu`;
}

/**
 * Hanya izinkan karakter angka (0-9) tetapi biarkan string kosong ""
 * saat dihapus dengan Backspace agar tidak pernah menyisakan angka 0 (mencegah bug 010).
 */
function sanitizeDigitsOnly(val: string): string {
  const digits = val.replace(/[^0-9]/g, '');
  if (digits.length > 1 && digits.startsWith('0')) {
    return digits.replace(/^0+/, '') || '0';
  }
  return digits;
}

interface OrganizerDashboardProps {
  onAuthenticated?: () => void;
  onLogout?: () => void;
}

export default function OrganizerDashboard({
  onAuthenticated,
  onLogout,
}: OrganizerDashboardProps = {}) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(ORG_TOKEN_STORAGE_KEY)
  );
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('123456');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<OrganizerTab>('OVERVIEW');
  const [dashboard, setDashboard] = useState<DashboardApiData | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [bulkPrintCourse, setBulkPrintCourse] = useState<Course | null>(null);

  // ==========================================================================
  // STATE FORM BUAT COURSE BARU (Input angka disimpan sebagai string agar bersih saat dihapus)
  // ==========================================================================
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseDescription, setNewCourseDescription] = useState('');
  const [newCourseLocation, setNewCourseLocation] = useState('');
  const [newCourseDate, setNewCourseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [newCourseScoring, setNewCourseScoring] = useState(true);
  const [newCourseValidation, setNewCourseValidation] = useState<ValidationMethod>(
    ValidationMethod.QR_AND_GPS
  );
  const [newCourseRadiusInput, setNewCourseRadiusInput] = useState<string>('35');
  const [newCourseEnforceOrder, setNewCourseEnforceOrder] = useState<boolean>(true);
  const [newCourseDurationInput, setNewCourseDurationInput] = useState<string>('60');
  const [newCoursePenaltyEnabled, setNewCoursePenaltyEnabled] = useState<boolean>(true);
  const [newCoursePenaltyInput, setNewCoursePenaltyInput] = useState<string>('10');

  // ==========================================================================
  // STATE EDIT COURSE AKTIF & KONFIRMASI HAPUS COURSE
  // ==========================================================================
  const [isEditingCourse, setIsEditingCourse] = useState<boolean>(false);
  const [editCourseName, setEditCourseName] = useState('');
  const [editCourseDescription, setEditCourseDescription] = useState('');
  const [editCourseLocation, setEditCourseLocation] = useState('');
  const [editCourseDate, setEditCourseDate] = useState('');
  const [editCourseScoring, setEditCourseScoring] = useState(true);
  const [editCourseValidation, setEditCourseValidation] = useState<ValidationMethod>(
    ValidationMethod.QR_ONLY
  );
  const [editCourseRadiusInput, setEditCourseRadiusInput] = useState<string>('35');
  const [editCourseEnforceOrder, setEditCourseEnforceOrder] = useState<boolean>(true);
  const [editCourseDurationInput, setEditCourseDurationInput] = useState<string>('');
  const [editCoursePenaltyEnabled, setEditCoursePenaltyEnabled] = useState<boolean>(false);
  const [editCoursePenaltyInput, setEditCoursePenaltyInput] = useState<string>('10');

  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState<Course | null>(null);

  // ==========================================================================
  // STATE FORM TAMBAH / EDIT CHECKPOINT (Input Poin & Radius string bebas angka 0)
  // ==========================================================================
  const [editingCheckpointId, setEditingCheckpointId] = useState<string | null>(null);
  const [cpCode, setCpCode] = useState('CP1');
  const [cpName, setCpName] = useState('');
  const [cpPointsInput, setCpPointsInput] = useState<string>('100');
  const [cpLat, setCpLat] = useState<string>('-6.8586');
  const [cpLng, setCpLng] = useState<string>('107.6305');
  const [cpRadiusInput, setCpRadiusInput] = useState<string>('35');

  // Form States for Participant Creation by Organizer
  const [partName, setPartName] = useState('');
  const [partTeam, setPartTeam] = useState('');
  const [partPhone, setPartPhone] = useState('');
  const [partPin, setPartPin] = useState('');
  const [partStatusMsg, setPartStatusMsg] = useState<string | null>(null);

  // Form States for Superadmin Organizer Account Creation & Management
  const [orgNameInput, setOrgNameInput] = useState('');
  const [orgUsernameInput, setOrgUsernameInput] = useState('');
  const [orgOrganizationInput, setOrgOrganizationInput] = useState('');
  const [orgPinInput, setOrgPinInput] = useState('');
  const [orgManageMsg, setOrgManageMsg] = useState<string | null>(null);
  const [resetPinOrgId, setResetPinOrgId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState<string>('');

  // Live timer tick for active sessions
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const showTemporarySuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(ORG_TOKEN_STORAGE_KEY);
    setToken(null);
    setDashboard(null);
    onLogout?.();
  }, [onLogout]);

  useEffect(() => {
    if (token) {
      onAuthenticated?.();
    }
  }, [token, onAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/organizer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim() || undefined,
          pin: pinInput,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(
          data.error || `PIN Organizer tidak valid (HTTP ${res.status}).`
        );
        return;
      }
      clearPersistedParticipantState();
      localStorage.setItem(ORG_TOKEN_STORAGE_KEY, data.token);
      setToken(data.token);
    } catch {
      setLoginError('Gagal menghubungi server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/organizer/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) throw new Error('Gagal memuat data dashboard organizer.');
      const data: DashboardApiData = await res.json();

      // Cek apakah ada Course di cadangan lokal browser yang belum ada di server (mis. setelah serverless cold-start)
      const localBackup = loadOrganizerCoursesBackup();
      const missingOnServer = localBackup.filter(
        (bc) => bc && bc.id && !data.courses.some((sc) => sc.id === bc.id)
      );

      if (missingOnServer.length > 0) {
        const syncRes = await fetch('/api/organizer/courses/sync-backup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ courses: localBackup }),
        });
        if (syncRes.ok) {
          const syncData = await syncRes.json().catch(() => ({}));
          if (Array.isArray(syncData.courses)) {
            data.courses = syncData.courses;
          }
        }
      }

      saveOrganizerCoursesBackup(data.courses);
      setDashboard(data);
      setSelectedCourseId((prev) => {
        if (prev && data.courses.some((c: Course) => c.id === prev)) return prev;
        return data.courses[0]?.id || '';
      });
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kesalahan jaringan');
    } finally {
      setIsLoading(false);
    }
  }, [token, handleLogout]);

  useEffect(() => {
    if (!token) return;
    fetchDashboard();
    const poll = setInterval(fetchDashboard, 6000);
    return () => clearInterval(poll);
  }, [token, fetchDashboard]);

  const selectedCourse: Course | undefined = useMemo(() => {
    if (!dashboard) return undefined;
    return (
      dashboard.courses.find((c: Course) => c.id === selectedCourseId) ||
      dashboard.courses[0]
    );
  }, [dashboard, selectedCourseId]);

  /**
   * Course efektif yang menggabungkan perubahan dari form Edit Course secara real-time (Live Preview)
   * sehingga peta interaktif, badge aturan, dan kalkulasi langsung berubah saat opsi diubah.
   */
  const effectiveSelectedCourse: Course | undefined = useMemo(() => {
    if (!selectedCourse) return undefined;
    if (!isEditingCourse) return selectedCourse;

    const liveRadius = Math.max(5, Number(editCourseRadiusInput) || 35);
    const liveDuration = Math.max(0, Number(editCourseDurationInput) || 0);
    const livePenaltyRate = Math.max(0, Number(editCoursePenaltyInput) || 0);

    return {
      ...selectedCourse,
      name: editCourseName.trim() || selectedCourse.name,
      description: editCourseDescription,
      locationName: editCourseLocation,
      date: editCourseDate || selectedCourse.date,
      scoringEnabled: editCourseScoring,
      validationMethod: editCourseValidation,
      defaultGpsRadiusMeters: liveRadius,
      enforceOrder: editCourseEnforceOrder,
      durationMinutes: liveDuration,
      overtimePenaltyEnabled: editCoursePenaltyEnabled,
      overtimePenaltyPointsPerMinute: livePenaltyRate,
    };
  }, [
    selectedCourse,
    isEditingCourse,
    editCourseName,
    editCourseDescription,
    editCourseLocation,
    editCourseDate,
    editCourseScoring,
    editCourseValidation,
    editCourseRadiusInput,
    editCourseEnforceOrder,
    editCourseDurationInput,
    editCoursePenaltyEnabled,
    editCoursePenaltyInput,
  ]);

  // Helper untuk langsung memperbarui course di state lokal dashboard secara real-time tanpa jeda
  const applyUpdatedCourseLocally = useCallback((updatedCourse: Course) => {
    setDashboard((prev) => {
      if (!prev) return prev;
      const nextCourses = prev.courses.map((c) =>
        c.id === updatedCourse.id ? updatedCourse : c
      );
      saveOrganizerCoursesBackup(nextCourses);
      return {
        ...prev,
        courses: nextCourses,
      };
    });
    setBulkPrintCourse((prev) =>
      prev && prev.id === updatedCourse.id ? updatedCourse : prev
    );
  }, []);

  // Saat berganti Course atau jumlah CP bertambah, otomatis isi saran kode pos berikutnya (CP1, CP2, dst.)
  useEffect(() => {
    if (!selectedCourse) return;
    if (!editingCheckpointId) {
      const nextNum = selectedCourse.checkpoints.length + 1;
      setCpCode(`CP${nextNum}`);
      setCpRadiusInput(String(selectedCourse.defaultGpsRadiusMeters || 35));
    }
  }, [
    selectedCourse?.id,
    selectedCourse?.checkpoints.length,
    selectedCourse?.defaultGpsRadiusMeters,
    editingCheckpointId,
  ]);

  // Buka mode Edit Course dengan menyalin data Course aktif ke state form edit
  const handleStartEditCourse = (course: Course) => {
    setEditCourseName(course.name);
    setEditCourseDescription(course.description || '');
    setEditCourseLocation(course.locationName || '');
    setEditCourseDate(course.date || new Date().toISOString().slice(0, 10));
    setEditCourseScoring(course.scoringEnabled);
    setEditCourseValidation(course.validationMethod);
    setEditCourseRadiusInput(String(course.defaultGpsRadiusMeters || 35));
    setEditCourseEnforceOrder(course.enforceOrder);
    setEditCourseDurationInput(
      course.durationMinutes && course.durationMinutes > 0
        ? String(course.durationMinutes)
        : ''
    );
    setEditCoursePenaltyEnabled(Boolean(course.overtimePenaltyEnabled));
    setEditCoursePenaltyInput(
      course.overtimePenaltyPointsPerMinute !== undefined &&
        course.overtimePenaltyPointsPerMinute > 0
        ? String(course.overtimePenaltyPointsPerMinute)
        : '10'
    );
    setIsEditingCourse(true);
  };

  // Simpan perubahan Edit Course Aktif
  const handleSaveEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !editCourseName.trim() || !token) return;
    try {
      const parsedRadius = Math.max(5, Number(editCourseRadiusInput) || 35);
      const parsedDuration = Math.max(0, Number(editCourseDurationInput) || 0);
      const parsedPenalty = Math.max(0, Number(editCoursePenaltyInput) || 0);

      const res = await fetch(`/api/organizer/courses/${selectedCourse.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editCourseName.trim(),
          description: editCourseDescription.trim(),
          locationName: editCourseLocation.trim(),
          date: editCourseDate,
          scoringEnabled: editCourseScoring,
          validationMethod: editCourseValidation,
          defaultGpsRadiusMeters: parsedRadius,
          enforceOrder: editCourseEnforceOrder,
          durationMinutes: parsedDuration,
          overtimePenaltyEnabled: editCoursePenaltyEnabled,
          overtimePenaltyPointsPerMinute: parsedPenalty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui Course.');
      if (data.course) {
        applyUpdatedCourseLocally(data.course);
        syncCourseToFirestore(data.course).catch(() => {});
      }
      setIsEditingCourse(false);
      await fetchDashboard();
      showTemporarySuccess(`Course "${data.course.name}" berhasil diperbarui secara real-time!`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal memperbarui Course'
      );
    }
  };

  // Hapus Course Aktif
  const handleConfirmDeleteCourse = async () => {
    if (!confirmDeleteCourse || !token) return;
    const targetId = confirmDeleteCourse.id;
    const targetName = confirmDeleteCourse.name;
    try {
      removeCourseFromOrganizerBackup(targetId);
      const res = await fetch(
        `/api/organizer/courses/${targetId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus Course.');
      setConfirmDeleteCourse(null);
      setIsEditingCourse(false);
      setEditingCheckpointId(null);
      await fetchDashboard();
      showTemporarySuccess(`Course "${targetName}" telah dihapus.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus Course');
    }
  };

  // Update Titik Start / Finish dari Peta Interaktif
  const handleUpdateStartLocation = useCallback(
    async (loc: GeoPointLocation | null) => {
      if (!selectedCourse || !token) return;
      try {
        const res = await fetch(`/api/organizer/courses/${selectedCourse.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ startLocation: loc }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error('Gagal menyimpan titik Start');
        if (data.course) {
          applyUpdatedCourseLocally(data.course);
        }
        await fetchDashboard();
        showTemporarySuccess(
          loc
            ? `🔺 Titik Start disimpan (${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)})`
            : 'Titik Start direset.'
        );
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Gagal memperbarui titik Start'
        );
      }
    },
    [selectedCourse, token, fetchDashboard, showTemporarySuccess, applyUpdatedCourseLocally]
  );

  const handleUpdateFinishLocation = useCallback(
    async (loc: GeoPointLocation | null) => {
      if (!selectedCourse || !token) return;
      try {
        const res = await fetch(`/api/organizer/courses/${selectedCourse.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ finishLocation: loc }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error('Gagal menyimpan titik Finish');
        if (data.course) {
          applyUpdatedCourseLocally(data.course);
        }
        await fetchDashboard();
        showTemporarySuccess(
          loc
            ? `◎ Titik Finish disimpan (${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)})`
            : 'Titik Finish direset.'
        );
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Gagal memperbarui titik Finish'
        );
      }
    },
    [selectedCourse, token, fetchDashboard, showTemporarySuccess, applyUpdatedCourseLocally]
  );

  // Pilih Checkpoint untuk Diedit (dari tabel maupun dari klik simbol di peta)
  const handleSelectCheckpointForEdit = useCallback((cp: Checkpoint) => {
    setEditingCheckpointId(cp.id);
    setCpCode(cp.code);
    setCpName(cp.name || '');
    setCpPointsInput(String(cp.points));
    setCpLat(String(cp.latitude));
    setCpLng(String(cp.longitude));
    setCpRadiusInput(String(cp.radiusMeters));
  }, []);

  const handleCancelEditCheckpoint = useCallback(() => {
    setEditingCheckpointId(null);
    const nextNum = (selectedCourse?.checkpoints.length || 0) + 1;
    setCpCode(`CP${nextNum}`);
    setCpName('');
    setCpPointsInput('100');
    setCpRadiusInput(String(selectedCourse?.defaultGpsRadiusMeters || 35));
  }, [selectedCourse]);

  // Compute Leaderboard rows with live / finished Overtime Penalty calculation (selalu mengikuti aturan Course terbaru secara real-time)
  const leaderboardRows = useMemo(() => {
    if (!dashboard) return [];
    const filteredSessions = dashboard.sessions.filter(
      (s: ParticipantSession) =>
        !selectedCourse || s.courseId === selectedCourse.id
    );

    const statusWeight = (status: SessionStatus) => {
      if (status === SessionStatus.FINISHED) return 3;
      if (status === SessionStatus.ACTIVE) return 2;
      return 1;
    };

    const enriched = filteredSessions.map((sess) => {
      const participant = dashboard.participants.find(
        (p: ParticipantPublic) => p.id === sess.participantId
      );
      const baseCourse = dashboard.courses.find(
        (c: Course) => c.id === sess.courseId
      );
      const course =
        effectiveSelectedCourse && baseCourse?.id === effectiveSelectedCourse.id
          ? effectiveSelectedCourse
          : baseCourse;

      const liveDurationSec =
        sess.status === SessionStatus.FINISHED
          ? sess.durationSeconds
          : sess.status === SessionStatus.ACTIVE && sess.startedAt
          ? Math.max(0, Math.floor((nowTick - Date.parse(sess.startedAt)) / 1000))
          : undefined;

      const grossScore = course
        ? course.scoringEnabled
          ? sess.validatedCheckpointIds.reduce((sum, cpId) => {
              const cp = course.checkpoints.find((c) => c.id === cpId);
              return sum + (cp ? Number(cp.points) || 0 : 0);
            }, 0)
          : 0
        : sess.grossScore ?? sess.totalScore;

      let overtimeMinutes = 0;
      let penaltyPoints = 0;

      if (
        course &&
        course.durationMinutes &&
        course.durationMinutes > 0 &&
        liveDurationSec !== undefined &&
        liveDurationSec > course.durationMinutes * 60
      ) {
        const overSec = liveDurationSec - course.durationMinutes * 60;
        overtimeMinutes = Math.ceil(overSec / 60);
        if (course.overtimePenaltyEnabled) {
          penaltyPoints =
            overtimeMinutes *
            Math.max(0, Number(course.overtimePenaltyPointsPerMinute) || 0);
        }
      }

      const netScore = Math.max(0, grossScore - penaltyPoints);

      return {
        sessionId: sess.id,
        bibNumber: participant?.bibNumber || '-',
        participantName: participant?.name || 'Peserta',
        teamName: participant?.teamName || '-',
        courseId: sess.courseId,
        courseName: course?.name || sess.courseId,
        attemptNumber: sess.attemptNumber || 1,
        status: sess.status,
        checkpointsCompleted: sess.validatedCheckpointIds.length,
        totalCheckpoints: course?.checkpoints.length || 0,
        grossScore,
        overtimeMinutes,
        penaltyPoints,
        totalScore: netScore,
        durationSeconds: liveDurationSec,
        lastLocationAt: sess.lastLocation?.measuredAt,
      };
    });

    return enriched
      .sort((a, b) => {
        const wDiff = statusWeight(b.status) - statusWeight(a.status);
        if (wDiff !== 0) return wDiff;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        const aDur = a.durationSeconds ?? Number.MAX_SAFE_INTEGER;
        const bDur = b.durationSeconds ?? Number.MAX_SAFE_INTEGER;
        return aDur - bDur;
      })
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));
  }, [dashboard, selectedCourse, effectiveSelectedCourse, nowTick]);

  // Create Unified Course (Location optional, clean number strings, duration & penalty)
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim() || !token) return;
    try {
      const parsedRadius = Math.max(5, Number(newCourseRadiusInput) || 35);
      const parsedDuration = Math.max(0, Number(newCourseDurationInput) || 0);
      const parsedPenalty = Math.max(0, Number(newCoursePenaltyInput) || 0);

      const res = await fetch('/api/organizer/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCourseName.trim(),
          description: newCourseDescription.trim(),
          locationName: newCourseLocation.trim(),
          date: newCourseDate,
          scoringEnabled: newCourseScoring,
          validationMethod: newCourseValidation,
          defaultGpsRadiusMeters: parsedRadius,
          enforceOrder: newCourseEnforceOrder,
          allowParticipantMapVisibility: true,
          durationMinutes: parsedDuration,
          overtimePenaltyEnabled: newCoursePenaltyEnabled,
          overtimePenaltyPointsPerMinute: parsedPenalty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat Course baru');
      const created: Course = data.course;
      if (created?.id) {
        const existingBackup = loadOrganizerCoursesBackup().filter(
          (c) => c.id !== created.id
        );
        saveOrganizerCoursesBackup([...existingBackup, created]);
      }
      setNewCourseName('');
      setNewCourseDescription('');
      setNewCourseLocation('');
      await fetchDashboard();
      if (created?.id) {
        setSelectedCourseId(created.id);
        setIsEditingCourse(false);
        showTemporarySuccess(`Course "${created.name}" berhasil dibuat!`);
        syncCourseToFirestore(created).catch(() => {});
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat Course');
    }
  };

  // Add or Update Checkpoint in Course (Nama Lokasi Pos opsional, Poin & Radius dari string)
  const handleSaveCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !cpCode.trim() || !token) return;

    const parsedLat = parseFloat(cpLat);
    const parsedLng = parseFloat(cpLng);
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setErrorMsg(
        'Koordinat Latitude & Longitude wajib berupa angka (atau klik titik di peta).'
      );
      return;
    }

    const parsedPoints =
      cpPointsInput.trim() === '' ? 0 : Math.max(0, Number(cpPointsInput) || 0);
    const parsedRadius =
      cpRadiusInput.trim() === ''
        ? selectedCourse.defaultGpsRadiusMeters || 35
        : Math.max(5, Number(cpRadiusInput) || 35);

    try {
      if (editingCheckpointId) {
        const res = await fetch(
          `/api/organizer/courses/${selectedCourse.id}/checkpoints/${editingCheckpointId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              code: cpCode.trim().toUpperCase(),
              name: cpName.trim(),
              points: parsedPoints,
              latitude: parsedLat,
              longitude: parsedLng,
              radiusMeters: parsedRadius,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || 'Gagal memperbarui checkpoint');
        if (data.course) {
          applyUpdatedCourseLocally(data.course);
        }
        setEditingCheckpointId(null);
        setCpName('');
        await fetchDashboard();
        showTemporarySuccess(
          `Pos ${cpCode.trim().toUpperCase()} berhasil diperbarui!`
        );
      } else {
        const res = await fetch(
          `/api/organizer/courses/${selectedCourse.id}/checkpoints`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              code: cpCode.trim().toUpperCase(),
              name: cpName.trim(),
              points: parsedPoints,
              latitude: parsedLat,
              longitude: parsedLng,
              radiusMeters: parsedRadius,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || 'Gagal menambahkan checkpoint');
        if (data.course) {
          applyUpdatedCourseLocally(data.course);
        }
        setCpName('');
        await fetchDashboard();
        showTemporarySuccess(
          `Pos ${cpCode.trim().toUpperCase()} berhasil ditambahkan ke ${selectedCourse.name}!`
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal menyimpan checkpoint'
      );
    }
  };

  // Delete Checkpoint
  const handleDeleteCheckpoint = async (cpId: string) => {
    if (!selectedCourse || !token) return;
    try {
      const res = await fetch(
        `/api/organizer/courses/${selectedCourse.id}/checkpoints/${cpId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (data?.course) {
        applyUpdatedCourseLocally(data.course);
      }
      if (editingCheckpointId === cpId) {
        setEditingCheckpointId(null);
      }
      await fetchDashboard();
      showTemporarySuccess('Checkpoint berhasil dihapus.');
    } catch {
      setErrorMsg('Gagal menghapus checkpoint');
    }
  };

  // Register Participant by Organizer (Nama Tim wajib)
  const handleCreateParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    setPartStatusMsg(null);
    if (!token) return;
    if (!partName.trim() || !partTeam.trim() || partPin.trim().length < 4) {
      setPartStatusMsg(
        'Nama Peserta, Nama Tim (Wajib), dan PIN (min. 4 digit) harus diisi.'
      );
      return;
    }
    try {
      const res = await fetch('/api/organizer/participants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: partName,
          teamName: partTeam,
          phone: partPhone,
          pin: partPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPartStatusMsg(data.error || 'Gagal mendaftarkan peserta.');
        return;
      }
      setPartName('');
      setPartTeam('');
      setPartPhone('');
      setPartPin('');
      setPartStatusMsg(
        `Peserta ${data.participant.bibNumber} (Tim: ${data.participant.teamName}) berhasil didaftarkan.`
      );
      await fetchDashboard();
    } catch {
      setPartStatusMsg('Kesalahan jaringan saat mendaftarkan peserta.');
    }
  };

  // Superadmin: Buat Akun Organizer Baru
  const handleCreateOrganizerAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgManageMsg(null);
    if (!token) return;
    if (!orgNameInput.trim() || orgPinInput.trim().length < 4) {
      setOrgManageMsg(
        'Nama Organizer dan PIN Login (minimal 4 karakter) wajib diisi.'
      );
      return;
    }
    try {
      const res = await fetch('/api/organizer/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: orgNameInput.trim(),
          username: orgUsernameInput.trim() || undefined,
          organization: orgOrganizationInput.trim(),
          pin: orgPinInput.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrgManageMsg(data.error || 'Gagal membuat akun Organizer.');
        return;
      }
      setOrgNameInput('');
      setOrgUsernameInput('');
      setOrgOrganizationInput('');
      setOrgPinInput('');
      showTemporarySuccess(
        `Akun Organizer "${data.organizer?.name}" (${data.organizer?.code} / Username: ${data.organizer?.username}) berhasil dibuat!`
      );
      await fetchDashboard();
    } catch {
      setOrgManageMsg('Kesalahan jaringan saat membuat akun Organizer.');
    }
  };

  // Superadmin: Toggle Aktif / Nonaktif Organizer
  const handleToggleOrganizerActive = async (org: OrganizerPublic) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/organizer/accounts/${org.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !org.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mengubah status Organizer.');
        return;
      }
      showTemporarySuccess(
        `Status Organizer "${org.name}" diubah menjadi ${
          !org.isActive ? 'AKTIF' : 'NONAKTIF (DIBEKUKAN)'
        }.`
      );
      await fetchDashboard();
    } catch {
      setErrorMsg('Kesalahan jaringan saat memperbarui akun Organizer.');
    }
  };

  // Superadmin: Reset PIN Organizer
  const handleSaveResetOrganizerPin = async (orgId: string) => {
    if (!token || resetPinValue.trim().length < 4) {
      setErrorMsg('PIN baru minimal 4 karakter.');
      return;
    }
    try {
      const res = await fetch(`/api/organizer/accounts/${orgId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPin: resetPinValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mereset PIN Organizer.');
        return;
      }
      setResetPinOrgId(null);
      setResetPinValue('');
      showTemporarySuccess('PIN Organizer berhasil diperbarui.');
      await fetchDashboard();
    } catch {
      setErrorMsg('Kesalahan jaringan saat mereset PIN Organizer.');
    }
  };

  // Superadmin: Hapus Akun Organizer
  const handleDeleteOrganizerAccount = async (org: OrganizerPublic) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/organizer/accounts/${org.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menghapus akun Organizer.');
        return;
      }
      showTemporarySuccess(`Akun Organizer "${org.name}" telah dihapus.`);
      await fetchDashboard();
    } catch {
      setErrorMsg('Kesalahan jaringan saat menghapus akun Organizer.');
    }
  };

  // Export CSV Leaderboard (termasuk Attempt, Poin Kotor, Penalti Terlambat, dan Total Skor Bersih)
  const handleExportCsv = () => {
    const headers = [
      'Rank',
      'BIB',
      'Nama Peserta',
      'Nama Tim',
      'Course',
      'Percobaan (Attempt)',
      'Status',
      'CP Valid',
      'Total CP',
      'Poin Pos (Gross)',
      'Menit Terlambat',
      'Penalti Terlambat',
      'Total Skor Akhir (Net)',
      'Waktu Tempuh',
      'Update Lokasi Terakhir',
    ];
    const csvLines = [
      headers.join(','),
      ...leaderboardRows.map((r) =>
        [
          r.rank,
          `"${r.bibNumber}"`,
          `"${r.participantName}"`,
          `"${r.teamName}"`,
          `"${r.courseName}"`,
          `"Attempt #${r.attemptNumber || 1}"`,
          r.status,
          r.checkpointsCompleted,
          r.totalCheckpoints,
          r.grossScore,
          r.overtimeMinutes,
          r.penaltyPoints,
          r.totalScore,
          `"${formatElapsedSeconds(r.durationSeconds)}"`,
          `"${r.lastLocationAt || '-'}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `baraka-result-${
      selectedCourse?.name.toLowerCase().replace(/\s+/g, '-') || 'all'
    }.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Organizer / Superadmin Login View
  if (!token) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400">
                Otorisasi Panitia &amp; Superadmin
              </span>
              <h2 className="text-lg font-bold text-white">
                Login Dashboard Organizer
              </h2>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Masukkan <strong className="text-slate-200">PIN saja</strong> (atau{' '}
            <strong className="text-slate-200">Username + PIN</strong> yang dibuatkan
            oleh Superadmin). Setiap Organizer hanya dapat melihat &amp; mengelola
            Course buatannya sendiri beserta peserta di Course tersebut.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Username / ID Organizer{' '}
                <span className="text-slate-500 font-normal">
                  (Opsional — Boleh Dikosongkan)
                </span>
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Kosongkan jika login langsung pakai PIN"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                PIN Keamanan Organizer / Superadmin{' '}
                <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Masukkan PIN (Superadmin Default: 123456)"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-amber-400"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                PIN Superadmin bawaan: <code className="text-amber-300">123456</code>{' '}
                • Akun Organizer baru dibuatkan oleh Superadmin di dalam Dashboard.
              </p>
            </div>

            {loginError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              {isLoggingIn ? 'Memverifikasi Akses...' : 'Masuk ke Dashboard Organizer'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading && !dashboard) {
    return (
      <div className="py-16 flex items-center justify-center">
        <div className="flex items-center gap-3 text-amber-400 font-mono text-sm">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Memuat Data Organizer BARAKA ADVENTURE...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-header Organizer Controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white text-sm">
                {dashboard?.currentOrganizer?.isSuperAdmin
                  ? 'PUSAT KENDALI SUPERADMIN'
                  : `DASHBOARD ORGANIZER: ${dashboard?.currentOrganizer?.name || 'Panitia'}`}
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                  dashboard?.currentOrganizer?.isSuperAdmin
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {dashboard?.currentOrganizer?.isSuperAdmin
                  ? 'SUPERADMIN (AKSES PENUH)'
                  : `${dashboard?.currentOrganizer?.code || 'ORGANIZER'} • TERISOLASI`}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {dashboard?.currentOrganizer?.isSuperAdmin
                ? 'Akses penuh seluruh Course, Peserta, dan pembuatan akun login Organizer'
                : 'Hanya menampilkan Course yang Anda buat & peserta yang ikut di Course Anda'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {dashboard && dashboard.courses.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5">
              <MapIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedCourse?.id || ''}
                onChange={(e) => {
                  setSelectedCourseId(e.target.value);
                  setIsEditingCourse(false);
                  setEditingCheckpointId(null);
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none font-medium"
              >
                {dashboard.courses.map((c: Course) => (
                  <option
                    key={c.id}
                    value={c.id}
                    className="bg-slate-900 text-slate-100"
                  >
                    {c.name}
                    {dashboard.currentOrganizer?.isSuperAdmin &&
                    c.createdByOrganizerName
                      ? ` (${c.createdByOrganizerName})`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={fetchDashboard}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Muat Ulang Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs (5 Tabs for Superadmin, 4 Tabs for Regular Organizer) */}
      <div className="flex overflow-x-auto border-b border-slate-800">
        {[
          { id: 'OVERVIEW', label: '1. Overview', icon: LayoutDashboard },
          { id: 'COURSES', label: '2. Course & Peta Pos', icon: MapIcon },
          { id: 'MONITORING', label: '3. Live Monitoring', icon: Radio },
          { id: 'RESULT', label: '4. Result & Leaderboard', icon: Trophy },
          ...(dashboard?.currentOrganizer?.isSuperAdmin
            ? [
                {
                  id: 'ORGANIZERS',
                  label: `5. Kelola Organizer (${
                    dashboard.organizers?.length || 0
                  })`,
                  icon: Shield,
                },
              ]
            : []),
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as OrganizerTab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition ${
                isActive
                  ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="underline ml-4">
            Tutup
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            {successMsg}
          </span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="underline ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Total Peserta Terdaftar</span>
                <Users className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {dashboard.participants.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Nama Tim Wajib &amp; PIN Ter-hash
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Sedang Berlomba (ACTIVE)</span>
                <Radio className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {
                  dashboard.sessions.filter(
                    (s: ParticipantSession) => s.status === SessionStatus.ACTIVE
                  ).length
                }
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Siap Start:{' '}
                {
                  dashboard.sessions.filter(
                    (s: ParticipantSession) =>
                      s.status === SessionStatus.NOT_STARTED
                  ).length
                }{' '}
                tim
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Sudah Finish (FINISHED)</span>
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400">
                {
                  dashboard.sessions.filter(
                    (s: ParticipantSession) => s.status === SessionStatus.FINISHED
                  ).length
                }
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Total Sesi Masuk: {dashboard.sessions.length}
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Total Course &amp; Pos CP</span>
                <MapIcon className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {dashboard.courses.length} Course
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Total Checkpoint:{' '}
                {dashboard.courses.reduce(
                  (acc: number, c: Course) => acc + c.checkpoints.length,
                  0
                )}{' '}
                titik
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Selected Course Summary Card (Tanpa kotak QR individual — terpusat di Print QR Massal) */}
            <div className="lg:col-span-2 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase text-amber-400">
                    Ringkasan Course Aktif
                  </span>
                  <h2 className="text-lg font-bold text-white">
                    {selectedCourse ? selectedCourse.name : 'Belum ada Course'}
                  </h2>
                </div>
                {selectedCourse && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setBulkPrintCourse(selectedCourse)}
                      className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition shadow"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print QR Code Massal
                    </button>
                    <button
                      onClick={() => setActiveTab('COURSES')}
                      className="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      Kelola Peta &amp; Course →
                    </button>
                  </div>
                )}
              </div>

              {selectedCourse ? (
                <div className="space-y-4">
                  {selectedCourse.description && (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {selectedCourse.description}
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="text-slate-400">Lokasi Course</div>
                      <div className="font-semibold text-white mt-0.5">
                        {selectedCourse.locationName || '-(Opsional)-'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="text-slate-400">Metode Validasi</div>
                      <div className="font-mono font-semibold text-amber-300 mt-0.5">
                        {selectedCourse.validationMethod}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Radius Default: {selectedCourse.defaultGpsRadiusMeters}m
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="text-slate-400">Aturan Urutan Pos</div>
                      <div className="font-semibold text-white mt-0.5">
                        {selectedCourse.enforceOrder
                          ? 'Wajib Berurutan'
                          : 'Bebas (Score-O)'}
                      </div>
                      <div className="text-[11px] text-emerald-400 mt-0.5">
                        Total Pos: {selectedCourse.checkpoints.length} CP
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="text-slate-400">Durasi &amp; Penalti</div>
                      <div className="font-mono font-semibold text-sky-300 mt-0.5">
                        {selectedCourse.durationMinutes &&
                        selectedCourse.durationMinutes > 0
                          ? `${selectedCourse.durationMinutes} Menit`
                          : 'Tanpa Batas Waktu'}
                      </div>
                      <div className="text-[11px] text-rose-300 mt-0.5">
                        {selectedCourse.durationMinutes &&
                        selectedCourse.durationMinutes > 0 &&
                        selectedCourse.overtimePenaltyEnabled
                          ? `Penalti: -${
                              selectedCourse.overtimePenaltyPointsPerMinute || 0
                            } poin/mnt`
                          : 'Tanpa Penalti Waktu'}
                      </div>
                    </div>
                  </div>

                  {/* Info Pemusatan QR Code Massal */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="text-slate-300">
                      Seluruh QR Code resmi untuk Course ini (
                      <strong className="text-white">
                        SETUP, START, {selectedCourse.checkpoints.length} POS CP,
                        dan FINISH
                      </strong>
                      ) telah disatukan di menu cetak massal.
                    </div>
                    <button
                      type="button"
                      onClick={() => setBulkPrintCourse(selectedCourse)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold flex items-center gap-1.5 transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Buka Lembar QR Massal
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Silakan buat Course di tab Course &amp; Peta Pos.
                </p>
              )}
            </div>

            {/* Register Participant Form */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[11px] font-mono uppercase text-sky-400">
                  Registrasi Peserta &amp; PIN
                </span>
                <h3 className="text-base font-bold text-white">
                  Tambah Akun Peserta / Tim
                </h3>
              </div>
              <form
                onSubmit={handleCreateParticipant}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="block text-slate-300 mb-1">
                    Nama Peserta / Kapten *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Raka Pratama"
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">
                    Nama Tim (Wajib) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Garuda Rimba"
                    value={partTeam}
                    onChange={(e) => setPartTeam(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">
                    No. WhatsApp / Telepon (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="0812..."
                    value={partPhone}
                    onChange={(e) => setPartPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">
                    PIN Keamanan (Min. 4 Digit) *
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      minLength={4}
                      placeholder="••••"
                      value={partPin}
                      onChange={(e) => setPartPin(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>
                </div>
                {partStatusMsg && (
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-700 text-amber-300 text-[11px]">
                    {partStatusMsg}
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Simpan Akun Peserta
                </button>
              </form>

              <div className="pt-2 border-t border-slate-800">
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Daftar Peserta Terdaftar ({dashboard.participants.length})
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {dashboard.participants.map((p: ParticipantPublic) => (
                    <div
                      key={p.id}
                      className="px-2.5 py-1.5 rounded bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-amber-400 mr-2">
                          {p.bibNumber}
                        </span>
                        <span className="text-slate-200 font-medium">
                          {p.name}
                        </span>
                      </div>
                      <span className="text-[11px] text-emerald-300 font-medium">
                        {p.teamName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: UNIFIED COURSE MANAGEMENT + INTERACTIVE MAP */}
      {activeTab === 'COURSES' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 cols: Create Unified Course Form */}
            <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[11px] font-mono uppercase text-amber-400">
                  1-Step Course Setup
                </span>
                <h3 className="text-sm font-bold text-white">
                  Buat Course Baru, Durasi &amp; Aturan Penalti
                </h3>
              </div>
              <form onSubmit={handleCreateCourse} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1">
                    Nama Course *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: BARAKA SPRINT ORIENTEERING — KATEGORI UMUM"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Lokasi Lomba (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Boleh dikosongkan"
                      value={newCourseLocation}
                      onChange={(e) => setNewCourseLocation(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Tanggal Lomba *
                    </label>
                    <input
                      type="date"
                      required
                      value={newCourseDate}
                      onChange={(e) => setNewCourseDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">
                    Deskripsi / Instruksi Course (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Lintasan cepat kontrol wajib / bebas"
                    value={newCourseDescription}
                    onChange={(e) => setNewCourseDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Metode Validasi Pos
                    </label>
                    <select
                      value={newCourseValidation}
                      onChange={(e) =>
                        setNewCourseValidation(
                          e.target.value as ValidationMethod
                        )
                      }
                      className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value={ValidationMethod.QR_AND_GPS}>
                        QR + GPS Wajib Keduanya (QR_AND_GPS)
                      </option>
                      <option value={ValidationMethod.QR_ONLY}>
                        QR Code Saja (QR_ONLY)
                      </option>
                      <option value={ValidationMethod.GPS_AUTO}>
                        GPS Radius Saja (GPS_AUTO)
                      </option>
                      <option value={ValidationMethod.QR_OR_GPS}>
                        QR atau GPS Salah Satu (QR_OR_GPS)
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Radius GPS Default (m)
                    </label>
                    {newCourseValidation === ValidationMethod.QR_ONLY ? (
                      <div className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-500 font-mono text-[11px]">
                        Nonaktif (Mode QR Saja)
                      </div>
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="35"
                        value={newCourseRadiusInput}
                        onChange={(e) =>
                          setNewCourseRadiusInput(
                            sanitizeDigitsOnly(e.target.value)
                          )
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                      />
                    )}
                  </div>
                </div>

                {/* Durasi Course & Opsi Penalti Keterlambatan */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                    <Timer className="w-3.5 h-3.5" />
                    <span>Pengaturan Durasi &amp; Penalti Keterlambatan</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">
                        Durasi Course / Batas Waktu (Menit)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Kosongkan jika tanpa batas"
                        value={newCourseDurationInput}
                        onChange={(e) =>
                          setNewCourseDurationInput(
                            sanitizeDigitsOnly(e.target.value)
                          )
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-2 text-slate-200 cursor-pointer p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={newCoursePenaltyEnabled}
                          onChange={(e) =>
                            setNewCoursePenaltyEnabled(e.target.checked)
                          }
                          className="rounded border-slate-700"
                        />
                        <span>Aktifkan Penalti Terlambat</span>
                      </label>
                    </div>
                  </div>

                  {newCoursePenaltyEnabled && (
                    <div>
                      <label className="block text-rose-300 text-[11px] mb-1">
                        Pengurangan Poin tiap Menit Keterlambatan (Poin / Menit)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Contoh: 10"
                        value={newCoursePenaltyInput}
                        onChange={(e) =>
                          setNewCoursePenaltyInput(
                            sanitizeDigitsOnly(e.target.value)
                          )
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-rose-500/40 text-rose-200 font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                    <input
                      type="checkbox"
                      checked={newCourseEnforceOrder}
                      onChange={(e) =>
                        setNewCourseEnforceOrder(e.target.checked)
                      }
                      className="rounded border-slate-700"
                    />
                    <span>Wajib Urut (Point-to-Point)</span>
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                    <input
                      type="checkbox"
                      checked={newCourseScoring}
                      onChange={(e) => setNewCourseScoring(e.target.checked)}
                      className="rounded border-slate-700"
                    />
                    <span>Gunakan Sistem Poin</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Buat Course Baru
                </button>
              </form>
            </div>

            {/* Right 7 cols: Existing Courses List */}
            <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase text-emerald-400">
                    Daftar Course Aktif
                  </span>
                  <h3 className="text-sm font-bold text-white">
                    Pilih Course untuk Edit, Hapus, Kelola Peta Pos &amp; Print QR
                    Massal
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {dashboard.courses.length} Course
                </span>
              </div>

              {dashboard.courses.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
                  Belum ada Course. Silakan buat Course baru melalui formulir di
                  sebelah kiri.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {dashboard.courses.map((c: Course) => {
                    const isSelected = selectedCourse?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCourseId(c.id);
                          setIsEditingCourse(false);
                          setEditingCheckpointId(null);
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/50 text-white'
                            : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-white">
                              {c.name}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              {c.checkpoints.length} CP
                            </span>
                            {c.durationMinutes && c.durationMinutes > 0 ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                                ⏱ {c.durationMinutes}m
                                {c.overtimePenaltyEnabled &&
                                c.overtimePenaltyPointsPerMinute
                                  ? ` (-${c.overtimePenaltyPointsPerMinute}pts/m)`
                                  : ''}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                            {c.locationName && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-500" />
                                {c.locationName}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {c.date}
                            </span>
                            <span className="font-mono text-amber-300/90">
                              Validasi: {c.validationMethod} (
                              {c.defaultGpsRadiusMeters}m)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCourseId(c.id);
                              handleStartEditCourse(c);
                            }}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition"
                            title="Edit Course Ini"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteCourse(c);
                            }}
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition"
                            title="Hapus Course Ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBulkPrintCourse(c);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print QR Massal
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row: Selected Course Active Management, Map Planner & Checkpoint Table */}
          {selectedCourse && effectiveSelectedCourse && (
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
              {/* Header Course Aktif + Tombol Edit Course, Hapus Course & Print QR Massal */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      {effectiveSelectedCourse.locationName
                        ? `${effectiveSelectedCourse.locationName} (${effectiveSelectedCourse.date})`
                        : effectiveSelectedCourse.date}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Validasi: {effectiveSelectedCourse.validationMethod}
                      {effectiveSelectedCourse.validationMethod !==
                      ValidationMethod.QR_ONLY
                        ? ` • Radius Default: ${effectiveSelectedCourse.defaultGpsRadiusMeters}m`
                        : ' (Tanpa Radius GPS)'}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                      {effectiveSelectedCourse.enforceOrder
                        ? 'Wajib Urut (Garis Alur Aktif)'
                        : 'Urutan Bebas (Tanpa Garis Alur)'}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                      {effectiveSelectedCourse.durationMinutes &&
                      effectiveSelectedCourse.durationMinutes > 0
                        ? `Durasi: ${effectiveSelectedCourse.durationMinutes} Menit${
                            effectiveSelectedCourse.overtimePenaltyEnabled
                              ? ` • Penalti Telat: -${
                                  effectiveSelectedCourse.overtimePenaltyPointsPerMinute ||
                                  0
                                } pts/mnt`
                              : ' (Tanpa Penalti)'
                          }`
                        : 'Tanpa Batas Durasi'}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1">
                    {effectiveSelectedCourse.name}
                  </h2>
                </div>

                {/* Action Buttons: Edit Course, Delete Course, and Bulk Print QR */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      isEditingCourse
                        ? setIsEditingCourse(false)
                        : handleStartEditCourse(selectedCourse)
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-semibold text-xs transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {isEditingCourse ? 'Tutup Edit Course' : 'Edit Course'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCourse(selectedCourse)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold text-xs transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Course
                  </button>

                  <button
                    type="button"
                    onClick={() => setBulkPrintCourse(effectiveSelectedCourse)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/10 transition"
                  >
                    <Printer className="w-4 h-4" />
                    Print QR Code Massal (2 - 8 QR / Halaman)
                  </button>
                </div>
              </div>

              {/* Panel Edit Course Aktif (Muncul saat tombol Edit Course ditekan) */}
              {isEditingCourse && (
                <form
                  onSubmit={handleSaveEditCourse}
                  className="p-4 rounded-xl bg-sky-950/20 border border-sky-500/40 space-y-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-2">
                    <div className="font-bold text-sky-300 flex items-center gap-2 text-sm">
                      <Edit3 className="w-4 h-4" />
                      Edit / Update Pengaturan Course Aktif ({selectedCourse.name})
                    </div>
                    <span className="text-[11px] text-emerald-300 font-mono">
                      ⚡ Pratinjau Peta Real-Time Aktif • Kode QR Tetap Aman
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Nama Course *
                      </label>
                      <input
                        type="text"
                        required
                        value={editCourseName}
                        onChange={(e) => setEditCourseName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Lokasi Lomba (Opsional)
                      </label>
                      <input
                        type="text"
                        placeholder="Boleh dikosongkan"
                        value={editCourseLocation}
                        onChange={(e) => setEditCourseLocation(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Tanggal Lomba *
                      </label>
                      <input
                        type="date"
                        required
                        value={editCourseDate}
                        onChange={(e) => setEditCourseDate(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Deskripsi Course (Opsional)
                      </label>
                      <input
                        type="text"
                        value={editCourseDescription}
                        onChange={(e) =>
                          setEditCourseDescription(e.target.value)
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Metode Validasi Pos
                      </label>
                      <select
                        value={editCourseValidation}
                        onChange={(e) =>
                          setEditCourseValidation(
                            e.target.value as ValidationMethod
                          )
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                      >
                        <option value={ValidationMethod.QR_AND_GPS}>
                          QR + GPS Wajib Keduanya (QR_AND_GPS)
                        </option>
                        <option value={ValidationMethod.QR_ONLY}>
                          QR Code Saja (QR_ONLY)
                        </option>
                        <option value={ValidationMethod.GPS_AUTO}>
                          GPS Radius Saja (GPS_AUTO)
                        </option>
                        <option value={ValidationMethod.QR_OR_GPS}>
                          QR atau GPS Salah Satu (QR_OR_GPS)
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Radius GPS Default (m)
                      </label>
                      {editCourseValidation === ValidationMethod.QR_ONLY ? (
                        <div className="w-full px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-500 font-mono text-[11px]">
                          Nonaktif (Mode QR Saja — Tanpa Lingkaran Radius)
                        </div>
                      ) : (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="35"
                          value={editCourseRadiusInput}
                          onChange={(e) =>
                            setEditCourseRadiusInput(
                              sanitizeDigitsOnly(e.target.value)
                            )
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-amber-300 mb-1">
                        Durasi Course / Batas Waktu (Menit)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Kosongkan jika tanpa batas"
                        value={editCourseDurationInput}
                        onChange={(e) =>
                          setEditCourseDurationInput(
                            sanitizeDigitsOnly(e.target.value)
                          )
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-2 text-slate-200 cursor-pointer p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={editCoursePenaltyEnabled}
                          onChange={(e) =>
                            setEditCoursePenaltyEnabled(e.target.checked)
                          }
                          className="rounded border-slate-700"
                        />
                        <span>Aktifkan Penalti Keterlambatan</span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-rose-300 mb-1">
                        Pengurangan Poin / Menit Terlambat
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={!editCoursePenaltyEnabled}
                        placeholder="10"
                        value={editCoursePenaltyInput}
                        onChange={(e) =>
                          setEditCoursePenaltyInput(
                            sanitizeDigitsOnly(e.target.value)
                          )
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono disabled:opacity-40"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-sky-500/20">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editCourseEnforceOrder}
                          onChange={(e) =>
                            setEditCourseEnforceOrder(e.target.checked)
                          }
                          className="rounded border-slate-700"
                        />
                        <span>Wajib Urut (Point-to-Point)</span>
                      </label>
                      <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editCourseScoring}
                          onChange={(e) =>
                            setEditCourseScoring(e.target.checked)
                          }
                          className="rounded border-slate-700"
                        />
                        <span>Gunakan Sistem Poin</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingCourse(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold flex items-center gap-1.5 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Simpan Perubahan Course
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* PETA INTERAKTIF PERANCANG TITIK START (🔺), CHECKPOINT (⭕), DAN FINISH (◎) */}
              <CourseMapPlanner
                course={effectiveSelectedCourse}
                draftCpCode={cpCode}
                draftCpName={cpName}
                draftCpLat={cpLat}
                draftCpLng={cpLng}
                draftCpRadiusMeters={
                  Number(cpRadiusInput) ||
                  effectiveSelectedCourse.defaultGpsRadiusMeters ||
                  35
                }
                editingCheckpointId={editingCheckpointId}
                onPickCpCoordinates={(lat, lng) => {
                  setCpLat(String(lat));
                  setCpLng(String(lng));
                }}
                onUpdateStartLocation={handleUpdateStartLocation}
                onUpdateFinishLocation={handleUpdateFinishLocation}
                onSelectCheckpointForEdit={handleSelectCheckpointForEdit}
              />

              {/* Form Tambah / Edit Checkpoint (Nama Lokasi Pos Opsional, Poin & Radius Tanpa Sisa 0) */}
              <form
                onSubmit={handleSaveCheckpoint}
                className={`p-4 rounded-xl border space-y-3 text-xs transition ${
                  editingCheckpointId
                    ? 'bg-amber-950/20 border-amber-500/50'
                    : 'bg-slate-900/70 border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-200 flex items-center gap-2">
                    {editingCheckpointId ? (
                      <>
                        <Edit3 className="w-4 h-4 text-amber-400" />
                        <span className="text-amber-300 font-bold">
                          Mode Edit Pos ({cpCode}) — Klik di peta jika ingin
                          menggeser titik koordinatnya
                        </span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 text-amber-400" />
                        <span>
                          Tambah Checkpoint (Pos Kontrol) ke{' '}
                          {effectiveSelectedCourse.name}
                        </span>
                      </>
                    )}
                  </div>
                  {editingCheckpointId && (
                    <button
                      type="button"
                      onClick={handleCancelEditCheckpoint}
                      className="text-xs text-slate-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 border border-slate-700"
                    >
                      <X className="w-3.5 h-3.5" /> Batal Edit Pos
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Kode Pos *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="CP1"
                      value={cpCode}
                      onChange={(e) => setCpCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 mb-1">
                      Nama Lokasi Pos (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Boleh dikosongkan"
                      value={cpName}
                      onChange={(e) => setCpName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Poin</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="100"
                      value={cpPointsInput}
                      onChange={(e) =>
                        setCpPointsInput(sanitizeDigitsOnly(e.target.value))
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Latitude (Klik Peta)
                    </label>
                    <input
                      type="text"
                      value={cpLat}
                      onChange={(e) => setCpLat(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Longitude (Klik Peta)
                    </label>
                    <input
                      type="text"
                      value={cpLng}
                      onChange={(e) => setCpLng(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  {effectiveSelectedCourse.validationMethod !==
                  ValidationMethod.QR_ONLY ? (
                    <>
                      <span className="text-slate-400 whitespace-nowrap">
                        Radius Validasi GPS (m):
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="35"
                        value={cpRadiusInput}
                        onChange={(e) =>
                          setCpRadiusInput(sanitizeDigitsOnly(e.target.value))
                        }
                        className="w-24 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                      />
                    </>
                  ) : (
                    <span className="text-[11px] font-mono text-slate-500">
                      Validasi QR Saja (Tanpa Radius GPS)
                    </span>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold whitespace-nowrap transition"
                  >
                    {editingCheckpointId
                      ? 'Simpan Perubahan Pos'
                      : '+ Tambah Pos ke Peta'}
                  </button>
                </div>
              </form>

              {/* Tabel Daftar Pos Checkpoint (Tanpa kolom QR Secret Payload — terpusat di Print QR Massal) */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                      <th className="py-2.5 px-3">Urutan</th>
                      <th className="py-2.5 px-3">Simbol &amp; Kode Pos</th>
                      <th className="py-2.5 px-3">Nama Lokasi (Opsional)</th>
                      <th className="py-2.5 px-3">Poin</th>
                      <th className="py-2.5 px-3">
                        {effectiveSelectedCourse.validationMethod !==
                        ValidationMethod.QR_ONLY
                          ? 'Koordinat GPS & Radius'
                          : 'Koordinat Peta'}
                      </th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {selectedCourse.checkpoints.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-6 text-center text-slate-400"
                        >
                          Belum ada pos checkpoint. Klik titik pada peta di atas
                          lalu tekan <strong>+ Tambah Pos ke Peta</strong>.
                        </td>
                      </tr>
                    ) : (
                      selectedCourse.checkpoints.map((cp: Checkpoint) => {
                        const isBeingEdited = editingCheckpointId === cp.id;
                        return (
                          <tr
                            key={cp.id}
                            className={`transition ${
                              isBeingEdited
                                ? 'bg-amber-500/10'
                                : 'hover:bg-slate-900/40'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              #{cp.orderIndex}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1.5 font-mono font-bold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/30 px-2 py-0.5 rounded">
                                <span>⭕</span>
                                <span>{cp.code}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              {cp.name ? (
                                <span className="font-medium text-white">
                                  {cp.name}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">
                                  - (Tanpa nama lokasi) -
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">
                              {cp.points} pts
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">
                              {cp.latitude.toFixed(5)},{' '}
                              {cp.longitude.toFixed(5)}{' '}
                              {effectiveSelectedCourse.validationMethod !==
                              ValidationMethod.QR_ONLY ? (
                                <span className="text-slate-500">
                                  (Radius: {cp.radiusMeters}m)
                                </span>
                              ) : (
                                <span className="text-slate-500">
                                  (QR Saja)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectCheckpointForEdit(cp)
                                  }
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[11px] font-medium inline-flex items-center gap-1"
                                  title="Edit Checkpoint"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCheckpoint(cp.id)}
                                  className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                  title="Hapus Checkpoint"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LIVE MONITORING */}
      {activeTab === 'MONITORING' && dashboard && (
        <div className="space-y-6">
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-mono uppercase text-emerald-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  Real-Time Telemetry &amp; Last Known Position (~5 Menit)
                </span>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  Pemantauan Peserta Aktif di Lapangan
                </h2>
              </div>
              <div className="text-xs text-slate-400">
                Hanya menyimpan{' '}
                <strong className="text-slate-200">
                  1 posisi terakhir per sesi
                </strong>{' '}
                (berjalan otomatis di latar belakang perangkat peserta).
              </div>
            </div>

            {dashboard.sessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Belum ada peserta yang memuat Course (Scan Setup QR).
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboard.sessions
                  .filter(
                    (s: ParticipantSession) =>
                      !selectedCourse || s.courseId === selectedCourse.id
                  )
                  .map((sess: ParticipantSession) => {
                    const participant = dashboard.participants.find(
                      (p: ParticipantPublic) => p.id === sess.participantId
                    );
                    const course = dashboard.courses.find(
                      (c: Course) => c.id === sess.courseId
                    );
                    const liveElapsedSec =
                      sess.status === SessionStatus.FINISHED
                        ? sess.durationSeconds
                        : sess.status === SessionStatus.ACTIVE && sess.startedAt
                        ? Math.max(
                            0,
                            Math.floor(
                              (nowTick - Date.parse(sess.startedAt)) / 1000
                            )
                          )
                        : undefined;

                    const isOvertime = Boolean(
                      course?.durationMinutes &&
                        course.durationMinutes > 0 &&
                        liveElapsedSec !== undefined &&
                        liveElapsedSec > course.durationMinutes * 60
                    );

                    const isLocationStale =
                      sess.status === SessionStatus.ACTIVE &&
                      (!sess.lastLocation ||
                        nowTick - Date.parse(sess.lastLocation.measuredAt) >
                          6 * 60 * 1000);

                    return (
                      <div
                        key={sess.id}
                        className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-amber-400 text-sm">
                                {participant?.bibNumber || '?'}
                              </span>
                              <span className="font-bold text-white text-sm">
                                {participant?.name || 'Peserta'}
                              </span>
                              <span className="text-xs text-emerald-300 font-medium">
                                ({participant?.teamName || '-'})
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Course:{' '}
                              <span className="text-slate-200 font-medium">
                                {course?.name || sess.courseId}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {sess.attemptNumber && sess.attemptNumber > 1 && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                                Attempt #{sess.attemptNumber}
                              </span>
                            )}
                            {isOvertime && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                                OVERTIME
                              </span>
                            )}
                            <span
                              className={`text-[11px] font-mono px-2.5 py-1 rounded font-semibold ${
                                sess.status === SessionStatus.ACTIVE
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : sess.status === SessionStatus.FINISHED
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {sess.status}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                            <div className="text-slate-400 text-[11px]">
                              Waktu Berjalan
                            </div>
                            <div
                              className={`font-mono font-bold text-sm mt-0.5 flex items-center gap-1 ${
                                isOvertime ? 'text-rose-400' : 'text-white'
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              {formatElapsedSeconds(liveElapsedSec)}
                            </div>
                          </div>
                          <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                            <div className="text-slate-400 text-[11px]">
                              Pos Tervalidasi
                            </div>
                            <div className="font-mono font-bold text-sm text-emerald-400 mt-0.5">
                              {sess.validatedCheckpointIds.length} /{' '}
                              {course?.checkpoints.length || 0} CP
                            </div>
                          </div>
                          <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                            <div className="text-slate-400 text-[11px]">
                              Skor Bersih
                            </div>
                            <div className="font-mono font-bold text-sm text-amber-400 mt-0.5">
                              {sess.totalScore} pts
                            </div>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <Navigation
                              className={`w-4 h-4 shrink-0 ${
                                sess.lastLocation
                                  ? 'text-sky-400'
                                  : 'text-slate-600'
                              }`}
                            />
                            {sess.lastLocation ? (
                              <div>
                                <div className="font-mono text-slate-200">
                                  {sess.lastLocation.latitude.toFixed(5)},{' '}
                                  {sess.lastLocation.longitude.toFixed(5)}
                                  {sess.lastLocation.accuracyMeters
                                    ? ` (±${Math.round(
                                        sess.lastLocation.accuracyMeters
                                      )}m)`
                                    : ''}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Diperbarui:{' '}
                                  {formatTimeAgo(sess.lastLocation.measuredAt)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500">
                                Belum ada laporan posisi GPS dari perangkat
                                peserta
                              </span>
                            )}
                          </div>

                          {isLocationStale && (
                            <span
                              className="flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded"
                              title="Lebih dari 6 menit belum ada update lokasi berkala"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              &gt;5m
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: RESULT & LEADERBOARD */}
      {activeTab === 'RESULT' && dashboard && (
        <div className="space-y-6">
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-mono uppercase text-amber-400">
                  Official Race Leaderboard
                </span>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  Hasil Lomba &amp; Peringkat (
                  {selectedCourse?.name || 'Semua Course'})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Urutan peringkat: Status (FINISHED prioritas utama) → Skor
                  Akhir Bersih (setelah dikurangi penalti keterlambatan) → Waktu
                  tempuh tercepat.
                </p>
              </div>

              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export Hasil (CSV)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                    <th className="py-3 px-3">Rank</th>
                    <th className="py-3 px-3">BIB &amp; Peserta</th>
                    <th className="py-3 px-3">Nama Tim</th>
                    <th className="py-3 px-3">Course</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Pos Valid</th>
                    <th className="py-3 px-3">Poin Pos</th>
                    <th className="py-3 px-3">Penalti Waktu</th>
                    <th className="py-3 px-3">Total Skor Akhir</th>
                    <th className="py-3 px-3">Waktu Tempuh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leaderboardRows.map((row) => (
                    <tr key={row.sessionId} className="hover:bg-slate-900/40">
                      <td className="py-3 px-3 font-mono font-bold text-amber-400">
                        #{row.rank}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-slate-300 mr-2">
                          {row.bibNumber}
                        </span>
                        <span className="font-semibold text-white">
                          {row.participantName}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-emerald-300 font-medium">
                        {row.teamName}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        <div>{row.courseName}</div>
                        {row.attemptNumber && row.attemptNumber > 1 ? (
                          <span className="inline-block mt-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Attempt #{row.attemptNumber} (Re-run)
                          </span>
                        ) : (
                          <span className="inline-block mt-0.5 text-[10px] font-mono text-slate-500">
                            Attempt #1 (Utama)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                            row.status === SessionStatus.FINISHED
                              ? 'bg-amber-500/20 text-amber-300'
                              : row.status === SessionStatus.ACTIVE
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-200">
                        {row.checkpointsCompleted} / {row.totalCheckpoints} CP
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {row.grossScore} pts
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {row.overtimeMinutes > 0 ? (
                          <span className="text-rose-400 font-semibold">
                            -{row.penaltyPoints} pts ({row.overtimeMinutes}m)
                          </span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-400 text-sm">
                        {row.totalScore} pts
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-white">
                        {formatElapsedSeconds(row.durationSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: KELOLA AKUN ORGANIZER (KHUSUS SUPERADMIN) */}
      {activeTab === 'ORGANIZERS' &&
        dashboard &&
        dashboard.currentOrganizer?.isSuperAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Buat Akun Organizer Baru */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <span className="text-[11px] font-mono uppercase text-purple-400">
                  Otoritas Superadmin
                </span>
                <h2 className="text-base font-bold text-white mt-0.5">
                  Buat Akun Login Organizer Baru
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Organizer yang dibuat di sini hanya dapat melihat &amp; mengelola
                  Course yang ia buat sendiri serta peserta yang ikut di Course
                  buatannya. Organizer bisa login cukup dengan{' '}
                  <strong className="text-slate-200">PIN saja</strong> atau{' '}
                  <strong className="text-slate-200">Username + PIN</strong>.
                </p>
              </div>

              <form
                onSubmit={handleCreateOrganizerAccount}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Panitia / Organizer{' '}
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={orgNameInput}
                    onChange={(e) => setOrgNameInput(e.target.value)}
                    placeholder="Contoh: Panitia Cabang Bandung"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Username Login{' '}
                    <span className="text-slate-500 font-normal">
                      (Opsional — Otomatis jika kosong)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={orgUsernameInput}
                    onChange={(e) => setOrgUsernameInput(e.target.value)}
                    placeholder="Contoh: panitiabandung"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Klub / Instansi / Kepanitiaan
                  </label>
                  <input
                    type="text"
                    value={orgOrganizationInput}
                    onChange={(e) => setOrgOrganizationInput(e.target.value)}
                    placeholder="Contoh: FONI Pengcab Bandung"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    PIN Login Organizer (Unik, min. 4 karakter){' '}
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={orgPinInput}
                    onChange={(e) => setOrgPinInput(e.target.value)}
                    placeholder="Contoh: 7788"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-400"
                  />
                </div>

                {orgManageMsg && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {orgManageMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Buat Akun Organizer
                </button>
              </form>
            </div>

            {/* Daftar Akun Organizer */}
            <div className="lg:col-span-2 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase text-amber-400">
                    Daftar Penyelenggara Terdaftar
                  </span>
                  <h2 className="text-base font-bold text-white">
                    Manajemen Akun Organizer ({dashboard.organizers?.length || 0}{' '}
                    Akun)
                  </h2>
                </div>
              </div>

              {!dashboard.organizers || dashboard.organizers.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl">
                  Belum ada akun Organizer tambahan. Gunakan formulir di sebelah
                  kiri untuk membuat akun login bagi panitia/organizer.
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.organizers.map((org) => {
                    const orgCourses = dashboard.courses.filter(
                      (c) => c.createdByOrganizerId === org.id
                    );
                    const orgCourseIds = new Set(orgCourses.map((c) => c.id));
                    const orgSessionsCount = dashboard.sessions.filter((s) =>
                      orgCourseIds.has(s.courseId)
                    ).length;

                    return (
                      <div
                        key={org.id}
                        className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              {org.code}
                            </span>
                            <span className="font-bold text-white text-sm">
                              {org.name}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                org.isActive
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {org.isActive ? 'AKTIF' : 'NONAKTIF / DIBEKUKAN'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                            <span>
                              Username:{' '}
                              <code className="text-slate-200 font-mono">
                                {org.username}
                              </code>
                            </span>
                            {org.organization && (
                              <span>• Instansi: {org.organization}</span>
                            )}
                            <span>
                              • Course Dibuat:{' '}
                              <strong className="text-amber-300">
                                {orgCourses.length}
                              </strong>
                            </span>
                            <span>
                              • Sesi Peserta:{' '}
                              <strong className="text-emerald-300">
                                {orgSessionsCount}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {resetPinOrgId === org.id ? (
                            <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-700">
                              <input
                                type="text"
                                value={resetPinValue}
                                onChange={(e) => setResetPinValue(e.target.value)}
                                placeholder="PIN Baru..."
                                className="w-24 px-2 py-1 rounded bg-slate-900 text-white text-xs font-mono focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveResetOrganizerPin(org.id)}
                                className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setResetPinOrgId(null);
                                  setResetPinValue('');
                                }}
                                className="p-1 text-slate-400 hover:text-white"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setResetPinOrgId(org.id);
                                setResetPinValue('');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
                            >
                              Ubah PIN
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleOrganizerActive(org)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                              org.isActive
                                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {org.isActive ? 'Bekukan' : 'Aktifkan'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteOrganizerAccount(org)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                            title="Hapus Akun Organizer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      {/* Modal Konfirmasi Hapus Course */}
      {confirmDeleteCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400">
                  Konfirmasi Hapus Course
                </span>
                <h3 className="text-base font-bold text-white">
                  Hapus Course "{confirmDeleteCourse.name}"?
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tindakan ini akan menghapus Course{' '}
              <strong className="text-white">{confirmDeleteCourse.name}</strong>{' '}
              beserta{' '}
              <strong className="text-white">
                {confirmDeleteCourse.checkpoints.length} pos checkpoint
              </strong>{' '}
              dan riwayat sesi peserta pada Course ini.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteCourse(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCourse}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
              >
                Ya, Hapus Course Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Print QR Modal (2 to 8 QR per page — Satu-satunya pintu cetak semua QR) */}
      {bulkPrintCourse && (
        <BulkQrPrintModal
          course={bulkPrintCourse}
          onClose={() => setBulkPrintCourse(null)}
        />
      )}
    </div>
  );
}
