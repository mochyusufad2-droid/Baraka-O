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
  Maximize2,
  Database,
  Download,
  Upload,
  Share2,
  KeyRound,
  ExternalLink,
  Infinity as InfinityIcon,
  Sliders,
  Layers,
  FileText,
  Building2,
  Eye,
  Unlock,
  Flag,
} from 'lucide-react';
import {
  AllTimePlatformStats,
  Course,
  CourseRaceMode,
  Checkpoint,
  CheckpointReport,
  GeoPointLocation,
  ORIENTEERING_AGE_GROUPS,
  ORIENTEERING_GENDER_OPTIONS,
  OrganizerPublic,
  OrganizerVaultBackup,
  ParticipantPublic,
  ParticipantSession,
  RelayDnfScoringMode,
  SessionStatus,
  ValidationMethod,
} from '../../types';
import { BulkQrPrintModal, CourseInfoSheetModal } from './QrPrintModals';
import { CourseMapPlanner } from './CourseMapPlanner';
import {
  LiveMonitoringMap,
  resolveSessionPositionOnCourse,
} from './LiveMonitoringMap';
import { SpectatorLiveLeaderboardModal } from './SpectatorLiveLeaderboardModal';
import { ShareSpectatorLiveModal } from './ShareSpectatorLiveModal';
import { EditOrganizerQuotaModal } from './EditOrganizerQuotaModal';
import {
  SuperAdminGlobalOverviewBlocks,
  ParticipantDetailModal,
} from './SuperAdminExplorerPanel';
import { syncCourseToFirestore } from '../../firebase';
import {
  clearPersistedParticipantState,
  loadOrganizerVaultBackup,
  mergeAndSaveOrganizerVaultBackup,
  mergeCourseSmart,
  mergeSessionMonotonically,
  removeCourseFromOrganizerBackup,
  removeOrganizerFromVaultBackup,
  removeParticipantsFromVaultBackup,
  removeSessionFromVaultBackup,
  saveOrganizerCoursesBackup,
} from '../../services/offlineQueue';

interface DashboardApiData {
  serverTime: string;
  currentOrganizer?: OrganizerPublic;
  organizers?: OrganizerPublic[];
  courses: Course[];
  participants: ParticipantPublic[];
  deletedParticipantIds?: string[];
  sessions: ParticipantSession[];
  deletedSessionIds?: string[];
  reports: CheckpointReport[];
  vaultSnapshot?: OrganizerVaultBackup;
  allTimeStats?: AllTimePlatformStats;
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

function formatExpirationStatus(expiresAt?: string | null): {
  label: string;
  isExpired: boolean;
  colorClass: string;
} {
  if (!expiresAt) {
    return {
      label: 'Lifetime (Selamanya)',
      isExpired: false,
      colorClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    };
  }
  const expTime = new Date(expiresAt).getTime();
  const diffDays = Math.ceil((expTime - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return {
      label: 'Expired (Kedaluwarsa)',
      isExpired: true,
      colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    };
  }
  if (diffDays <= 7) {
    return {
      label: `Sisa ${diffDays} hari`,
      isExpired: false,
      colorClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    };
  }
  return {
    label: `Sisa ${diffDays} hari (${new Date(expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })})`,
    isExpired: false,
    colorClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  };
}

const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatEntryDateTimeParts(isoString?: string): {
  dateLabel: string;
  timeLabel: string;
} {
  if (!isoString) {
    return { dateLabel: '-', timeLabel: '-' };
  }
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    return { dateLabel: '-', timeLabel: '-' };
  }
  const day = d.getDate();
  const month = MONTH_NAMES_EN[d.getMonth()] || '';
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return {
    dateLabel: `${day}${getOrdinalSuffix(day)} ${month} ${year}`,
    timeLabel: `${hours}:${minutes}`,
  };
}

function formatShortCheckpointCode(code?: string, fallbackIndex?: number): string {
  if (!code) return fallbackIndex ? String(fallbackIndex) : '-';
  const trimmed = code.trim();
  const cpNumericMatch = /^CP[-_]?(\d+)$/i.exec(trimmed);
  if (cpNumericMatch) {
    return cpNumericMatch[1];
  }
  return trimmed;
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
  const [pinInput, setPinInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<OrganizerTab>('OVERVIEW');
  const [dashboard, setDashboard] = useState<DashboardApiData | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [bulkPrintCourse, setBulkPrintCourse] = useState<Course | null>(null);
  const [infoSheetCourse, setInfoSheetCourse] = useState<Course | null>(null);
  const [isSuperAdminEmergencyMode, setIsSuperAdminEmergencyMode] =
    useState<boolean>(false);
  const [isConfirmEmergencyOpen, setIsConfirmEmergencyOpen] =
    useState<boolean>(false);

  // State Filter Organizer di Bar Atas (Khusus Superadmin) & Pop-Up Detail Peserta
  const [selectedOrganizerFilter, setSelectedOrganizerFilter] =
    useState<string>('ALL');
  const [detailModalParticipant, setDetailModalParticipant] =
    useState<ParticipantPublic | null>(null);
  const [detailModalSessionId, setDetailModalSessionId] = useState<
    string | null
  >(null);

  // Otomatis hilangkan banner pemberitahuan setelah 4 detik (Auto-Dismiss)
  useEffect(() => {
    if (!successMsg) return;
    const timer = window.setTimeout(() => {
      setSuccessMsg(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [successMsg]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = window.setTimeout(() => {
      setErrorMsg(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [errorMsg]);

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
  const [newCourseAllowMap, setNewCourseAllowMap] = useState<boolean>(true);
  const [newCourseDurationInput, setNewCourseDurationInput] = useState<string>('60');
  const [newCoursePenaltyEnabled, setNewCoursePenaltyEnabled] = useState<boolean>(true);
  const [newCoursePenaltyInput, setNewCoursePenaltyInput] = useState<string>('10');
  const [newCourseRaceMode, setNewCourseRaceMode] = useState<CourseRaceMode>(
    CourseRaceMode.REGULAR
  );
  const [newCourseRelaySubTeamCount, setNewCourseRelaySubTeamCount] = useState<string>('3');
  const [newCourseRelayEnforceSeq, setNewCourseRelayEnforceSeq] = useState<boolean>(true);
  const [newCourseRelayDnfMode, setNewCourseRelayDnfMode] = useState<RelayDnfScoringMode>(
    RelayDnfScoringMode.PARTIAL_WITH_PENALTY
  );
  const [newCourseRelayDnfPenalty, setNewCourseRelayDnfPenalty] = useState<string>('100');

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
  const [editCourseAllowMap, setEditCourseAllowMap] = useState<boolean>(true);
  const [editCourseDurationInput, setEditCourseDurationInput] = useState<string>('');
  const [editCoursePenaltyEnabled, setEditCoursePenaltyEnabled] = useState<boolean>(false);
  const [editCoursePenaltyInput, setEditCoursePenaltyInput] = useState<string>('10');
  const [editCourseRaceMode, setEditCourseRaceMode] = useState<CourseRaceMode>(
    CourseRaceMode.REGULAR
  );
  const [editCourseRelaySubTeamCount, setEditCourseRelaySubTeamCount] = useState<string>('3');
  const [editCourseRelayEnforceSeq, setEditCourseRelayEnforceSeq] = useState<boolean>(true);
  const [editCourseRelayDnfMode, setEditCourseRelayDnfMode] = useState<RelayDnfScoringMode>(
    RelayDnfScoringMode.ZERO
  );
  const [editCourseRelayDnfPenalty, setEditCourseRelayDnfPenalty] = useState<string>('0');

  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState<Course | null>(null);
  const [focusedMonitoringSessionId, setFocusedMonitoringSessionId] = useState<string | null>(null);

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

  // Form States for Participant Creation & Deletion by Organizer
  const [partName, setPartName] = useState('');
  const [partTeam, setPartTeam] = useState('');
  const [partGender, setPartGender] = useState<string>('Other');
  const [partAgeGroup, setPartAgeGroup] = useState<string>('Semua Umur');
  const [partPhone, setPartPhone] = useState('');
  const [partPin, setPartPin] = useState('');
  const [partStatusMsg, setPartStatusMsg] = useState<string | null>(null);
  const [confirmDeleteParticipant, setConfirmDeleteParticipant] =
    useState<ParticipantPublic | null>(null);
  const [confirmBulkDeleteScope, setConfirmBulkDeleteScope] = useState<
    'ALL' | 'SELF_REGISTERED' | 'OWN' | null
  >(null);
  const [isDeletingParticipants, setIsDeletingParticipants] = useState<boolean>(false);

  // Result View Options: With Split (Detail) vs Without Split (Ringkas) + Filters + Relay View
  const [showResultSplits, setShowResultSplits] = useState<boolean>(true);
  const [resultGenderFilter, setResultGenderFilter] = useState<string>('ALL');
  const [resultAgeGroupFilter, setResultAgeGroupFilter] = useState<string>('ALL');
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [isSpectatorFullscreen, setIsSpectatorFullscreen] = useState<boolean>(false);
  const [relayResultViewMode, setRelayResultViewMode] = useState<'ACCUMULATED' | 'SUBTEAMS'>(
    'ACCUMULATED'
  );
  const [relayOverrideTarget, setRelayOverrideTarget] = useState<{
    sessionId: string;
    teamLabel: string;
    parentTeamName?: string;
    legIndex?: number;
    status: SessionStatus;
    isDnf?: boolean;
    relayOverrideUnlocked?: boolean;
  } | null>(null);
  const [relayOverrideAction, setRelayOverrideAction] = useState<
    'UNLOCK_LEG' | 'FORCE_FINISH' | 'FORCE_DNF'
  >('UNLOCK_LEG');
  const [relayOverrideReason, setRelayOverrideReason] = useState<string>('');
  const [isExecutingRelayOverride, setIsExecutingRelayOverride] = useState<boolean>(false);

  // Full Database Backup & Restore States (Migrasi Mandiri)
  const [isExportingDb, setIsExportingDb] = useState<boolean>(false);
  const [isDownloadingCpanelBundle, setIsDownloadingCpanelBundle] = useState<boolean>(false);
  const [isRestoringDb, setIsRestoringDb] = useState<boolean>(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<any | null>(null);
  const [restoreStats, setRestoreStats] = useState<{
    coursesCount: number;
    participantsCount: number;
    sessionsCount: number;
    exportedAt?: string;
  } | null>(null);

  // Form States for Superadmin Organizer Account Creation & Management
  const [orgNameInput, setOrgNameInput] = useState('');
  const [orgUsernameInput, setOrgUsernameInput] = useState('');
  const [orgOrganizationInput, setOrgOrganizationInput] = useState('');
  const [orgPinInput, setOrgPinInput] = useState('');
  const [orgMaxCoursesInput, setOrgMaxCoursesInput] = useState<string>('3');
  const [orgIsUnlimited, setOrgIsUnlimited] = useState<boolean>(false);
  const [orgDurationMonths, setOrgDurationMonths] = useState<string>('3');
  const [selectedEditOrg, setSelectedEditOrg] = useState<OrganizerPublic | null>(null);
  const [orgManageMsg, setOrgManageMsg] = useState<string | null>(null);
  const [resetPinOrgId, setResetPinOrgId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState<string>('');

  // Live Spectator Link States
  const [shareSpectatorCourse, setShareSpectatorCourse] = useState<Course | null>(null);
  const [copiedLiveCourseId, setCopiedLiveCourseId] = useState<string | null>(null);

  // Superadmin Account Credential States (Ganti Username & Password)
  const [superCurrentPin, setSuperCurrentPin] = useState<string>('');
  const [superNewUsername, setSuperNewUsername] = useState<string>('');
  const [superNewPin, setSuperNewPin] = useState<string>('');
  const [superCredLoading, setSuperCredLoading] = useState<boolean>(false);
  const [superCredMsg, setSuperCredMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Organizer Self-Service Change Password Modal States
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState<boolean>(false);
  const [changePassCurrent, setChangePassCurrent] = useState<string>('');
  const [changePassNew, setChangePassNew] = useState<string>('');
  const [changePassConfirm, setChangePassConfirm] = useState<string>('');
  const [changePassLoading, setChangePassLoading] = useState<boolean>(false);
  const [changePassError, setChangePassError] = useState<string | null>(null);

  // Participant Password Reset by Organizer / Superadmin
  const [resetParticipantPasswordId, setResetParticipantPasswordId] = useState<string | null>(null);
  const [resetParticipantPasswordValue, setResetParticipantPasswordValue] = useState<string>('');

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

  const handleCopyLiveLink = useCallback(
    (c: Course) => {
      const liveUrl = `${window.location.origin}?live=true&course=${encodeURIComponent(c.id)}`;
      try {
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(liveUrl);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = liveUrl;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        setCopiedLiveCourseId(c.id);
        showTemporarySuccess(`Link Live Penonton untuk "${c.name}" berhasil disalin!`);
        setTimeout(() => setCopiedLiveCourseId((prev) => (prev === c.id ? null : prev)), 3000);
      } catch {
        showTemporarySuccess(`Link Penonton: ${liveUrl}`);
      }
    },
    [showTemporarySuccess]
  );

  const handleUpdateSuperadminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuperCredMsg(null);
    if (!token) return;
    if (!superCurrentPin.trim()) {
      setSuperCredMsg({
        type: 'error',
        text: 'Password Superadmin saat ini wajib diisi untuk verifikasi keamanan.',
      });
      return;
    }
    if (!superNewUsername.trim() && !superNewPin.trim()) {
      setSuperCredMsg({
        type: 'error',
        text: 'Harap masukkan Username baru atau Password baru yang ingin diubah.',
      });
      return;
    }
    if (superNewPin.trim() && superNewPin.trim().length < 6) {
      setSuperCredMsg({
        type: 'error',
        text: 'Password baru minimal 6 karakter (huruf, angka, atau simbol).',
      });
      return;
    }
    setSuperCredLoading(true);
    try {
      const res = await fetch('/api/organizer/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: superCurrentPin.trim(),
          newUsername: superNewUsername.trim() || undefined,
          newPassword: superNewPin.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSuperCredMsg({
          type: 'error',
          text: data.error || 'Gagal memperbarui kredensial Superadmin.',
        });
        setSuperCredLoading(false);
        return;
      }
      setSuperCredMsg({
        type: 'success',
        text: data.message || 'Kredensial Superadmin berhasil diperbarui!',
      });
      setSuperCurrentPin('');
      setSuperNewUsername('');
      setSuperNewPin('');
      await fetchDashboard();
      showTemporarySuccess('Kredensial Superadmin (Username & Password) berhasil diperbarui!');
    } catch {
      setSuperCredMsg({
        type: 'error',
        text: 'Kesalahan jaringan saat memperbarui kredensial.',
      });
    } finally {
      setSuperCredLoading(false);
    }
  };

  // Organizer: Ganti Password Mandiri
  const handleChangeOwnPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setChangePassError(null);
    if (!token) return;
    if (!changePassCurrent.trim()) {
      setChangePassError('Password saat ini wajib diisi.');
      return;
    }
    if (changePassNew.trim().length < 6) {
      setChangePassError('Password baru minimal 6 karakter (bebas kombinasi).');
      return;
    }
    if (changePassNew.trim() !== changePassConfirm.trim()) {
      setChangePassError('Konfirmasi Password baru tidak sesuai.');
      return;
    }
    setChangePassLoading(true);
    try {
      const res = await fetch('/api/organizer/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: changePassCurrent.trim(),
          newPassword: changePassNew.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangePassError(data.error || 'Gagal mengubah password akun.');
        setChangePassLoading(false);
        return;
      }
      setIsChangePasswordOpen(false);
      setChangePassCurrent('');
      setChangePassNew('');
      setChangePassConfirm('');
      showTemporarySuccess('Password akun Anda berhasil diperbarui!');
    } catch {
      setChangePassError('Kesalahan jaringan saat mengubah password.');
    } finally {
      setChangePassLoading(false);
    }
  };

  // Organizer / Superadmin: Reset Password Peserta
  const handleSaveResetParticipantPassword = async (participantId: string) => {
    if (!token || resetParticipantPasswordValue.trim().length < 6) {
      setErrorMsg('Password baru peserta minimal 6 karakter.');
      return;
    }
    try {
      const res = await fetch(`/api/organizer/participants/${participantId}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: resetParticipantPasswordValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mereset password peserta.');
        return;
      }
      if (data.participantBackup) {
        mergeAndSaveOrganizerVaultBackup({
          participants: [data.participantBackup],
        });
      }
      setResetParticipantPasswordId(null);
      setResetParticipantPasswordValue('');
      showTemporarySuccess(data.message || 'Password peserta berhasil diperbarui.');
      await fetchDashboard();
    } catch {
      setErrorMsg('Kesalahan jaringan saat mereset password peserta.');
    }
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem(ORG_TOKEN_STORAGE_KEY);
    setToken(null);
    setDashboard(null);
    setIsSuperAdminEmergencyMode(false);
    setIsConfirmEmergencyOpen(false);
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
      const localVault = loadOrganizerVaultBackup();
      const res = await fetch('/api/organizer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim() || undefined,
          password: pinInput,
          pin: pinInput,
          vaultBackup: localVault,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(
          data.error || `Password Organizer tidak valid (HTTP ${res.status}).`
        );
        return;
      }
      if (data.organizerBackup) {
        mergeAndSaveOrganizerVaultBackup({
          organizers: [data.organizerBackup],
        });
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
      const text = await res.text();
      let data: DashboardApiData;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Server merespon format tidak valid (HTML/non-JSON).');
      }

      // Cek apakah ada Course, Organizer, Peserta, atau Sesi di cadangan lokal browser (Smart Merge)
      // yang belum ada di server (mis. setelah serverless cold-start saat jaringan offline)
      const localVault = loadOrganizerVaultBackup();
      const isSuperAdmin = Boolean(data.currentOrganizer?.isSuperAdmin);
      const currentOrgId = data.currentOrganizer?.id;
      const deletedSessionSet = new Set<string>([
        ...(localVault.deletedSessionIds || []),
        ...(data.deletedSessionIds || []),
        ...(data.vaultSnapshot?.deletedSessionIds || []),
      ]);
      const deletedCourseSet = new Set<string>([
        ...(localVault.deletedCourseIds || []),
        ...(data.vaultSnapshot?.deletedCourseIds || []),
      ]);
      const deletedParticipantSet = new Set<string>([
        ...(localVault.deletedParticipantIds || []),
        ...(data.deletedParticipantIds || []),
        ...(data.vaultSnapshot?.deletedParticipantIds || []),
      ]);

      const visibleCourseIdSet = new Set<string>(
        data.courses.map((c) => c.id)
      );
      for (const bc of localVault.courses) {
        if (
          bc &&
          bc.id &&
          !deletedCourseSet.has(bc.id) &&
          (isSuperAdmin ||
            !bc.createdByOrganizerId ||
            bc.createdByOrganizerId === currentOrgId)
        ) {
          visibleCourseIdSet.add(bc.id);
        }
      }

      const missingCourses = localVault.courses.filter(
        (bc) =>
          bc &&
          bc.id &&
          !deletedCourseSet.has(bc.id) &&
          (isSuperAdmin || !bc.createdByOrganizerId || bc.createdByOrganizerId === currentOrgId) &&
          !data.courses.some((sc) => sc.id === bc.id)
      );
      const missingOrganizers = isSuperAdmin
        ? localVault.organizers.filter(
            (bo) =>
              bo &&
              bo.id &&
              !(data.organizers || []).some((so) => so.id === bo.id)
          )
        : [];
      const missingParticipants = localVault.participants.filter(
        (bp) =>
          bp &&
          bp.id &&
          !deletedParticipantSet.has(bp.id) &&
          (isSuperAdmin || bp.createdByOrganizerId === currentOrgId) &&
          !data.participants.some((sp) => sp.id === bp.id)
      );

      // Cek apakah ada sesi di Vault lokal yang hilang atau lebih maju (skor/status/pos lebih tinggi)
      // dibandingkan respons instance server yang baru saja menjawab polling 6 detik
      const aheadOrMissingSessions = localVault.sessions.filter((ls) => {
        if (
          !ls ||
          !ls.id ||
          deletedSessionSet.has(ls.id) ||
          deletedCourseSet.has(ls.courseId) ||
          deletedParticipantSet.has(ls.participantId) ||
          !visibleCourseIdSet.has(ls.courseId)
        ) {
          return false;
        }
        const srvSess = data.sessions.find((ss) => ss.id === ls.id);
        if (!srvSess) return true;
        if (
          ls.status === SessionStatus.FINISHED &&
          srvSess.status !== SessionStatus.FINISHED
        ) {
          return true;
        }
        if (
          (ls.validatedCheckpointIds?.length || 0) >
          (srvSess.validatedCheckpointIds?.length || 0)
        ) {
          return true;
        }
        if ((ls.totalScore || 0) > (srvSess.totalScore || 0)) {
          return true;
        }
        return false;
      });

      if (
        missingCourses.length > 0 ||
        missingOrganizers.length > 0 ||
        missingParticipants.length > 0 ||
        aheadOrMissingSessions.length > 0
      ) {
        const syncRes = await fetch('/api/organizer/courses/sync-backup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(localVault),
        });
        if (syncRes.ok) {
          const syncData = await syncRes.json().catch(() => ({}));
          if (Array.isArray(syncData.courses)) {
            data.courses = syncData.courses;
          }
          if (Array.isArray(syncData.organizers)) {
            data.organizers = syncData.organizers;
          }
          if (Array.isArray(syncData.participants)) {
            data.participants = syncData.participants;
          }
          if (Array.isArray(syncData.sessions)) {
            data.sessions = syncData.sessions;
          }
          if (Array.isArray(syncData.reports)) {
            data.reports = syncData.reports;
          }
        }
      }

      const mergedVault = data.vaultSnapshot
        ? mergeAndSaveOrganizerVaultBackup(data.vaultSnapshot)
        : mergeAndSaveOrganizerVaultBackup({
            courses: data.courses,
            deletedParticipantIds: data.deletedParticipantIds,
            sessions: data.sessions,
            deletedSessionIds: data.deletedSessionIds,
            reports: data.reports,
          });

      // Gabungkan course, checkpoints, sesi, dan laporan secara Monotonik
      // agar CP yang baru dibuat maupun skor peserta TIDAK PERNAH berkedip/hilang saat polling tiap 6 detik
      setDashboard((prev) => {
        const courseMap = new Map<string, Course>();
        for (const c of prev?.courses || []) {
          if (c && c.id && !deletedCourseSet.has(c.id)) {
            courseMap.set(c.id, c);
          }
        }
        for (const c of data.courses || []) {
          if (c && c.id && !deletedCourseSet.has(c.id)) {
            const existing = courseMap.get(c.id);
            if (!existing) {
              courseMap.set(c.id, c);
            } else {
              courseMap.set(c.id, mergeCourseSmart(existing, c));
            }
          }
        }

        const finalCourseIds = new Set(Array.from(courseMap.keys()));
        const sessionMap = new Map<string, ParticipantSession>();

        const seedSessions = [
          ...(prev?.sessions || []),
          ...mergedVault.sessions,
          ...data.sessions,
        ];

        for (const s of seedSessions) {
          if (
            !s ||
            !s.id ||
            deletedSessionSet.has(s.id) ||
            deletedCourseSet.has(s.courseId) ||
            deletedParticipantSet.has(s.participantId) ||
            (!isSuperAdmin && !finalCourseIds.has(s.courseId))
          ) {
            continue;
          }
          const existing = sessionMap.get(s.id);
          sessionMap.set(
            s.id,
            existing ? mergeSessionMonotonically(existing, s) : s
          );
        }

        const reportMap = new Map<string, CheckpointReport>();
        const seedReports = [
          ...(prev?.reports || []),
          ...mergedVault.reports,
          ...data.reports,
        ];
        for (const r of seedReports) {
          if (
            !r ||
            !r.reportId ||
            deletedSessionSet.has(r.sessionId) ||
            deletedCourseSet.has(r.courseId) ||
            deletedParticipantSet.has(r.participantId) ||
            (!isSuperAdmin && !finalCourseIds.has(r.courseId))
          ) {
            continue;
          }
          const prevRep = reportMap.get(r.reportId);
          reportMap.set(r.reportId, {
            ...(prevRep || {}),
            ...r,
            pointsAwarded: Math.max(
              Number(prevRep?.pointsAwarded) || 0,
              Number(r.pointsAwarded) || 0
            ),
          });
        }

        return {
          ...data,
          participants: (data.participants || []).filter(
            (p) => !deletedParticipantSet.has(p.id)
          ),
          courses: Array.from(courseMap.values()),
          sessions: Array.from(sessionMap.values()),
          reports: Array.from(reportMap.values()),
        };
      });

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

  const filteredCoursesByOrganizer: Course[] = useMemo(() => {
    if (!dashboard) return [];
    if (
      !dashboard.currentOrganizer?.isSuperAdmin ||
      selectedOrganizerFilter === 'ALL'
    ) {
      return dashboard.courses;
    }
    if (selectedOrganizerFilter === '__SUPERADMIN__') {
      const orgIdSet = new Set((dashboard.organizers || []).map((o) => o.id));
      return dashboard.courses.filter(
        (c) => !c.createdByOrganizerId || !orgIdSet.has(c.createdByOrganizerId)
      );
    }
    return dashboard.courses.filter(
      (c) => c.createdByOrganizerId === selectedOrganizerFilter
    );
  }, [dashboard, selectedOrganizerFilter]);

  const selectedCourse: Course | undefined = useMemo(() => {
    if (!dashboard) return undefined;
    const pool =
      filteredCoursesByOrganizer.length > 0
        ? filteredCoursesByOrganizer
        : dashboard.courses;
    return (
      pool.find((c: Course) => c.id === selectedCourseId) || pool[0]
    );
  }, [dashboard, filteredCoursesByOrganizer, selectedCourseId]);

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
    const liveSubTeamCount = Math.min(20, Math.max(2, Number(editCourseRelaySubTeamCount) || 3));
    const liveDnfPenalty = Math.max(0, Number(editCourseRelayDnfPenalty) || 0);

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
      raceMode: editCourseRaceMode,
      relaySubTeamCount: liveSubTeamCount,
      relayEnforceSequential: editCourseRelayEnforceSeq,
      relayDnfScoringMode: editCourseRelayDnfMode,
      relayDnfPenaltyPoints: liveDnfPenalty,
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
    editCourseRaceMode,
    editCourseRelaySubTeamCount,
    editCourseRelayEnforceSeq,
    editCourseRelayDnfMode,
    editCourseRelayDnfPenalty,
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
    setEditCourseAllowMap(course.allowParticipantMapVisibility !== false);
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
    setEditCourseRaceMode(course.raceMode || CourseRaceMode.REGULAR);
    setEditCourseRelaySubTeamCount(String(course.relaySubTeamCount || 3));
    setEditCourseRelayEnforceSeq(course.relayEnforceSequential !== false);
    setEditCourseRelayDnfMode(course.relayDnfScoringMode || RelayDnfScoringMode.ZERO);
    setEditCourseRelayDnfPenalty(String(course.relayDnfPenaltyPoints ?? 0));
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
      const parsedSubTeams = Math.min(
        20,
        Math.max(2, Number(editCourseRelaySubTeamCount) || 3)
      );
      const parsedRelayDnfPenalty = Math.max(0, Number(editCourseRelayDnfPenalty) || 0);

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
          allowParticipantMapVisibility: editCourseAllowMap,
          durationMinutes: parsedDuration,
          overtimePenaltyEnabled: editCoursePenaltyEnabled,
          overtimePenaltyPointsPerMinute: parsedPenalty,
          raceMode: editCourseRaceMode,
          relaySubTeamCount: parsedSubTeams,
          relayEnforceSequential: editCourseRelayEnforceSeq,
          relayDnfScoringMode: editCourseRelayDnfMode,
          relayDnfPenaltyPoints: parsedRelayDnfPenalty,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui Course.');
      if (data.course) {
        applyUpdatedCourseLocally(data.course);
        syncCourseToFirestore(data.course).catch(() => {});
      }
      setIsEditingCourse(false);
      await fetchDashboard();
      showTemporarySuccess(`Course "${data.course?.name || ''}" berhasil diperbarui secara real-time!`);
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
      const data = await res.json().catch(() => ({}));
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
        const data = await res.json().catch(() => ({}));
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
        const data = await res.json().catch(() => ({}));
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

  // Geser (Drag & Drop) Posisi Pos CP Langsung di Peta -> Simpan Instan 1 Langkah
  const handleDragCheckpointCoordinates = useCallback(
    async (cp: Checkpoint, lat: number, lng: number) => {
      if (!selectedCourse || !token) return;
      const roundedLat = Number(lat.toFixed(6));
      const roundedLng = Number(lng.toFixed(6));

      // Jika pos ini sedang dibuka di form edit, ikut perbarui angka di kolom input
      if (editingCheckpointId === cp.id) {
        setCpLat(String(roundedLat));
        setCpLng(String(roundedLng));
      }

      // Optimistic UI update dengan timestamp terbaru agar posisi tidak melompat balik saat dilepas
      const nowIso = new Date().toISOString();
      const optimisticCourse: Course = {
        ...selectedCourse,
        updatedAt: nowIso,
        checkpoints: selectedCourse.checkpoints.map((item) =>
          item.id === cp.id
            ? {
                ...item,
                latitude: roundedLat,
                longitude: roundedLng,
                updatedAt: nowIso,
              }
            : item
        ),
      };
      applyUpdatedCourseLocally(optimisticCourse);

      try {
        const res = await fetch(
          `/api/organizer/courses/${selectedCourse.id}/checkpoints/${cp.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              latitude: roundedLat,
              longitude: roundedLng,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data.error || 'Gagal memindahkan posisi checkpoint');
        if (data.course) {
          applyUpdatedCourseLocally(data.course);
        }
        await fetchDashboard();
        showTemporarySuccess(
          `⭕ Posisi ${cp.code} berhasil digeser ke (${roundedLat.toFixed(
            5
          )}, ${roundedLng.toFixed(5)})`
        );
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Gagal menyimpan posisi baru checkpoint'
        );
      }
    },
    [
      selectedCourse,
      token,
      editingCheckpointId,
      applyUpdatedCourseLocally,
      fetchDashboard,
      showTemporarySuccess,
    ]
  );

  // Compute Leaderboard rows with live / finished Overtime Penalty + Split Legs (#1..#N & Finish Split)
  const leaderboardRows = useMemo(() => {
    if (!dashboard) return [];
    const filteredSessions = dashboard.sessions.filter(
      (s: ParticipantSession) =>
        !selectedCourse || s.courseId === selectedCourse.id
    );

    const statusWeight = (status: SessionStatus, isDnf?: boolean) => {
      if (status === SessionStatus.FINISHED && !isDnf) return 4;
      if (status === SessionStatus.ACTIVE) return 3;
      if (status === SessionStatus.FINISHED && isDnf) return 2;
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

      // Hitung Split per Pos (#1, #2, ..., #N) secara kronologis berdasarkan waktu kunjungan peserta
      const startMs = sess.startedAt ? Date.parse(sess.startedAt) : undefined;
      const validStartMs =
        startMs !== undefined && !Number.isNaN(startMs) ? startMs : undefined;
      const finishMs = sess.finishedAt ? Date.parse(sess.finishedAt) : undefined;
      const validFinishMs =
        finishMs !== undefined && !Number.isNaN(finishMs) ? finishMs : undefined;

      const sessionCpReports = dashboard.reports
        .filter(
          (r: CheckpointReport) =>
            r.sessionId === sess.id &&
            r.reportType === 'CHECKPOINT' &&
            r.serverVerified !== false
        )
        .sort(
          (a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt)
        );

      const seenCpIds = new Set<string>();
      const orderedSplits: Array<{
        stepIndex: number;
        checkpointId: string;
        shortCode: string;
        fullCode: string;
        points: number;
        cumulativeSeconds?: number;
        legSplitSeconds?: number;
        measuredAt?: string;
      }> = [];

      let prevEventMs = validStartMs;

      for (const rep of sessionCpReports) {
        if (seenCpIds.has(rep.checkpointId)) continue;
        seenCpIds.add(rep.checkpointId);
        const cp = course?.checkpoints.find((c) => c.id === rep.checkpointId);
        const repMs = Date.parse(rep.measuredAt);
        const validRepMs = !Number.isNaN(repMs) ? repMs : undefined;

        const cumulativeSeconds =
          validStartMs !== undefined && validRepMs !== undefined
            ? Math.max(0, Math.floor((validRepMs - validStartMs) / 1000))
            : undefined;
        const legSplitSeconds =
          prevEventMs !== undefined && validRepMs !== undefined
            ? Math.max(0, Math.floor((validRepMs - prevEventMs) / 1000))
            : cumulativeSeconds;

        if (validRepMs !== undefined) {
          prevEventMs = validRepMs;
        }

        orderedSplits.push({
          stepIndex: orderedSplits.length + 1,
          checkpointId: rep.checkpointId,
          shortCode: formatShortCheckpointCode(
            cp?.code,
            cp?.orderIndex || orderedSplits.length + 1
          ),
          fullCode: cp?.code || rep.checkpointId,
          points: cp ? Number(cp.points) || 0 : Number(rep.pointsAwarded) || 0,
          cumulativeSeconds,
          legSplitSeconds,
          measuredAt: rep.measuredAt,
        });
      }

      // Jika ada validatedCheckpointIds yang belum memiliki objek report di memori, tetap tampilkan posnya
      for (const cpId of sess.validatedCheckpointIds) {
        if (seenCpIds.has(cpId)) continue;
        seenCpIds.add(cpId);
        const cp = course?.checkpoints.find((c) => c.id === cpId);
        orderedSplits.push({
          stepIndex: orderedSplits.length + 1,
          checkpointId: cpId,
          shortCode: formatShortCheckpointCode(
            cp?.code,
            cp?.orderIndex || orderedSplits.length + 1
          ),
          fullCode: cp?.code || cpId,
          points: cp ? Number(cp.points) || 0 : 0,
          cumulativeSeconds: undefined,
          legSplitSeconds: undefined,
        });
      }

      // Durasi tempuh yang terkunci stabil (tidak pernah mundur ke angka yang lebih kecil)
      const lastSplitCumulativeSec =
        orderedSplits.length > 0
          ? orderedSplits[orderedSplits.length - 1].cumulativeSeconds
          : undefined;

      const computedFinishDurationSec =
        validStartMs !== undefined && validFinishMs !== undefined
          ? Math.max(0, Math.floor((validFinishMs - validStartMs) / 1000))
          : undefined;

      const liveDurationSec =
        sess.status === SessionStatus.FINISHED
          ? sess.durationSeconds && sess.durationSeconds > 0
            ? sess.durationSeconds
            : computedFinishDurationSec ?? lastSplitCumulativeSec
          : sess.status === SessionStatus.ACTIVE && validStartMs !== undefined
          ? Math.max(
              sess.durationSeconds || 0,
              lastSplitCumulativeSec || 0,
              Math.floor((nowTick - validStartMs) / 1000)
            )
          : sess.durationSeconds;

      // Skor kotor (grossScore) dihitung dari pos tervalidasi, laporan resmi, dan skor resmi sesi
      // menggunakan nilai tertinggi yang sah agar tidak pernah berkedip menjadi 0 pts
      const cpMatchedGross = course
        ? course.scoringEnabled
          ? sess.validatedCheckpointIds.reduce((sum, cpId) => {
              const cp = course.checkpoints.find((c) => c.id === cpId);
              return sum + (cp ? Number(cp.points) || 0 : 0);
            }, 0)
          : 0
        : 0;

      const splitsGross = orderedSplits.reduce(
        (sum, sp) => sum + (Number(sp.points) || 0),
        0
      );

      const sessionStoredGross =
        typeof sess.grossScore === 'number'
          ? sess.grossScore
          : typeof sess.totalScore === 'number'
          ? sess.totalScore
          : 0;

      const grossScore =
        course && !course.scoringEnabled
          ? 0
          : Math.max(cpMatchedGross, splitsGross, sessionStoredGross);

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

      let netScore = Math.max(0, grossScore - penaltyPoints);
      if (sess.isDnf && course?.raceMode === CourseRaceMode.RELAY) {
        const dnfMode = course.relayDnfScoringMode || RelayDnfScoringMode.ZERO;
        if (dnfMode === RelayDnfScoringMode.ZERO) {
          penaltyPoints = grossScore;
          netScore = 0;
        } else {
          const extraDnfPenalty = Math.max(0, Number(course.relayDnfPenaltyPoints) || 0);
          penaltyPoints += extraDnfPenalty;
          netScore = Math.max(0, grossScore - penaltyPoints);
        }
      }

      // Hitung Finish Cumulative & Finish Leg Split (dari pos terakhir ke garis Finish)
      const finishCumulativeSeconds =
        sess.status === SessionStatus.FINISHED ? liveDurationSec : undefined;

      let finishSplitSeconds: number | undefined;
      if (sess.status === SessionStatus.FINISHED) {
        if (validFinishMs !== undefined && prevEventMs !== undefined) {
          finishSplitSeconds = Math.max(
            0,
            Math.floor((validFinishMs - prevEventMs) / 1000)
          );
        } else if (
          finishCumulativeSeconds !== undefined &&
          lastSplitCumulativeSec !== undefined
        ) {
          finishSplitSeconds = Math.max(
            0,
            finishCumulativeSeconds - lastSplitCumulativeSec
          );
        } else {
          finishSplitSeconds = finishCumulativeSeconds;
        }
      }

      const entryTimestamp = sess.startedAt || sess.loadedAt;
      const entryDateParts = formatEntryDateTimeParts(entryTimestamp);

      return {
        sessionId: sess.id,
        participantId: sess.participantId,
        bibNumber: participant?.bibNumber || '-',
        participantName: participant?.name || 'Peserta',
        teamName: participant?.teamName || participant?.name || '-',
        gender: participant?.gender || 'Other',
        ageGroup: participant?.ageGroup || 'Semua Umur',
        courseId: sess.courseId,
        courseName: course?.name || sess.courseId,
        attemptNumber: sess.attemptNumber || 1,
        status: sess.status,
        checkpointsCompleted: Math.max(
          sess.validatedCheckpointIds.length,
          orderedSplits.length
        ),
        totalCheckpoints: course?.checkpoints.length || 0,
        grossScore,
        overtimeMinutes,
        penaltyPoints,
        totalScore: netScore,
        durationSeconds: liveDurationSec,
        startedAt: sess.startedAt,
        finishedAt: sess.finishedAt,
        entryDateLabel: entryDateParts.dateLabel,
        entryTimeLabel: entryDateParts.timeLabel,
        splits: orderedSplits,
        finishCumulativeSeconds,
        finishSplitSeconds,
        lastLocationAt: sess.lastLocation?.measuredAt,
        isDnf: sess.isDnf,
        dnfReason: sess.dnfReason,
        relayParentTeamName: sess.relayParentTeamName,
        relayParentTeamKey: sess.relayParentTeamKey,
        relayLegIndex: sess.relayLegIndex,
        relayMemberNames: sess.relayMemberNames,
        relayOverrideUnlocked: Boolean(sess.relayOverrideUnlocked),
        relayOverrideReason: sess.relayOverrideReason,
      };
    });

    const filteredByCategory = enriched.filter((item) => {
      if (
        resultGenderFilter !== 'ALL' &&
        item.gender.toLowerCase() !== resultGenderFilter.toLowerCase()
      ) {
        return false;
      }
      if (resultAgeGroupFilter !== 'ALL' && item.ageGroup !== resultAgeGroupFilter) {
        return false;
      }
      return true;
    });

    return filteredByCategory
      .sort((a, b) => {
        const wDiff = statusWeight(b.status, b.isDnf) - statusWeight(a.status, a.isDnf);
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
  }, [
    dashboard,
    selectedCourse,
    effectiveSelectedCourse,
    nowTick,
    resultGenderFilter,
    resultAgeGroupFilter,
  ]);

  // Klasemen Tim Induk (Akumulasi Estafet Mode Relay)
  const relayParentLeaderboardRows = useMemo(() => {
    const activeCourse = effectiveSelectedCourse || selectedCourse;
    if (!activeCourse || activeCourse.raceMode !== CourseRaceMode.RELAY) {
      return [];
    }
    const subTeamCount = Math.max(2, Number(activeCourse.relaySubTeamCount) || 3);
    const grouped = new Map<
      string,
      { parentTeamName: string; rows: typeof leaderboardRows }
    >();

    for (const row of leaderboardRows) {
      const pKey = (
        row.relayParentTeamKey ||
        String(row.relayParentTeamName || '').trim().replace(/\s+/g, ' ').toUpperCase()
      ).trim();
      if (!pKey) continue;
      if (!grouped.has(pKey)) {
        grouped.set(pKey, {
          parentTeamName: row.relayParentTeamName || pKey,
          rows: [],
        });
      }
      grouped.get(pKey)!.rows.push(row);
    }

    return Array.from(grouped.entries())
      .map(([parentTeamKey, group]) => {
        const legs = Array.from({ length: subTeamCount }, (_, idx) => {
          const legNum = idx + 1;
          const matching = group.rows.filter((r) => r.relayLegIndex === legNum);
          const picked =
            matching.find((r) => r.status === SessionStatus.FINISHED && !r.isDnf) ||
            matching.find((r) => r.status === SessionStatus.ACTIVE) ||
            matching[matching.length - 1];
          return {
            legIndex: legNum,
            row: picked || null,
          };
        });

        const totalScore = legs.reduce((s, l) => s + (l.row?.totalScore || 0), 0);
        const grossScore = legs.reduce((s, l) => s + (l.row?.grossScore || 0), 0);
        const penaltyPoints = legs.reduce((s, l) => s + (l.row?.penaltyPoints || 0), 0);
        const totalDurationSeconds = legs.reduce(
          (s, l) =>
            s + (typeof l.row?.durationSeconds === 'number' ? l.row.durationSeconds : 0),
          0
        );
        const totalCheckpointsCompleted = legs.reduce(
          (s, l) => s + (l.row?.checkpointsCompleted || 0),
          0
        );
        const finishedLegsCount = legs.filter(
          (l) => l.row?.status === SessionStatus.FINISHED
        ).length;
        const cleanFinishedLegsCount = legs.filter(
          (l) => l.row?.status === SessionStatus.FINISHED && !l.row?.isDnf
        ).length;
        const dnfLegsCount = legs.filter(
          (l) => l.row?.status === SessionStatus.FINISHED && l.row?.isDnf
        ).length;
        const activeLegsCount = legs.filter(
          (l) => l.row?.status === SessionStatus.ACTIVE
        ).length;

        return {
          parentTeamKey,
          parentTeamName: group.parentTeamName,
          subTeamCount,
          legs,
          totalScore,
          grossScore,
          penaltyPoints,
          totalDurationSeconds,
          totalCheckpointsCompleted,
          finishedLegsCount,
          cleanFinishedLegsCount,
          dnfLegsCount,
          activeLegsCount,
        };
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (b.cleanFinishedLegsCount !== a.cleanFinishedLegsCount) {
          return b.cleanFinishedLegsCount - a.cleanFinishedLegsCount;
        }
        if (b.finishedLegsCount !== a.finishedLegsCount) {
          return b.finishedLegsCount - a.finishedLegsCount;
        }
        return a.totalDurationSeconds - b.totalDurationSeconds;
      })
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));
  }, [effectiveSelectedCourse, selectedCourse, leaderboardRows]);

  // Eksekusi Override Manual Panitia untuk Sesi Relay
  const handleExecuteRelayOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relayOverrideTarget || !token) return;
    setIsExecutingRelayOverride(true);
    try {
      const res = await fetch('/api/organizer/relay/override-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: relayOverrideTarget.sessionId,
          action: relayOverrideAction,
          reason: relayOverrideReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menjalankan Override Estafet.');
      setRelayOverrideTarget(null);
      setRelayOverrideReason('');
      await fetchDashboard();
      showTemporarySuccess(data.message || 'Override Estafet berhasil diterapkan!');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal menjalankan Override Estafet.'
      );
    } finally {
      setIsExecutingRelayOverride(false);
    }
  };

  // Jumlah kolom pos (#1..#N) untuk mode Dengan Split (Detail)
  const splitColumnCount = useMemo(() => {
    const courseCpCount = selectedCourse?.checkpoints.length || 0;
    const maxVisitedInRows = leaderboardRows.reduce(
      (max, r) => Math.max(max, r.splits.length),
      0
    );
    return Math.max(courseCpCount, maxVisitedInRows);
  }, [selectedCourse?.checkpoints.length, leaderboardRows]);

  // Create Unified Course (Location optional, clean number strings, duration & penalty)
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim() || !token) return;
    try {
      const parsedRadius = Math.max(5, Number(newCourseRadiusInput) || 35);
      const parsedDuration = Math.max(0, Number(newCourseDurationInput) || 0);
      const parsedPenalty = Math.max(0, Number(newCoursePenaltyInput) || 0);
      const parsedSubTeams = Math.min(
        20,
        Math.max(2, Number(newCourseRelaySubTeamCount) || 3)
      );
      const parsedRelayDnfPenalty = Math.max(0, Number(newCourseRelayDnfPenalty) || 0);

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
          allowParticipantMapVisibility: newCourseAllowMap,
          durationMinutes: parsedDuration,
          overtimePenaltyEnabled: newCoursePenaltyEnabled,
          overtimePenaltyPointsPerMinute: parsedPenalty,
          raceMode: newCourseRaceMode,
          relaySubTeamCount: parsedSubTeams,
          relayEnforceSequential: newCourseRelayEnforceSeq,
          relayDnfScoringMode: newCourseRelayDnfMode,
          relayDnfPenaltyPoints: parsedRelayDnfPenalty,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal membuat Course baru');
      const created: Course = data.course;
      if (created?.id) {
        mergeAndSaveOrganizerVaultBackup({ courses: [created] });
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
        const nowIso = new Date().toISOString();
        const optimisticEditedCourse: Course = {
          ...selectedCourse,
          updatedAt: nowIso,
          checkpoints: selectedCourse.checkpoints.map((item) =>
            item.id === editingCheckpointId
              ? {
                  ...item,
                  code: cpCode.trim().toUpperCase(),
                  name: cpName.trim(),
                  points: parsedPoints,
                  latitude: parsedLat,
                  longitude: parsedLng,
                  radiusMeters: parsedRadius,
                  updatedAt: nowIso,
                }
              : item
          ),
        };
        applyUpdatedCourseLocally(optimisticEditedCourse);

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
        const data = await res.json().catch(() => ({}));
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
        const data = await res.json().catch(() => ({}));
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
      const data = await res.json().catch(() => ({}));
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

  // Register Participant by Organizer (Nama Tim wajib + Gender & Kelompok Umur Orienteering)
  const handleCreateParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    setPartStatusMsg(null);
    if (!token) return;
    if (!partName.trim() || !partTeam.trim() || partPin.trim().length < 6) {
      setPartStatusMsg(
        'Nama Peserta, Nama Tim (Wajib), dan Password (min. 6 karakter) harus diisi.'
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
          gender: partGender,
          ageGroup: partAgeGroup,
          phone: partPhone,
          password: partPin.trim(),
          pin: partPin.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPartStatusMsg(data.error || 'Gagal mendaftarkan peserta.');
        return;
      }
      if (data.participantBackup) {
        mergeAndSaveOrganizerVaultBackup({
          participants: [data.participantBackup],
        });
      }
      setPartName('');
      setPartTeam('');
      setPartGender('Other');
      setPartAgeGroup('Semua Umur');
      setPartPhone('');
      setPartPin('');
      setPartStatusMsg(
        `Tim "${data.participant.teamName}" (Pendaftar: ${data.participant.name} • ${data.participant.gender || 'Other'} • ${data.participant.ageGroup || 'Semua Umur'}) berhasil didaftarkan.`
      );
      await fetchDashboard();
    } catch {
      setPartStatusMsg('Kesalahan jaringan saat mendaftarkan peserta.');
    }
  };

  // Hapus 1 Peserta (Superadmin: Semua Peserta | Organizer: Hanya Peserta Buatannya Sendiri)
  const handleConfirmDeleteParticipant = async () => {
    if (!token || !confirmDeleteParticipant) return;
    setIsDeletingParticipants(true);
    const target = confirmDeleteParticipant;
    try {
      const res = await fetch(`/api/organizer/participants/${target.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menghapus akun peserta.');
        setConfirmDeleteParticipant(null);
        return;
      }
      removeParticipantsFromVaultBackup([target.id]);
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.filter((p) => p.id !== target.id),
          deletedParticipantIds: Array.from(
            new Set([...(prev.deletedParticipantIds || []), target.id])
          ),
          sessions: prev.sessions.filter((s) => s.participantId !== target.id),
          reports: prev.reports.filter((r) => r.participantId !== target.id),
        };
      });
      setConfirmDeleteParticipant(null);
      showTemporarySuccess(
        `Peserta Tim "${target.teamName}" (Pendaftar: ${target.name}) berhasil dihapus.`
      );
      await fetchDashboard();
    } catch {
      setErrorMsg('Kesalahan jaringan saat menghapus peserta.');
    } finally {
      setIsDeletingParticipants(false);
    }
  };

  // Hapus Massal Peserta sesuai Hak Akses (Superadmin: ALL / SELF_REGISTERED | Organizer: OWN)
  const handleConfirmBulkDeleteParticipants = async () => {
    if (!token || !confirmBulkDeleteScope) return;
    setIsDeletingParticipants(true);
    try {
      const res = await fetch('/api/organizer/participants/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scope: confirmBulkDeleteScope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menghapus daftar peserta.');
        setConfirmBulkDeleteScope(null);
        return;
      }
      const removedIds: string[] = Array.isArray(data.deletedParticipantIds)
        ? data.deletedParticipantIds
        : [];
      if (removedIds.length > 0) {
        removeParticipantsFromVaultBackup(removedIds);
      }
      const removedSet = new Set(removedIds);
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.filter((p) => !removedSet.has(p.id)),
          deletedParticipantIds: Array.from(
            new Set([...(prev.deletedParticipantIds || []), ...removedIds])
          ),
          sessions: prev.sessions.filter((s) => !removedSet.has(s.participantId)),
          reports: prev.reports.filter((r) => !removedSet.has(r.participantId)),
        };
      });
      setConfirmBulkDeleteScope(null);
      showTemporarySuccess(
        `Berhasil menghapus ${data.deletedCount ?? removedIds.length} peserta beserta riwayat sesinya.`
      );
      await fetchDashboard();
    } catch {
      setErrorMsg('Kesalahan jaringan saat menghapus daftar peserta.');
    } finally {
      setIsDeletingParticipants(false);
    }
  };

  // Hapus Sesi Hasil Lomba dari Tabel Result
  const handleDeleteSessionResult = async (sessionId: string) => {
    if (!token) return;
    try {
      removeSessionFromVaultBackup(sessionId);
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: prev.sessions.filter((s) => s.id !== sessionId),
          deletedSessionIds: Array.from(
            new Set([...(prev.deletedSessionIds || []), sessionId])
          ),
          reports: prev.reports.filter((r) => r.sessionId !== sessionId),
        };
      });
      const res = await fetch(`/api/organizer/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || 'Gagal menghapus hasil sesi peserta.');
        return;
      }
      setConfirmDeleteSessionId(null);
      await fetchDashboard();
      showTemporarySuccess('Data hasil sesi peserta berhasil dihapus.');
    } catch {
      setErrorMsg('Kesalahan jaringan saat menghapus sesi peserta.');
    }
  };

  // Superadmin: Buat Akun Organizer Baru
  const handleCreateOrganizerAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgManageMsg(null);
    if (!token) return;
    if (!orgNameInput.trim() || orgPinInput.trim().length < 6) {
      setOrgManageMsg(
        'Nama Organizer dan Password Login (minimal 6 karakter) wajib diisi.'
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
          password: orgPinInput.trim(),
          pin: orgPinInput.trim(),
          maxCourses: orgIsUnlimited
            ? null
            : Math.max(1, parseInt(orgMaxCoursesInput, 10) || 1),
          durationMonths: orgDurationMonths,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrgManageMsg(data.error || 'Gagal membuat akun Organizer.');
        return;
      }
      if (data.organizerBackup) {
        mergeAndSaveOrganizerVaultBackup({
          organizers: [data.organizerBackup],
        });
      }
      setOrgNameInput('');
      setOrgUsernameInput('');
      setOrgOrganizationInput('');
      setOrgPinInput('');
      setOrgMaxCoursesInput('3');
      setOrgIsUnlimited(false);
      setOrgDurationMonths('3');
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
      if (data.organizerBackup) {
        mergeAndSaveOrganizerVaultBackup({
          organizers: [data.organizerBackup],
        });
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

  // Superadmin: Reset Password Organizer
  const handleSaveResetOrganizerPin = async (orgId: string) => {
    if (!token || resetPinValue.trim().length < 6) {
      setErrorMsg('Password baru minimal 6 karakter.');
      return;
    }
    try {
      const res = await fetch(`/api/organizer/accounts/${orgId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newPassword: resetPinValue.trim(),
          newPin: resetPinValue.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mereset Password Organizer.');
        return;
      }
      if (data.organizerBackup) {
        mergeAndSaveOrganizerVaultBackup({
          organizers: [data.organizerBackup],
        });
      }
      setResetPinOrgId(null);
      setResetPinValue('');
      showTemporarySuccess('Password Organizer berhasil diperbarui.');
      await fetchDashboard();
    } catch {
      setErrorMsg('Kesalahan jaringan saat mereset Password Organizer.');
    }
  };

  // Superadmin: Hapus Akun Organizer
  const handleDeleteOrganizerAccount = async (org: OrganizerPublic) => {
    if (!token) return;
    try {
      removeOrganizerFromVaultBackup(org.id);
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

  // Superadmin: Export Full Database Backup (.json)
  const handleExportFullDatabase = async () => {
    if (!token) return;
    setIsExportingDb(true);
    try {
      const res = await fetch('/api/organizer/database/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || 'Gagal mengekspor database.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `orientra-full-database-${dateStr}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showTemporarySuccess('File database berhasil diunduh ke perangkat Anda.');
    } catch {
      setErrorMsg('Kesalahan jaringan saat mengunduh database.');
    } finally {
      setIsExportingDb(false);
    }
  };

  // Superadmin: Download Paket Siap Upload cPanel (.zip berisi cpanel-server.cjs + dist/ + cpanel_dist/ + data/)
  const handleDownloadCpanelBundle = async () => {
    if (!token) return;
    setIsDownloadingCpanelBundle(true);
    try {
      const res = await fetch('/api/organizer/cpanel-bundle', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || 'Gagal menyiapkan paket bundel cPanel.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `orientra-cpanel-ready-${dateStr}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      showTemporarySuccess(
        'Paket Siap Upload cPanel (.zip) berhasil diunduh! Langsung unggah & Extract di File Manager cPanel.'
      );
    } catch {
      setErrorMsg('Kesalahan jaringan saat mengunduh paket bundel cPanel.');
    } finally {
      setIsDownloadingCpanelBundle(false);
    }
  };

  // Superadmin: Baca File JSON Cadangan untuk Konfirmasi Restore
  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.courses)) {
          setErrorMsg('File bukan backup database ORIENTRA yang valid (format courses tidak ditemukan).');
          return;
        }
        setPendingRestoreData(parsed);
        setRestoreStats({
          coursesCount: parsed.courses?.length || 0,
          participantsCount: parsed.participants?.length || 0,
          sessionsCount: parsed.sessions?.length || 0,
          exportedAt: parsed.exportedAt,
        });
      } catch {
        setErrorMsg('Gagal membaca file JSON. Pastikan file tidak korup.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Superadmin: Eksekusi Restore Database ke Server
  const handleExecuteRestoreDatabase = async () => {
    if (!token || !pendingRestoreData) return;
    setIsRestoringDb(true);
    try {
      const res = await fetch('/api/organizer/database/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pendingRestoreData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memulihkan database.');
        return;
      }
      setPendingRestoreData(null);
      setRestoreStats(null);
      showTemporarySuccess(
        `Database berhasil dipulihkan! (${data.stats?.coursesCount || 0} Course, ${data.stats?.participantsCount || 0} Peserta, ${data.stats?.sessionsCount || 0} Sesi).`
      );
      await fetchDashboard();
    } catch {
      setErrorMsg('Kesalahan jaringan saat memulihkan database.');
    } finally {
      setIsRestoringDb(false);
    }
  };

  // Export CSV Leaderboard (mendukung Klasemen Tim Induk Relay maupun Rincian Sub-Team / Reguler)
  const handleExportCsv = () => {
    const isRelayAccumulated =
      selectedCourse?.raceMode === CourseRaceMode.RELAY &&
      relayResultViewMode === 'ACCUMULATED';

    if (isRelayAccumulated) {
      const subTeamCount = Math.max(2, Number(selectedCourse?.relaySubTeamCount) || 3);
      const legHeaders: string[] = [];
      for (let i = 1; i <= subTeamCount; i++) {
        legHeaders.push(`Sub-Team #${i} (Akun / Anggota)`, `Sub-Team #${i} Skor`, `Sub-Team #${i} Waktu`, `Sub-Team #${i} Status`);
      }
      const headers = [
        'Rank',
        'Nama Tim Induk',
        'Sub-Team Selesai',
        'Total Sub-Team',
        'Sub-Team DNF',
        'Total Pos Valid',
        'Total Poin Pos',
        'Total Penalti',
        'Total Skor Akumulasi',
        'Total Waktu Gabungan',
        ...legHeaders,
      ];
      const csvLines = [
        headers.join(','),
        ...relayParentLeaderboardRows.map((team) => {
          const legCells: string[] = [];
          for (const leg of team.legs) {
            if (leg.row) {
              const label = leg.row.relayMemberNames
                ? `${leg.row.teamName} (${leg.row.relayMemberNames})`
                : leg.row.teamName;
              const stLabel = leg.row.isDnf ? 'DNF' : leg.row.status;
              legCells.push(
                `"${label}"`,
                String(leg.row.totalScore),
                `"${formatElapsedSeconds(leg.row.durationSeconds)}"`,
                `"${stLabel}"`
              );
            } else {
              legCells.push('"-"', '0', '"-"', '"BELUM TERDAFTAR"');
            }
          }
          return [
            team.rank,
            `"${team.parentTeamName}"`,
            team.finishedLegsCount,
            team.subTeamCount,
            team.dnfLegsCount,
            team.totalCheckpointsCompleted,
            team.grossScore,
            `-${team.penaltyPoints}`,
            team.totalScore,
            `"${formatElapsedSeconds(team.totalDurationSeconds)}"`,
            ...legCells,
          ].join(',');
        }),
      ];
      const blob = new Blob([csvLines.join('\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orientra-relay-tim-induk-${
        selectedCourse?.name.toLowerCase().replace(/\s+/g, '-') || 'all'
      }.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const splitHeaders: string[] = [];
    if (showResultSplits) {
      for (let i = 1; i <= splitColumnCount; i++) {
        splitHeaders.push(`#${i} Pos (Poin)`, `#${i} Kumulatif`, `#${i} Split`);
      }
      splitHeaders.push('Finish Kumulatif', 'Finish Split');
    }

    const headers = [
      'Rank',
      'Nama Tim',
      'Tim Induk (Relay)',
      'Urutan Sub-Team',
      'Anggota Sub-Team',
      'Gender',
      'Kelompok Umur',
      'Course',
      'Percobaan (Attempt)',
      'Status',
      'Pos Valid',
      'Total Pos',
      'Poin Pos',
      'Menit Terlambat',
      'Penalti Waktu',
      'Total Skor Akhir',
      'Waktu Tempuh',
      ...splitHeaders,
    ];

    const csvLines = [
      headers.join(','),
      ...leaderboardRows.map((r) => {
        const splitCells: string[] = [];
        if (showResultSplits) {
          for (let i = 0; i < splitColumnCount; i++) {
            const sp = r.splits[i];
            if (sp) {
              splitCells.push(
                `"${sp.shortCode} (${sp.points})"`,
                `"${formatElapsedSeconds(sp.cumulativeSeconds)}"`,
                `"${formatElapsedSeconds(sp.legSplitSeconds)}"`
              );
            } else {
              splitCells.push('"-"', '"-"', '"-"');
            }
          }
          splitCells.push(
            `"${formatElapsedSeconds(r.finishCumulativeSeconds)}"`,
            `"${formatElapsedSeconds(r.finishSplitSeconds)}"`
          );
        }

        return [
          r.rank,
          `"${r.teamName}"`,
          `"${r.relayParentTeamName || '-'}"`,
          r.relayLegIndex ? `#${r.relayLegIndex}` : '"-"',
          `"${r.relayMemberNames || '-'}"`,
          `"${r.gender}"`,
          `"${r.ageGroup}"`,
          `"${r.courseName}"`,
          r.attemptNumber,
          r.isDnf ? 'DNF' : r.status,
          r.checkpointsCompleted,
          r.totalCheckpoints,
          r.grossScore,
          r.overtimeMinutes,
          `-${r.penaltyPoints}`,
          r.totalScore,
          `"${formatElapsedSeconds(r.durationSeconds)}"`,
          ...splitCells,
        ].join(',');
      }),
    ];
    const blob = new Blob([csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orientra-result-${showResultSplits ? 'split' : 'summary'}-${
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-1 border border-sky-400/50 shadow-md shadow-sky-950/60 shrink-0">
              <img
                src="/orientra-logo.jpeg"
                alt="ORIENTRA Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400">
                ORIENTRA • Otorisasi Panitia &amp; Superadmin
              </span>
              <h2 className="text-lg font-bold text-white">
                Login Dashboard Organizer
              </h2>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Organizer &amp; Superadmin login menggunakan{' '}
            <strong className="text-slate-200">Username + Password</strong> (minimal 6 karakter). Superadmin memiliki akses penuh ke seluruh Course &amp; akun panitia, sedangkan Organizer mengelola Course buatannya sendiri.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Username Organizer / Superadmin{' '}
                <span className="text-slate-500 font-normal">
                  (Boleh dikosongkan jika Password unik)
                </span>
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Contoh: superadmin atau namaorganizer"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password Keamanan Organizer / Superadmin{' '}
                <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Masukkan Password (minimal 6 karakter)"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-amber-400"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Password minimal 6 karakter (bebas kombinasi huruf, angka, atau simbol).
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
          Memuat Data Organizer ORIENTRA...
        </div>
      </div>
    );
  }

  const isSuperAdminUser = Boolean(dashboard?.currentOrganizer?.isSuperAdmin);
  const isSuperAdminReadOnly = isSuperAdminUser && !isSuperAdminEmergencyMode;
  const currentOrgMaxCourses = dashboard?.currentOrganizer?.maxCourses;
  const isOrgQuotaUnlimited = isSuperAdminUser || currentOrgMaxCourses === null || currentOrgMaxCourses === undefined;
  const currentOrgCoursesCount = dashboard?.courses.length || 0;
  const isOrgQuotaReached = !isOrgQuotaUnlimited && currentOrgCoursesCount >= (currentOrgMaxCourses ?? 0);
  const currentOrgExpiresAt = dashboard?.currentOrganizer?.expiresAt;
  const isOrgExpired = !isSuperAdminUser && currentOrgExpiresAt ? new Date(currentOrgExpiresAt).getTime() <= Date.now() : false;
  const isCourseCreationDisabled = isOrgQuotaReached || isOrgExpired || isSuperAdminReadOnly;

  return (
    <div className="space-y-6">
      {/* Sub-header Organizer Controls (Responsif Mobile & Desktop Tanpa Overflow) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 overflow-hidden">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-white text-xs sm:text-sm truncate">
                {dashboard?.currentOrganizer?.isSuperAdmin
                  ? 'PUSAT KENDALI SUPERADMIN'
                  : `DASHBOARD ORGANIZER: ${dashboard?.currentOrganizer?.name || 'Panitia'}`}
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${
                  dashboard?.currentOrganizer?.isSuperAdmin
                    ? isSuperAdminEmergencyMode
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {dashboard?.currentOrganizer?.isSuperAdmin
                  ? isSuperAdminEmergencyMode
                    ? 'SUPERADMIN • MODE INTERVENSI DARURAT'
                    : 'SUPERADMIN • MODE PANTAU (READ-ONLY)'
                  : `${dashboard?.currentOrganizer?.code || 'ORGANIZER'} • TERISOLASI`}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-snug mt-0.5">
              {dashboard?.currentOrganizer?.isSuperAdmin
                ? isSuperAdminEmergencyMode
                  ? 'Mode Intervensi Darurat aktif: Anda dapat mengedit/menghapus Course, Peta, CP, dan Peserta milik Admin'
                  : 'Kewenangan utama: Kelola Akun Admin/Organizer & pantau seluruh Course, Peta, CP, dan Peserta (Read-Only)'
                : 'Hanya menampilkan Course yang Anda buat & peserta yang ikut di Course Anda'}
            </p>
            {!dashboard?.currentOrganizer?.isSuperAdmin && (
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/80 border border-slate-700/80 text-slate-300 font-mono">
                  <Layers className="w-3 h-3 text-amber-400" />
                  <span>Kuota:</span>
                  <strong className="text-amber-300">
                    {dashboard?.courses.length} / {dashboard?.currentOrganizer?.maxCourses === null || dashboard?.currentOrganizer?.maxCourses === undefined ? '∞ (Tak Terbatas)' : `${dashboard?.currentOrganizer?.maxCourses} Course`}
                  </strong>
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono font-medium ${formatExpirationStatus(dashboard?.currentOrganizer?.expiresAt).colorClass}`}>
                  <Clock className="w-3 h-3" />
                  <span>{formatExpirationStatus(dashboard?.currentOrganizer?.expiresAt).label}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto min-w-0">
          {/* Dropdown Filter Organizer di sebelah kiri Pilih Course (Khusus Superadmin) */}
          {isSuperAdminUser && dashboard && (
            <div className="flex items-center gap-2 bg-slate-950 border border-purple-500/40 rounded-lg px-2.5 py-1.5 flex-1 sm:flex-initial min-w-0 max-w-full sm:max-w-[230px]">
              <Building2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <select
                value={selectedOrganizerFilter}
                onChange={(e) => {
                  const nextOrgFilter = e.target.value;
                  setSelectedOrganizerFilter(nextOrgFilter);
                  setIsEditingCourse(false);
                  setEditingCheckpointId(null);
                  const matchingCourses =
                    nextOrgFilter === 'ALL'
                      ? dashboard.courses
                      : nextOrgFilter === '__SUPERADMIN__'
                      ? dashboard.courses.filter(
                          (c) =>
                            !c.createdByOrganizerId ||
                            !(dashboard.organizers || []).some(
                              (o) => o.id === c.createdByOrganizerId
                            )
                        )
                      : dashboard.courses.filter(
                          (c) => c.createdByOrganizerId === nextOrgFilter
                        );
                  if (matchingCourses[0]) {
                    setSelectedCourseId(matchingCourses[0].id);
                  }
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none font-medium w-full min-w-0 truncate"
                title="Filter tampilan berdasarkan Organizer"
              >
                <option value="ALL" className="bg-slate-900 text-slate-100">
                  🏢 Semua Organizer ({dashboard.courses.length} Course)
                </option>
                {(dashboard.organizers || []).map((org) => {
                  const orgCourseCount = dashboard.courses.filter(
                    (c) => c.createdByOrganizerId === org.id
                  ).length;
                  return (
                    <option
                      key={org.id}
                      value={org.id}
                      className="bg-slate-900 text-slate-100"
                    >
                      {org.name} ({orgCourseCount} Course)
                    </option>
                  );
                })}
                {dashboard.courses.some(
                  (c) =>
                    !c.createdByOrganizerId ||
                    !(dashboard.organizers || []).some(
                      (o) => o.id === c.createdByOrganizerId
                    )
                ) && (
                  <option
                    value="__SUPERADMIN__"
                    className="bg-slate-900 text-slate-100"
                  >
                    Course Internal / Superadmin
                  </option>
                )}
              </select>
            </div>
          )}

          {dashboard && filteredCoursesByOrganizer.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 flex-1 sm:flex-initial min-w-0 max-w-full sm:max-w-[260px]">
              <MapIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedCourse?.id || ''}
                onChange={(e) => {
                  setSelectedCourseId(e.target.value);
                  setIsEditingCourse(false);
                  setEditingCheckpointId(null);
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none font-medium w-full min-w-0 truncate"
              >
                {filteredCoursesByOrganizer.map((c: Course) => (
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

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={fetchDashboard}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition shrink-0 cursor-pointer"
              title="Muat Ulang Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {!isSuperAdminUser && (
              <button
                type="button"
                onClick={() => {
                  setChangePassError(null);
                  setChangePassCurrent('');
                  setChangePassNew('');
                  setChangePassConfirm('');
                  setIsChangePasswordOpen(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold transition shrink-0 cursor-pointer"
                title="Ganti Password Akun Anda"
              >
                <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Ganti Password</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bar Status Mode Pantau (Read-Only) & Tombol Intervensi Darurat Khusus Superadmin */}
      {isSuperAdminUser && (
        <div
          className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition ${
            isSuperAdminEmergencyMode
              ? 'bg-rose-950/30 border-rose-500/50 text-rose-200'
              : 'bg-sky-950/25 border-sky-500/30 text-sky-200'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2 rounded-lg border shrink-0 ${
                isSuperAdminEmergencyMode
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
              }`}
            >
              {isSuperAdminEmergencyMode ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>
            <div className="text-xs leading-relaxed">
              {isSuperAdminEmergencyMode ? (
                <>
                  <div className="font-bold text-rose-300">
                    MODE INTERVENSI DARURAT AKTIF (Akses Edit &amp; Hapus Terbuka)
                  </div>
                  <p className="text-rose-200/80 text-[11px]">
                    Kunci pengaman sedang dibuka. Anda dapat mengubah/menghapus Course, titik Peta, Pos CP, dan Peserta milik Admin. Segera kunci kembali setelah intervensi selesai.
                  </p>
                </>
              ) : (
                <>
                  <div className="font-bold text-sky-300">
                    MODE PANTAU (READ-ONLY) — Pengaman Data Admin Aktif
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    Akses penuh pendaftaran/kelola Admin tersedia di tab <strong>5. Kelola Organizer</strong>. Data Course, Peta, CP, dan Peserta dikunci agar tidak terubah secara tidak sengaja.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeTab !== 'ORGANIZERS' && (
              <button
                type="button"
                onClick={() => setActiveTab('ORGANIZERS')}
                className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm whitespace-nowrap shrink-0"
              >
                <Shield className="w-3.5 h-3.5" />
                Kelola Akun Admin
              </button>
            )}

            {isSuperAdminEmergencyMode ? (
              <button
                type="button"
                onClick={() => {
                  setIsSuperAdminEmergencyMode(false);
                  setIsEditingCourse(false);
                  setEditingCheckpointId(null);
                  showTemporarySuccess(
                    'Mode Pantau (Read-Only) diaktifkan kembali. Data Admin kini terkunci aman.'
                  );
                }}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                Kunci Kembali ke Mode Pantau
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmEmergencyOpen(true)}
                className="px-3.5 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                Tombol Darurat (Intervensi)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Navigation Tabs (Tab Klasik 1 - 5) */}
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
          {/* KHUSUS SUPERADMIN: BLOK A (RADAR LIVE SAAT INI) & BLOK B (REKAM JEJAK KUMULATIF SEJAK AWAL) */}
          {isSuperAdminUser && (
            <SuperAdminGlobalOverviewBlocks
              courses={dashboard.courses}
              sessions={dashboard.sessions}
              participants={dashboard.participants}
              organizers={dashboard.organizers || []}
              reports={dashboard.reports}
              allTimeStats={dashboard.allTimeStats}
              selectedOrganizerFilter={selectedOrganizerFilter}
              onSelectOrganizerFilter={(orgId) => {
                setSelectedOrganizerFilter(orgId);
                const matching =
                  orgId === 'ALL'
                    ? dashboard.courses
                    : orgId === '__SUPERADMIN__'
                    ? dashboard.courses.filter(
                        (c) =>
                          !c.createdByOrganizerId ||
                          !(dashboard.organizers || []).some(
                            (o) => o.id === c.createdByOrganizerId
                          )
                      )
                    : dashboard.courses.filter(
                        (c) => c.createdByOrganizerId === orgId
                      );
                if (matching[0]) {
                  setSelectedCourseId(matching[0].id);
                }
              }}
              onSelectCourseToMonitor={(c) => {
                setSelectedCourseId(c.id);
                setActiveTab('MONITORING');
              }}
            />
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-4">
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

            <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-4">
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

            <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-4">
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

            <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-4">
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
            <div className="lg:col-span-2 bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
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
                  <button
                    onClick={() => setActiveTab('COURSES')}
                    className="text-xs px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold transition cursor-pointer"
                  >
                    Kelola Peta &amp; Course →
                  </button>
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

            {/* Register Participant Form / Read-Only Participant Monitor */}
            <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[11px] font-mono uppercase text-sky-400">
                  {isSuperAdminReadOnly
                    ? 'Mode Pantau Peserta (Read-Only)'
                    : 'Registrasi Peserta & Password'}
                </span>
                <h3 className="text-base font-bold text-white">
                  {isSuperAdminReadOnly
                    ? 'Daftar Peserta Terdaftar'
                    : 'Tambah Akun Peserta / Tim'}
                </h3>
              </div>

              {isSuperAdminReadOnly ? (
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
                  <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Pendaftaran &amp; Edit Peserta Dikunci</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Dalam <strong>Mode Pantau</strong>, Superadmin hanya memantau daftar peserta yang didaftarkan oleh Admin penyelenggara atau mandiri. Jika perlu membantu Admin mereset password atau menambah/menghapus peserta, aktifkan <strong>Tombol Darurat (Intervensi)</strong> di bagian atas.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleCreateParticipant}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Nama Peserta Pendaftar *
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
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-slate-300">
                        Nama Tim (Wajib) *
                      </label>
                      {partName.trim() && partTeam.trim() !== partName.trim() && (
                        <button
                          type="button"
                          onClick={() => setPartTeam(partName.trim())}
                          className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          Individu? Pakai Nama Pendaftar
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Garuda Rimba (atau Nama Peserta jika individu)"
                      value={partTeam}
                      onChange={(e) => setPartTeam(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                    />
                    <p className="mt-1 text-[10px] text-amber-300/90 leading-snug">
                      * Jika peserta individu, isi <strong>Nama Tim</strong> dengan <strong>Nama Peserta Pendaftar</strong>. Peserta login menggunakan Nama Tim &amp; Password.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Gender (Opsional)
                      </label>
                      <select
                        value={partGender}
                        onChange={(e) => setPartGender(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                      >
                        {ORIENTEERING_GENDER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Kelompok Umur
                      </label>
                      <select
                        value={partAgeGroup}
                        onChange={(e) => setPartAgeGroup(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                      >
                        {ORIENTEERING_AGE_GROUPS.map((ag) => (
                          <option key={ag} value={ag}>
                            {ag === 'Semua Umur'
                              ? 'Semua Umur (Tanpa Kelompok)'
                              : ag}
                          </option>
                        ))}
                      </select>
                    </div>
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
                      Password Tim (Min. 6 Karakter) *
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Minimal 6 karakter (bebas kombinasi)"
                        value={partPin}
                        onChange={(e) => setPartPin(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400 font-mono text-xs"
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
              )}

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-300">
                    Daftar Peserta Terdaftar ({dashboard.participants.length})
                  </div>
                  {!isSuperAdminReadOnly && (
                    dashboard.currentOrganizer?.isSuperAdmin ? (
                      dashboard.participants.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {dashboard.participants.some((p) => !p.createdByOrganizerId) && (
                            <button
                              type="button"
                              onClick={() => setConfirmBulkDeleteScope('SELF_REGISTERED')}
                              className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                              title="Hapus semua peserta yang daftar mandiri"
                            >
                              <Trash2 className="w-3 h-3" />
                              Hapus Mandiri
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmBulkDeleteScope('ALL')}
                            className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                            title="Superadmin: Hapus seluruh peserta terdaftar (Mulai dari 0)"
                          >
                            <Trash2 className="w-3 h-3" />
                            Hapus Semua
                          </button>
                        </div>
                      )
                    ) : (
                      dashboard.participants.some(
                        (p) => p.createdByOrganizerId === dashboard.currentOrganizer?.id
                      ) && (
                        <button
                          type="button"
                          onClick={() => setConfirmBulkDeleteScope('OWN')}
                          className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                          title="Hapus semua peserta yang Anda daftarkan sendiri"
                        >
                          <Trash2 className="w-3 h-3" />
                          Hapus Buatan Saya
                        </button>
                      )
                    )
                  )}
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {dashboard.participants.length === 0 ? (
                    <div className="text-[11px] text-slate-500 italic py-2 text-center">
                      Belum ada peserta terdaftar.
                    </div>
                  ) : (
                    dashboard.participants.map((p: ParticipantPublic) => {
                      const isSuperAdmin = Boolean(dashboard.currentOrganizer?.isSuperAdmin);
                      const isOwnCreated =
                        Boolean(p.createdByOrganizerId) &&
                        p.createdByOrganizerId === dashboard.currentOrganizer?.id;
                      const canDeleteThisParticipant =
                        !isSuperAdminReadOnly && (isSuperAdmin || isOwnCreated);
                      const originLabel = !p.createdByOrganizerId
                        ? 'Daftar Mandiri'
                        : p.createdByOrganizerId === 'SUPERADMIN'
                          ? 'Superadmin'
                          : isOwnCreated
                            ? 'Buatan Anda'
                            : 'Panitia';

                      return (
                        <div
                          key={p.id}
                          className="px-2.5 py-1.5 rounded bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 flex items-center justify-between gap-2 text-xs transition"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setDetailModalParticipant(p);
                              setDetailModalSessionId(null);
                            }}
                            className="min-w-0 flex-1 text-left cursor-pointer group"
                            title="Klik untuk melihat pop-up rincian biodata, No. WA, & Split Time Pos CP peserta ini"
                          >
                            <div className="truncate flex items-center gap-1.5">
                              <span className="text-emerald-300 group-hover:text-amber-300 font-bold underline decoration-emerald-500/40 underline-offset-2">
                                {p.teamName}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                (Pendaftar: {p.name})
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                              <span className="font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                                {p.gender || 'Other'} • {p.ageGroup || 'Semua Umur'}
                              </span>
                              {p.phone && (
                                <span className="font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                  WA: {p.phone}
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 rounded font-medium ${
                                  !p.createdByOrganizerId
                                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                    : isOwnCreated
                                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                }`}
                              >
                                {originLabel}
                              </span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setDetailModalParticipant(p);
                                setDetailModalSessionId(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                              title="Buka Pop-Up Detail Peserta & Split Time"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Detail</span>
                            </button>

                            {canDeleteThisParticipant && (
                              resetParticipantPasswordId === p.id ? (
                                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-700">
                                  <input
                                    type="text"
                                    value={resetParticipantPasswordValue}
                                    onChange={(e) => setResetParticipantPasswordValue(e.target.value)}
                                    placeholder="Password baru (min 6)..."
                                    className="w-32 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[11px] font-mono focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveResetParticipantPassword(p.id)}
                                    className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-500 cursor-pointer"
                                  >
                                    Simpan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setResetParticipantPasswordId(null);
                                      setResetParticipantPasswordValue('');
                                    }}
                                    className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetParticipantPasswordId(p.id);
                                    setResetParticipantPasswordValue('');
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                                  title={`Reset Password untuk tim ${p.teamName}`}
                                >
                                  <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                                </button>
                              )
                            )}

                            {canDeleteThisParticipant ? (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteParticipant(p)}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition shrink-0 cursor-pointer"
                                title={
                                  isSuperAdmin
                                    ? `Hapus peserta ${p.name} (Akses Superadmin)`
                                    : `Hapus peserta buatan Anda (${p.name})`
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span
                                className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 shrink-0"
                                title={
                                  isSuperAdminReadOnly
                                    ? 'Mode Pantau Aktif (Read-Only)'
                                    : 'Hanya pembuat peserta yang dapat menghapus peserta ini'
                                }
                              >
                                {isSuperAdminReadOnly ? 'Pantau' : 'Terkunci'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
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
              {/* Left 5 cols: Create Unified Course Form (or Read-Only Superadmin Monitor Panel) */}
              <div className="lg:col-span-5 bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[11px] font-mono uppercase text-amber-400">
                  {isSuperAdminReadOnly
                    ? 'Mode Pantau Course (Read-Only)'
                    : '1-Step Course Setup'}
                </span>
                <h3 className="text-sm font-bold text-white">
                  {isSuperAdminReadOnly
                    ? 'Pemantauan Course & Peta Pos Admin'
                    : 'Buat Course Baru, Durasi & Aturan Penalti'}
                </h3>
              </div>

              {isSuperAdminReadOnly ? (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                    <div className="font-bold text-sky-300 flex items-center gap-2 text-sm">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>Pembuatan &amp; Perubahan Course Dikunci</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Saat ini Anda berada dalam <strong>Mode Pantau (Read-Only)</strong>. Seluruh pembuatan dan pengelolaan teknis Course dilakukan oleh masing-masing Admin/Organizer penyelenggara.
                    </p>
                    <ul className="space-y-1.5 text-slate-400 pt-1">
                      <li>• Pilih salah satu Course di sebelah kanan untuk melihat <strong>Peta Lintasan</strong>, <strong>Titik Start/CP/Finish</strong>, dan <strong>Tabel Pos Checkpoint</strong>.</li>
                      <li>• Anda tetap dapat membuka &amp; mengunduh <strong>Lembar Info Course</strong> serta <strong>Print QR Code Massal</strong>.</li>
                      <li>• Untuk mendaftarkan Admin baru atau mengatur kuota Course, buka tab <strong>5. Kelola Organizer</strong>.</li>
                    </ul>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('ORGANIZERS')}
                      className="flex-1 py-2.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow"
                    >
                      <Shield className="w-4 h-4" />
                      Buka Kelola Akun Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmEmergencyOpen(true)}
                      className="py-2.5 px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      Intervensi Darurat
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Status Kuota & Masa Aktif untuk Organizer */}
                  {!isSuperAdminUser && (
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-700 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                          Kuota Course:
                        </span>
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                            isOrgQuotaReached
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {isOrgQuotaUnlimited
                            ? '∞ Tak Terbatas'
                            : `${currentOrgCoursesCount} / ${currentOrgMaxCourses} Course`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                          <Clock className="w-3.5 h-3.5 text-sky-400" />
                          Masa Aktif Akun:
                        </span>
                        <span
                          className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                            formatExpirationStatus(currentOrgExpiresAt).colorClass
                          }`}
                        >
                          {formatExpirationStatus(currentOrgExpiresAt).label}
                        </span>
                      </div>

                      {isOrgQuotaReached && (
                        <div className="p-2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <strong>Batas Kuota Tercapai!</strong>
                            <p className="text-[11px] text-rose-300 mt-0.5">
                              Anda telah menggunakan seluruh jatah kuota ({currentOrgCoursesCount} dari {currentOrgMaxCourses} Course). Silakan hubungi Superadmin untuk menambah jatah course.
                            </p>
                          </div>
                        </div>
                      )}

                      {isOrgExpired && (
                        <div className="p-2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <strong>Akun Kedaluwarsa!</strong>
                            <p className="text-[11px] text-rose-300 mt-0.5">
                              Masa aktif akun Organizer Anda telah habis. Anda tidak dapat membuat course baru. Silakan hubungi Superadmin untuk memperpanjang masa aktif.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleCreateCourse} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 mb-1">
                        Nama Course *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: ORIENTRA SPRINT ORIENTEERING — KATEGORI UMUM"
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

                    {/* Pilihan Konsep / Mode Lomba: Lomba Biasa vs Estafet Relay Sub-Team */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-amber-500/30 space-y-2.5">
                      <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center justify-between">
                        <span>Konsep / Mode Lomba</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Reguler vs Relay Estafet
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setNewCourseRaceMode(CourseRaceMode.REGULAR)}
                          className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                            newCourseRaceMode === CourseRaceMode.REGULAR
                              ? 'bg-amber-500/15 border-amber-400 text-amber-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="font-bold text-[11px]">Lomba Biasa</div>
                          <div className="text-[10px] opacity-80">Individu / Tim Tunggal</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewCourseRaceMode(CourseRaceMode.RELAY)}
                          className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                            newCourseRaceMode === CourseRaceMode.RELAY
                              ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="font-bold text-[11px]">Mode Relay (Estafet)</div>
                          <div className="text-[10px] opacity-80">Akumulasi Sub-Team</div>
                        </button>
                      </div>

                      {newCourseRaceMode === CourseRaceMode.RELAY && (
                        <div className="pt-2 border-t border-slate-800 space-y-2.5 text-[11px]">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-purple-200 mb-1">
                                Jumlah Sub-Team / Tim Induk
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="3"
                                value={newCourseRelaySubTeamCount}
                                onChange={(e) =>
                                  setNewCourseRelaySubTeamCount(
                                    sanitizeDigitsOnly(e.target.value)
                                  )
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-purple-500/40 text-white font-mono"
                              />
                            </div>
                            <div className="flex flex-col justify-end">
                              <label className="flex items-center gap-2 text-slate-200 cursor-pointer p-2 rounded-lg bg-slate-950 border border-slate-800">
                                <input
                                  type="checkbox"
                                  checked={newCourseRelayEnforceSeq}
                                  onChange={(e) =>
                                    setNewCourseRelayEnforceSeq(e.target.checked)
                                  }
                                  className="rounded border-slate-700"
                                />
                                <span>Kunci Giliran (Relay Lock)</span>
                              </label>
                            </div>
                          </div>

                          <div>
                            <label className="block text-purple-200 mb-1">
                              Aturan Skor Sub-Team yang DNF
                            </label>
                            <select
                              value={newCourseRelayDnfMode}
                              onChange={(e) =>
                                setNewCourseRelayDnfMode(
                                  e.target.value as RelayDnfScoringMode
                                )
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-purple-500/40 text-white"
                            >
                              <option value={RelayDnfScoringMode.PARTIAL_WITH_PENALTY}>
                                Poin CP Tervalidasi Tetap Dihitung + Penalti DNF
                              </option>
                              <option value={RelayDnfScoringMode.ZERO}>
                                0 Poin (Hangus jika DNF)
                              </option>
                            </select>
                          </div>

                          {newCourseRelayDnfMode ===
                            RelayDnfScoringMode.PARTIAL_WITH_PENALTY && (
                            <div>
                              <label className="block text-rose-300 mb-1">
                                Penalti Tambahan Sub-Team DNF (Poin)
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="100"
                                value={newCourseRelayDnfPenalty}
                                onChange={(e) =>
                                  setNewCourseRelayDnfPenalty(
                                    sanitizeDigitsOnly(e.target.value)
                                  )
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-rose-500/40 text-rose-200 font-mono"
                              />
                            </div>
                          )}
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

                    <label className="flex items-center justify-between gap-2 text-slate-200 cursor-pointer p-2.5 rounded-lg bg-slate-900/80 border border-emerald-500/30">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newCourseAllowMap}
                          onChange={(e) => setNewCourseAllowMap(e.target.checked)}
                          className="rounded border-slate-700"
                        />
                        <div>
                          <span className="font-semibold text-emerald-300">
                            Tampilkan Peta ke Peserta (Tab Course | Map)
                          </span>
                          <div className="text-[10px] text-slate-400">
                            Matikan jika lomba mewajibkan navigasi peta kertas murni tanpa peta di HP peserta.
                          </div>
                        </div>
                      </div>
                    </label>

                    <button
                      type="submit"
                      disabled={isCourseCreationDisabled}
                      className={`w-full py-2.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                        isCourseCreationDisabled
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-md shadow-amber-500/20'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      {isOrgQuotaReached
                        ? 'Batas Kuota Course Tercapai'
                        : isOrgExpired
                          ? 'Masa Aktif Akun Kedaluwarsa'
                          : 'Buat Course Baru'}
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Right 7 cols: Existing Courses List */}
            <div className="lg:col-span-7 bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
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
                  {filteredCoursesByOrganizer.length} Course
                </span>
              </div>

              {filteredCoursesByOrganizer.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
                  Belum ada Course untuk filter Organizer yang dipilih.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {filteredCoursesByOrganizer.map((c: Course) => {
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
                            {isSuperAdminUser && c.createdByOrganizerName && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                🏢 {c.createdByOrganizerName}
                              </span>
                            )}
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              {c.checkpoints.length} CP
                            </span>
                            {c.raceMode === CourseRaceMode.RELAY && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 font-bold">
                                🏃 RELAY {c.relaySubTeamCount || 3} Sub-Team
                              </span>
                            )}
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

                        <div className="flex items-center gap-2 shrink-0">
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs shadow-sm">
                              <Check className="w-3.5 h-3.5" />
                              Sedang Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-medium text-xs">
                              Pilih Course
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

          {/* Bottom Row: Selected Course Active Management, Map Planner & Checkpoint Table */}
          {selectedCourse && effectiveSelectedCourse && (
            <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-5">
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
                    {effectiveSelectedCourse.raceMode === CourseRaceMode.RELAY ? (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 font-bold">
                        🏃 Mode Relay • {effectiveSelectedCourse.relaySubTeamCount || 3} Sub-Team
                        {effectiveSelectedCourse.relayEnforceSequential !== false
                          ? ' (Giliran Terkunci)'
                          : ' (Giliran Bebas)'}
                        {effectiveSelectedCourse.relayDnfScoringMode ===
                        RelayDnfScoringMode.PARTIAL_WITH_PENALTY
                          ? ` • DNF: Skor CP - ${effectiveSelectedCourse.relayDnfPenaltyPoints || 0}`
                          : ' • DNF: 0 Poin'}
                      </span>
                    ) : (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Mode Lomba Biasa
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1">
                    {effectiveSelectedCourse.name}
                  </h2>
                </div>

                {/* Action Buttons: Edit Course, Delete Course, Bulk Print QR, and Course Info Sheet */}
                <div className="flex flex-wrap items-center gap-2">
                  {!isSuperAdminReadOnly && (
                    <>
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
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setBulkPrintCourse(effectiveSelectedCourse)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/10 transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Print QR Code Massal (2 - 8 QR / Halaman)
                  </button>

                  <button
                    type="button"
                    onClick={() => setInfoSheetCourse(effectiveSelectedCourse)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/10 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    Lembar Info Course
                  </button>
                </div>
              </div>

              {/* Panel Edit Course Aktif (Muncul saat tombol Edit Course ditekan) */}
              {!isSuperAdminReadOnly && isEditingCourse && (
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

                  {/* Konfigurasi Mode Lomba (Biasa vs Estafet Relay) */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-purple-500/30 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-purple-300 uppercase tracking-wide text-[11px]">
                        Konsep / Mode Lomba (Biasa vs Relay Estafet)
                      </span>
                      <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setEditCourseRaceMode(CourseRaceMode.REGULAR)}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                            editCourseRaceMode === CourseRaceMode.REGULAR
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Lomba Biasa
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditCourseRaceMode(CourseRaceMode.RELAY)}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                            editCourseRaceMode === CourseRaceMode.RELAY
                              ? 'bg-purple-500 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Mode Relay (Estafet)
                        </button>
                      </div>
                    </div>

                    {editCourseRaceMode === CourseRaceMode.RELAY && (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
                        <div>
                          <label className="block text-purple-200 mb-1">
                            Jumlah Sub-Team
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editCourseRelaySubTeamCount}
                            onChange={(e) =>
                              setEditCourseRelaySubTeamCount(
                                sanitizeDigitsOnly(e.target.value)
                              )
                            }
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-purple-500/40 text-white font-mono"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="flex items-center gap-2 text-slate-200 cursor-pointer p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <input
                              type="checkbox"
                              checked={editCourseRelayEnforceSeq}
                              onChange={(e) =>
                                setEditCourseRelayEnforceSeq(e.target.checked)
                              }
                              className="rounded border-slate-700"
                            />
                            <span>Kunci Giliran (Relay Lock)</span>
                          </label>
                        </div>
                        <div>
                          <label className="block text-purple-200 mb-1">
                            Skor Sub-Team DNF
                          </label>
                          <select
                            value={editCourseRelayDnfMode}
                            onChange={(e) =>
                              setEditCourseRelayDnfMode(
                                e.target.value as RelayDnfScoringMode
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-purple-500/40 text-white"
                          >
                            <option value={RelayDnfScoringMode.ZERO}>
                              0 Poin (Hangus)
                            </option>
                            <option value={RelayDnfScoringMode.PARTIAL_WITH_PENALTY}>
                              Poin CP + Penalti DNF
                            </option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-rose-300 mb-1">
                            Penalti Tambahan DNF
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={
                              editCourseRelayDnfMode !==
                              RelayDnfScoringMode.PARTIAL_WITH_PENALTY
                            }
                            value={editCourseRelayDnfPenalty}
                            onChange={(e) =>
                              setEditCourseRelayDnfPenalty(
                                sanitizeDigitsOnly(e.target.value)
                              )
                            }
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-rose-500/40 text-rose-200 font-mono disabled:opacity-40"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-sky-500/20">
                    <div className="flex flex-wrap items-center gap-4">
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
                      <label className="flex items-center gap-2 text-emerald-300 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editCourseAllowMap}
                          onChange={(e) =>
                            setEditCourseAllowMap(e.target.checked)
                          }
                          className="rounded border-slate-700"
                        />
                        <span>Tampilkan Peta ke Peserta (Course | Map)</span>
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
                readOnly={isSuperAdminReadOnly}
                onPickCpCoordinates={(lat, lng) => {
                  setCpLat(String(lat));
                  setCpLng(String(lng));
                }}
                onUpdateStartLocation={handleUpdateStartLocation}
                onUpdateFinishLocation={handleUpdateFinishLocation}
                onSelectCheckpointForEdit={handleSelectCheckpointForEdit}
                onDragCheckpointCoordinates={handleDragCheckpointCoordinates}
              />

              {/* Form Tambah / Edit Checkpoint (Hanya muncul jika tidak dalam Mode Pantau Read-Only) */}
              {!isSuperAdminReadOnly && (
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
              )}

              {/* Tabel Daftar Pos Checkpoint */}
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
                          {isSuperAdminReadOnly
                            ? 'Belum ada pos checkpoint pada Course ini.'
                            : 'Belum ada pos checkpoint. Klik titik pada peta di atas lalu tekan + Tambah Pos ke Peta.'}
                        </td>
                      </tr>
                    ) : (
                      selectedCourse.checkpoints.map((cp: Checkpoint) => {
                        const isBeingEdited =
                          !isSuperAdminReadOnly && editingCheckpointId === cp.id;
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
                              {isSuperAdminReadOnly ? (
                                <span className="text-[11px] text-slate-500 font-mono">
                                  Mode Pantau
                                </span>
                              ) : (
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
                              )}
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
          <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-mono uppercase text-emerald-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  Real-Time Telemetry &amp; Last Known Position (~5 Menit)
                </span>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  Pemantauan Pergerakan Peserta di Lapangan
                </h2>
              </div>
              <div className="text-xs text-slate-400">
                Hanya menyimpan{' '}
                <strong className="text-slate-200">
                  1 posisi terakhir per sesi
                </strong>{' '}
                (dikirim tiap <strong>5 menit</strong> &amp; saat scan pos — hemat baterai &amp; kuota).
              </div>
            </div>

            {/* PETA INTERAKTIF LIVE MONITORING PERGERAKAN PESERTA */}
            <LiveMonitoringMap
              course={selectedCourse || dashboard.courses[0] || null}
              sessions={dashboard.sessions.filter(
                (s: ParticipantSession) =>
                  !selectedCourse || s.courseId === selectedCourse.id
              )}
              participants={dashboard.participants}
              focusedSessionId={focusedMonitoringSessionId}
              onSelectSession={(sid) => setFocusedMonitoringSessionId(sid)}
              nowTick={nowTick}
            />

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

                    const resolvedPos = resolveSessionPositionOnCourse(
                      sess,
                      course,
                      nowTick
                    );

                    const isLocationStale = Boolean(resolvedPos?.isStale);

                    return (
                      <div
                        key={sess.id}
                        className={`p-4 rounded-xl bg-slate-900/90 border flex flex-col justify-between gap-4 transition ${
                          focusedMonitoringSessionId === sess.id
                            ? 'border-emerald-400 ring-1 ring-emerald-400/40'
                            : 'border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-emerald-300 text-sm">
                                {participant?.teamName || participant?.name || 'Tim'}
                              </span>
                              {course?.raceMode === CourseRaceMode.RELAY && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 font-bold">
                                  {sess.relayParentTeamName
                                    ? `🏃 ${sess.relayParentTeamName} • Sub-Team #${sess.relayLegIndex || '?'}`
                                    : '🏃 RELAY: Belum Set Tim Induk'}
                                </span>
                              )}
                              <span className="text-xs text-slate-400">
                                (Pendaftar: {participant?.name || '-'})
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Course:{' '}
                              <span className="text-slate-200 font-medium">
                                {course?.name || sess.courseId}
                              </span>
                              {sess.relayMemberNames && (
                                <span className="ml-2 text-purple-300/90">
                                  • Anggota: {sess.relayMemberNames}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 justify-end">
                            {sess.relayOverrideUnlocked && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold">
                                OVERRIDE
                              </span>
                            )}
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
                                sess.isDnf
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : sess.status === SessionStatus.ACTIVE
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : sess.status === SessionStatus.FINISHED
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {sess.isDnf ? 'DNF' : sess.status}
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
                                resolvedPos
                                  ? 'text-sky-400'
                                  : 'text-slate-600'
                              }`}
                            />
                            {resolvedPos ? (
                              <div>
                                <div className="font-semibold text-emerald-300 text-[11px]">
                                  {resolvedPos.sourceLabel}
                                </div>
                                <div className="font-mono text-slate-200">
                                  {resolvedPos.latitude.toFixed(5)},{' '}
                                  {resolvedPos.longitude.toFixed(5)}
                                  {resolvedPos.accuracyMeters
                                    ? ` (±${Math.round(
                                        resolvedPos.accuracyMeters
                                      )}m)`
                                    : ''}
                                </div>
                                {resolvedPos.measuredAt && (
                                  <div className="text-[11px] text-slate-400">
                                    Diperbarui:{' '}
                                    {formatTimeAgo(resolvedPos.measuredAt)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500">
                                Menunggu peserta Scan Start atau mengirim sinyal GPS
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {isLocationStale && (
                              <span
                                className="flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded"
                                title="Lebih dari 6 menit belum ada update lokasi berkala"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                &gt;5m
                              </span>
                            )}
                            {course?.raceMode === CourseRaceMode.RELAY &&
                              !isSuperAdminReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRelayOverrideTarget({
                                      sessionId: sess.id,
                                      teamLabel:
                                        participant?.teamName ||
                                        participant?.name ||
                                        'Sub-Team',
                                      parentTeamName: sess.relayParentTeamName,
                                      legIndex: sess.relayLegIndex,
                                      status: sess.status,
                                      isDnf: sess.isDnf,
                                      relayOverrideUnlocked: sess.relayOverrideUnlocked,
                                    });
                                    setRelayOverrideAction(
                                      sess.status === SessionStatus.ACTIVE
                                        ? 'FORCE_FINISH'
                                        : 'UNLOCK_LEG'
                                    );
                                    setRelayOverrideReason('');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 px-2.5 py-1.5 text-[11px] font-bold text-purple-200 transition cursor-pointer"
                                  title="Override Manual Estafet (Buka Kunci / Paksa Finish / Paksa DNF)"
                                >
                                  <Unlock className="w-3 h-3" />
                                  Override
                                </button>
                              )}
                            {resolvedPos && (
                              <button
                                type="button"
                                onClick={() =>
                                  setFocusedMonitoringSessionId(sess.id)
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 transition cursor-pointer"
                              >
                                <MapPin className="w-3 h-3" />
                                Lihat di Peta
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: RESULT & LEADERBOARD (KLIK NAMA TIM UNTUK POP-UP DETAIL PESERTA & SPLIT TIME) */}
      {activeTab === 'RESULT' && dashboard && (
        <div className="space-y-6">
          <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-mono uppercase text-amber-400">
                  Official Race Leaderboard
                </span>
                <h2 className="text-lg font-bold text-white mt-0.5 flex flex-wrap items-center gap-2">
                  <span>
                    Hasil Lomba &amp; Peringkat (
                    {selectedCourse?.name || 'Semua Course'})
                  </span>
                  {selectedCourse?.raceMode === CourseRaceMode.RELAY && (
                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/40">
                      🏃 MODE RELAY ({selectedCourse.relaySubTeamCount || 3} Sub-Team)
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedCourse?.raceMode === CourseRaceMode.RELAY
                    ? 'Akumulasi skor dan waktu seluruh Sub-Team membentuk Klasemen Resmi Tim Induk.'
                    : 'Urutan peringkat: Status (FINISHED prioritas utama) → Skor Akhir Bersih (setelah dikurangi penalti keterlambatan) → Waktu tempuh tercepat.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedCourse?.raceMode === CourseRaceMode.RELAY && (
                  <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-purple-500/40">
                    <button
                      type="button"
                      onClick={() => setRelayResultViewMode('ACCUMULATED')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        relayResultViewMode === 'ACCUMULATED'
                          ? 'bg-purple-500 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Klasemen Tim Induk (Akumulasi)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRelayResultViewMode('SUBTEAMS')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        relayResultViewMode === 'SUBTEAMS'
                          ? 'bg-purple-500 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Rincian Semua Sub-Team
                    </button>
                  </div>
                )}

                {/* Opsi Show Split / Hide Split */}
                {(!selectedCourse ||
                  selectedCourse.raceMode !== CourseRaceMode.RELAY ||
                  relayResultViewMode === 'SUBTEAMS') && (
                  <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowResultSplits(false)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        !showResultSplits
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Hide Split
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResultSplits(true)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                        showResultSplits
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Show Split (#1..#{splitColumnCount || 1})
                    </button>
                  </div>
                )}

                {selectedCourse && (
                  <button
                    type="button"
                    onClick={() => setShareSpectatorCourse(selectedCourse)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-bold text-xs transition cursor-pointer"
                    title="Bagikan Tautan & QR Code Live Leaderboard untuk penonton"
                  >
                    <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
                    Bagikan Link Penonton
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsSpectatorFullscreen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer"
                  title="Tampilkan layar penuh khusus penonton & TV arena (tanpa tombol admin)"
                >
                  <Maximize2 className="w-4 h-4" />
                  Layar Penuh Penonton (Live TV)
                </button>

                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Export Hasil (CSV)
                </button>
              </div>
            </div>

            {/* Filter Gender & Kelompok Umur */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">
                    Filter Gender:
                  </span>
                  <select
                    value={resultGenderFilter}
                    onChange={(e) => setResultGenderFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-medium focus:outline-none focus:border-amber-400"
                  >
                    <option value="ALL">Semua Gender</option>
                    {ORIENTEERING_GENDER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">
                    Filter Kelompok Umur:
                  </span>
                  <select
                    value={resultAgeGroupFilter}
                    onChange={(e) => setResultAgeGroupFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-medium focus:outline-none focus:border-amber-400"
                  >
                    <option value="ALL">Semua Kategori Umur</option>
                    {ORIENTEERING_AGE_GROUPS.map((ag) => (
                      <option key={ag} value={ag}>
                        {ag === 'Semua Umur'
                          ? 'Semua Umur (Tanpa Kelompok Umur)'
                          : `Kelompok ${ag}`}
                      </option>
                    ))}
                  </select>
                </div>

                {(resultGenderFilter !== 'ALL' ||
                  resultAgeGroupFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setResultGenderFilter('ALL');
                      setResultAgeGroupFilter('ALL');
                    }}
                    className="text-amber-400 hover:underline font-medium"
                  >
                    Reset Filter
                  </button>
                )}
              </div>

              <div className="text-[11px] text-slate-400">
                {selectedCourse?.raceMode === CourseRaceMode.RELAY &&
                relayResultViewMode === 'ACCUMULATED' ? (
                  <>
                    Menampilkan{' '}
                    <strong className="text-purple-300">
                      {relayParentLeaderboardRows.length} Tim Induk
                    </strong>{' '}
                    ({leaderboardRows.length} sesi Sub-Team)
                  </>
                ) : (
                  <>
                    Menampilkan{' '}
                    <strong className="text-white">{leaderboardRows.length}</strong>{' '}
                    hasil sesi
                    {showResultSplits && (
                      <span className="ml-2 text-slate-400">
                        • Format Split: <strong className="text-amber-300">Pos (Poin)</strong> |{' '}
                        <strong className="text-white">Waktu Kumulatif</strong> |{' '}
                        <span className="text-slate-400">Waktu Split Antar-Pos</span>
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {selectedCourse?.raceMode === CourseRaceMode.RELAY &&
            relayResultViewMode === 'ACCUMULATED' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                      <th className="py-3 px-3 whitespace-nowrap">Rank</th>
                      <th className="py-3 px-3 whitespace-nowrap">Nama Tim Induk</th>
                      <th className="py-3 px-3 whitespace-nowrap">Progres</th>
                      <th className="py-3 px-3 whitespace-nowrap">Rincian Tiap Sub-Team</th>
                      <th className="py-3 px-3 whitespace-nowrap">Total Pos</th>
                      <th className="py-3 px-3 whitespace-nowrap">Penalti</th>
                      <th className="py-3 px-3 whitespace-nowrap">Total Skor Tim Induk</th>
                      <th className="py-3 px-3 whitespace-nowrap">Total Waktu Gabungan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {relayParentLeaderboardRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-8 text-center text-slate-400 text-xs"
                        >
                          Belum ada Tim Induk yang mendaftarkan Sub-Team di Course Relay ini.
                        </td>
                      </tr>
                    ) : (
                      relayParentLeaderboardRows.map((team) => (
                        <tr key={team.parentTeamKey} className="hover:bg-slate-900/40 align-top">
                          <td className="py-3 px-3 font-mono font-bold text-amber-400 whitespace-nowrap text-sm">
                            #{team.rank}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-bold text-purple-200 text-sm">
                              {team.parentTeamName}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {team.cleanFinishedLegsCount}/{team.subTeamCount} Finish Bersih
                              {team.dnfLegsCount > 0 ? ` • ${team.dnfLegsCount} DNF` : ''}
                              {team.activeLegsCount > 0 ? ` • ${team.activeLegsCount} Aktif` : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-200 border border-purple-500/30 font-bold">
                              {team.finishedLegsCount} / {team.subTeamCount}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1.5">
                              {team.legs.map((leg) => {
                                const r = leg.row;
                                if (!r) {
                                  return (
                                    <div
                                      key={`${team.parentTeamKey}-leg-${leg.legIndex}`}
                                      className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-500 font-mono"
                                    >
                                      #{leg.legIndex}: Kosong
                                    </div>
                                  );
                                }
                                return (
                                  <div
                                    key={`${team.parentTeamKey}-leg-${leg.legIndex}`}
                                    className={`px-2 py-1 rounded border text-[10px] font-mono flex items-center gap-1.5 ${
                                      r.isDnf
                                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                                        : r.status === SessionStatus.FINISHED
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                        : r.status === SessionStatus.ACTIVE
                                        ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                                        : 'bg-slate-900 border-slate-700 text-slate-300'
                                    }`}
                                  >
                                    <span className="font-bold">#{leg.legIndex}</span>
                                    <span className="truncate max-w-[110px]">
                                      {r.teamName}
                                    </span>
                                    <span className="text-amber-300 font-bold">
                                      {r.totalScore}pts
                                    </span>
                                    <span className="text-slate-400">
                                      {formatElapsedSeconds(r.durationSeconds)}
                                    </span>
                                    {!isSuperAdminReadOnly && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRelayOverrideTarget({
                                            sessionId: r.sessionId,
                                            teamLabel: r.teamName,
                                            parentTeamName: r.relayParentTeamName,
                                            legIndex: r.relayLegIndex,
                                            status: r.status,
                                            isDnf: r.isDnf,
                                            relayOverrideUnlocked: r.relayOverrideUnlocked,
                                          });
                                          setRelayOverrideAction(
                                            r.status === SessionStatus.ACTIVE
                                              ? 'FORCE_FINISH'
                                              : 'UNLOCK_LEG'
                                          );
                                          setRelayOverrideReason('');
                                        }}
                                        className="ml-0.5 px-1 py-0.5 rounded bg-purple-500/25 hover:bg-purple-500/40 text-purple-100 cursor-pointer"
                                        title={`Override Sub-Team #${leg.legIndex}`}
                                      >
                                        <Unlock className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-200 whitespace-nowrap">
                            {team.totalCheckpointsCompleted} CP
                          </td>
                          <td className="py-3 px-3 font-mono whitespace-nowrap">
                            {team.penaltyPoints > 0 ? (
                              <span className="text-rose-400 font-semibold">
                                -{team.penaltyPoints} pts
                              </span>
                            ) : (
                              <span className="text-slate-500">0</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-emerald-400 text-sm whitespace-nowrap">
                            {team.totalScore} pts
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-white whitespace-nowrap">
                            {formatElapsedSeconds(team.totalDurationSeconds)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                    <th className="py-3 px-3 whitespace-nowrap">Rank</th>
                    <th className="py-3 px-3 whitespace-nowrap">Nama Tim</th>
                    <th className="py-3 px-3 whitespace-nowrap">Gender</th>
                    <th className="py-3 px-3 whitespace-nowrap">Kelompok Umur</th>
                    <th className="py-3 px-3 whitespace-nowrap">Course</th>
                    <th className="py-3 px-3 whitespace-nowrap">Status</th>
                    <th className="py-3 px-3 whitespace-nowrap">Pos Valid</th>
                    <th className="py-3 px-3 whitespace-nowrap">Poin Pos</th>
                    <th className="py-3 px-3 whitespace-nowrap">Penalti Waktu</th>
                    <th className="py-3 px-3 whitespace-nowrap">Total Skor Akhir</th>
                    <th className="py-3 px-3 whitespace-nowrap">Waktu Tempuh</th>
                    {showResultSplits &&
                      Array.from({ length: splitColumnCount }, (_, idx) => (
                        <th
                          key={`split-col-${idx + 1}`}
                          className="py-3 px-3 text-center whitespace-nowrap bg-slate-900/70 border-l border-slate-800 text-amber-300"
                        >
                          #{idx + 1}
                        </th>
                      ))}
                    {showResultSplits && (
                      <th className="py-3 px-3 text-center whitespace-nowrap bg-slate-900/70 border-l border-slate-800 text-emerald-300">
                        Finish Split
                      </th>
                    )}
                    <th className="py-3 px-3 text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leaderboardRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          12 + (showResultSplits ? splitColumnCount + 1 : 0)
                        }
                        className="py-8 text-center text-slate-400 text-xs"
                      >
                        Belum ada data hasil lomba untuk filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    leaderboardRows.map((row) => {
                      const partObj = dashboard.participants.find(
                        (p) => p.id === row.participantId
                      );
                      return (
                      <tr key={row.sessionId} className="hover:bg-slate-900/40">
                        <td className="py-3 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                          #{row.rank}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              if (partObj) {
                                setDetailModalParticipant(partObj);
                                setDetailModalSessionId(row.sessionId);
                              }
                            }}
                            className="text-left group cursor-pointer"
                            title="Klik untuk membuka Pop-Up Detail Peserta, No. WA, & Tabel Split Time Pos CP"
                          >
                            <div className="text-emerald-300 group-hover:text-amber-300 font-bold underline decoration-emerald-500/40 underline-offset-2">
                              {row.teamName}
                            </div>
                            {row.relayParentTeamName && (
                              <div className="text-[10px] font-mono text-purple-300 font-bold mt-0.5">
                                🏃 {row.relayParentTeamName} • Sub-Team #{row.relayLegIndex || '?'}
                                {row.relayMemberNames ? ` (${row.relayMemberNames})` : ''}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400">
                              Pendaftar: {row.participantName}
                              {partObj?.phone ? ` • WA: ${partObj.phone}` : ''}
                            </div>
                          </button>
                        </td>
                        <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                          {row.gender}
                        </td>
                        <td className="py-3 px-3 text-slate-300 font-mono whitespace-nowrap">
                          {row.ageGroup}
                        </td>
                        <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
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
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1">
                            {row.isDnf ? (
                              <span
                                className="text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                title={row.dnfReason || 'Tidak Menyelesaikan Course (Keluar saat lomba)'}
                              >
                                DNF (Gugur)
                              </span>
                            ) : (
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
                            )}
                            {row.relayOverrideUnlocked && (
                              <span
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold"
                                title={row.relayOverrideReason || 'Dibuka manual lewat Override Panitia'}
                              >
                                OVERRIDE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-200 whitespace-nowrap">
                          {row.checkpointsCompleted} / {row.totalCheckpoints} CP
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                          {row.grossScore} pts
                        </td>
                        <td className="py-3 px-3 font-mono whitespace-nowrap">
                          {row.penaltyPoints > 0 ? (
                            <span className="text-rose-400 font-semibold">
                              -{row.penaltyPoints} pts
                              {row.overtimeMinutes > 0 ? ` (${row.overtimeMinutes}m)` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-400 text-sm whitespace-nowrap">
                          {row.totalScore} pts
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-white whitespace-nowrap">
                          {formatElapsedSeconds(row.durationSeconds)}
                        </td>

                        {/* Kolom Split Detail #1 .. #N (Hanya muncul saat Show Split aktif) */}
                        {showResultSplits &&
                          Array.from(
                            { length: splitColumnCount },
                            (_, splitIdx) => {
                              const sp = row.splits[splitIdx];
                              if (!sp) {
                                return (
                                  <td
                                    key={`cell-${row.sessionId}-${splitIdx}`}
                                    className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap bg-slate-950/40 border-l border-slate-800/70"
                                  >
                                    -
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={`cell-${row.sessionId}-${splitIdx}`}
                                  className="py-2 px-3 text-center whitespace-nowrap leading-tight bg-slate-950/40 border-l border-slate-800/70"
                                >
                                  <div>
                                    <strong className="font-mono font-bold text-amber-300">
                                      {sp.shortCode}
                                    </strong>{' '}
                                    <em className="text-emerald-400 not-italic font-mono text-[11px]">
                                      ({sp.points})
                                    </em>
                                  </div>
                                  <div className="font-mono text-white text-[11px] mt-0.5">
                                    {formatElapsedSeconds(sp.cumulativeSeconds)}
                                  </div>
                                  <div className="font-mono text-[10px] text-slate-400">
                                    {formatElapsedSeconds(sp.legSplitSeconds)}
                                  </div>
                                </td>
                              );
                            }
                          )}

                        {/* Kolom Finish Split (Hanya muncul saat Show Split aktif) */}
                        {showResultSplits && (
                          <td className="py-2 px-3 text-center whitespace-nowrap leading-tight bg-slate-950/40 border-l border-slate-800/70">
                            {row.status === SessionStatus.FINISHED ? (
                              <>
                                <div className="font-mono font-bold text-emerald-300 text-[11px]">
                                  {formatElapsedSeconds(
                                    row.finishCumulativeSeconds ??
                                      row.durationSeconds
                                  )}
                                </div>
                                <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                  {formatElapsedSeconds(row.finishSplitSeconds)}
                                </div>
                              </>
                            ) : (
                              <span className="font-mono text-slate-600">-</span>
                            )}
                          </td>
                        )}

                        {/* Tombol Detail, Override Estafet, & Hapus Hasil Sesi */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {selectedCourse?.raceMode === CourseRaceMode.RELAY &&
                              !isSuperAdminReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRelayOverrideTarget({
                                      sessionId: row.sessionId,
                                      teamLabel: row.teamName,
                                      parentTeamName: row.relayParentTeamName,
                                      legIndex: row.relayLegIndex,
                                      status: row.status,
                                      isDnf: row.isDnf,
                                      relayOverrideUnlocked: row.relayOverrideUnlocked,
                                    });
                                    setRelayOverrideAction(
                                      row.status === SessionStatus.ACTIVE
                                        ? 'FORCE_FINISH'
                                        : 'UNLOCK_LEG'
                                    );
                                    setRelayOverrideReason('');
                                  }}
                                  className="px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-[10px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                                  title="Override Manual Estafet (Buka Kunci / Paksa Finish / Paksa DNF)"
                                >
                                  <Unlock className="w-3 h-3" />
                                  <span>Override</span>
                                </button>
                              )}
                            {partObj && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailModalParticipant(partObj);
                                  setDetailModalSessionId(row.sessionId);
                                }}
                                className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                                title="Buka Pop-Up Rincian Peserta & Split Time Pos CP"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Detail</span>
                              </button>
                            )}
                            {isSuperAdminReadOnly ? (
                              <span className="text-[11px] text-slate-500 font-mono">
                                Pantau
                              </span>
                            ) : confirmDeleteSessionId === row.sessionId ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteSessionResult(row.sessionId)
                                  }
                                  className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSessionId(null)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDeleteSessionId(row.sessionId)
                                }
                                className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                                title="Hapus hasil sesi ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: KELOLA AKUN ORGANIZER (KHUSUS SUPERADMIN) */}
      {dashboard &&
        dashboard.currentOrganizer?.isSuperAdmin &&
        activeTab === 'ORGANIZERS' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              {/* Form Pengaturan Kredensial Superadmin (Ganti Username & PIN) */}
              <div className="bg-[#0a1f38] border border-purple-500/30 rounded-xl p-5 space-y-4 shadow-lg shadow-purple-950/20">
                <div className="border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-mono uppercase text-purple-400 font-bold">
                      Kredensial Superadmin
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-white mt-1">
                    Ubah Username &amp; Password Superadmin
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Ubah username login Superadmin (agar tidak kosong) dan perbarui Password utama secara aman.
                  </p>
                </div>

                <form onSubmit={handleUpdateSuperadminCredentials} className="space-y-3">
                  <div className="rounded-lg bg-slate-950 p-2.5 border border-slate-800 text-xs">
                    <span className="text-slate-400">Username Login Saat Ini: </span>
                    <strong className="font-mono text-purple-300">
                      {dashboard.currentOrganizer?.username || 'superadmin'}
                    </strong>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Username Superadmin Baru{' '}
                      <span className="text-slate-500 font-normal">(Opsional)</span>
                    </label>
                    <input
                      type="text"
                      value={superNewUsername}
                      onChange={(e) => setSuperNewUsername(e.target.value)}
                      placeholder="Contoh: superadmin atau masteradmin"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-400"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Min 3 karakter (huruf, angka, titik, strip, underscore).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Password Superadmin Saat Ini <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={superCurrentPin}
                      onChange={(e) => setSuperCurrentPin(e.target.value)}
                      placeholder="Masukkan Password saat ini untuk verifikasi"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Password Superadmin Baru{' '}
                      <span className="text-slate-500 font-normal">(Opsional)</span>
                    </label>
                    <input
                      type="password"
                      value={superNewPin}
                      onChange={(e) => setSuperNewPin(e.target.value)}
                      placeholder="Minimal 6 karakter (kosongkan jika tidak ganti)"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-400"
                    />
                  </div>

                  {superCredMsg && (
                    <div
                      className={`p-2.5 rounded-lg text-xs border ${
                        superCredMsg.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {superCredMsg.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={superCredLoading}
                    className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {superCredLoading ? 'Menyimpan...' : 'Simpan Kredensial Superadmin'}
                  </button>
                </form>
              </div>

              {/* Form Buat Akun Organizer Baru */}
              <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
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
                    Password Login Organizer (Min. 6 karakter){' '}
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={orgPinInput}
                    onChange={(e) => setOrgPinInput(e.target.value)}
                    placeholder="Contoh: orientra123 atau 778899"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-purple-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Boleh huruf, angka, tanda baca, simbol, minimal 6 karakter. Boleh sama dengan akun organizer lain.
                  </p>
                </div>

                {/* Pengaturan Jatah Kuota Course */}
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>Jatah Kuota Course</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-amber-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={orgIsUnlimited}
                        onChange={(e) => setOrgIsUnlimited(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <span>Tak Terbatas (Unlimited)</span>
                    </label>
                  </div>

                  {!orgIsUnlimited ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={orgMaxCoursesInput}
                          onChange={(e) => setOrgMaxCoursesInput(e.target.value)}
                          placeholder="Jumlah course (cth: 3)"
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                        />
                        <span className="text-xs text-slate-400 shrink-0 font-medium">Course</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">Pilihan cepat:</span>
                        {[1, 2, 3, 5, 10].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setOrgMaxCoursesInput(String(preset));
                              setOrgIsUnlimited(false);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                              !orgIsUnlimited && orgMaxCoursesInput === String(preset)
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                            }`}
                          >
                            {preset} Course
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1.5">
                      <InfinityIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>Organizer ini dapat membuat Course sebanyak-banyaknya tanpa batasan.</span>
                    </div>
                  )}
                </div>

                {/* Pengaturan Masa Aktif Akun */}
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      <span>Masa Aktif Akun</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: '1', label: '1 Bulan' },
                      { id: '3', label: '3 Bulan' },
                      { id: '6', label: '6 Bulan' },
                      { id: '9', label: '9 Bulan' },
                      { id: '12', label: '12 Bulan' },
                      { id: 'lifetime', label: 'Lifetime' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setOrgDurationMonths(opt.id)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition cursor-pointer ${
                          orgDurationMonths === opt.id
                            ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold shadow'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Pratinjau Tanggal Expired */}
                  <div className="text-[11px] text-sky-300 font-mono bg-sky-950/30 p-2 rounded border border-sky-800/40">
                    {(() => {
                      if (orgDurationMonths === 'lifetime') return '♾️ Masa Aktif: Lifetime (Selamanya tanpa batas waktu)';
                      const m = parseInt(orgDurationMonths, 10) || 3;
                      const d = new Date();
                      d.setMonth(d.getMonth() + m);
                      return `📅 Berlaku s/d: ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                    })()}
                  </div>
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
          </div>

          {/* Daftar Akun Organizer */}
            <div className="lg:col-span-2 bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
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

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-700/80 text-[11px] font-mono">
                              <Layers className="w-3 h-3 text-amber-400" />
                              <span className="text-slate-400">Kuota Course:</span>
                              <strong
                                className={
                                  org.maxCourses !== null &&
                                  org.maxCourses !== undefined &&
                                  orgCourses.length >= org.maxCourses
                                    ? 'text-rose-400 font-bold'
                                    : 'text-amber-300'
                                }
                              >
                                {orgCourses.length} /{' '}
                                {org.maxCourses === null || org.maxCourses === undefined
                                  ? '∞ (Tak Terbatas)'
                                  : `${org.maxCourses} Course`}
                              </strong>
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono font-medium ${
                                formatExpirationStatus(org.expiresAt).colorClass
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              <span>
                                Masa Aktif: {formatExpirationStatus(org.expiresAt).label}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrganizerFilter(org.id);
                              if (orgCourses[0]) {
                                setSelectedCourseId(orgCourses[0].id);
                              }
                              setActiveTab('COURSES');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
                            title="Filter & lihat Course yang dibuat oleh Organizer ini di Tab Course & Peta Pos"
                          >
                            <MapIcon className="w-4 h-4" />
                            <span>
                              Lihat Course ({orgCourses.length})
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedEditOrg(org)}
                            className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-semibold border border-purple-500/40 transition cursor-pointer flex items-center gap-1.5 shadow"
                            title="Edit Kuota Course &amp; Perpanjang Masa Aktif Akun"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Edit Kuota / Masa Aktif</span>
                          </button>

                          {resetPinOrgId === org.id ? (
                            <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-700">
                              <input
                                type="text"
                                value={resetPinValue}
                                onChange={(e) => setResetPinValue(e.target.value)}
                                placeholder="Password Baru (min 6)..."
                                className="w-36 px-2 py-1 rounded bg-slate-900 text-white text-xs font-mono focus:outline-none"
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
                              Ubah Password
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

                  {/* Kartu Tambahan Jika Ada Course Internal / Dibuat Langsung oleh Superadmin */}
                  {(() => {
                    const orgIdSet = new Set(
                      (dashboard.organizers || []).map((o) => o.id)
                    );
                    const internalCourses = dashboard.courses.filter(
                      (c) =>
                        !c.createdByOrganizerId ||
                        !orgIdSet.has(c.createdByOrganizerId)
                    );
                    if (internalCourses.length === 0) return null;
                    const internalCourseIds = new Set(
                      internalCourses.map((c) => c.id)
                    );
                    const internalSessionsCount = dashboard.sessions.filter(
                      (s) => internalCourseIds.has(s.courseId)
                    ).length;

                    return (
                      <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              SUPERADMIN
                            </span>
                            <span className="font-bold text-white text-sm">
                              Course Internal / Dibuat Superadmin
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 flex flex-wrap items-center gap-3">
                            <span>
                              • Course Tersedia:{' '}
                              <strong className="text-amber-300">
                                {internalCourses.length}
                              </strong>
                            </span>
                            <span>
                              • Sesi Peserta:{' '}
                              <strong className="text-emerald-300">
                                {internalSessionsCount}
                              </strong>
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOrganizerFilter('__SUPERADMIN__');
                            if (internalCourses[0]) {
                              setSelectedCourseId(internalCourses[0].id);
                            }
                            setActiveTab('COURSES');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-500/20 shrink-0"
                        >
                          <MapIcon className="w-4 h-4" />
                          <span>
                            Lihat Course ({internalCourses.length})
                          </span>
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            </div>
          </div>
        )}

      {/* KARTU KESIAPAN HOSTING MANDIRI (SELF-HOSTED) — KONSISTEN MUNCUL DI BAGIAN BAWAH DILUAR TAB ATAU LEVEL APAPUN */}
      {dashboard && dashboard.currentOrganizer?.isSuperAdmin && (
        <div className="bg-[#0a1f38] border border-amber-500/30 rounded-xl p-5 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                      Kesiapan Hosting Mandiri (Self-Hosted)
                    </span>
                    <h2 className="text-base font-bold text-white">
                      Pencadangan &amp; Pemulihan Database Penuh (100% Mandiri)
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isDownloadingCpanelBundle}
                    onClick={handleDownloadCpanelBundle}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow-md shadow-emerald-500/20"
                  >
                    <Download
                      className={`w-4 h-4 ${isDownloadingCpanelBundle ? 'animate-bounce' : ''}`}
                    />
                    {isDownloadingCpanelBundle
                      ? 'Menyiapkan Bundel...'
                      : 'Download Paket Siap Upload cPanel (.zip)'}
                  </button>

                  <button
                    type="button"
                    disabled={isExportingDb}
                    onClick={handleExportFullDatabase}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow-md shadow-amber-500/20"
                  >
                    <Download className={`w-4 h-4 ${isExportingDb ? 'animate-bounce' : ''}`} />
                    {isExportingDb ? 'Mengekspor...' : 'Download Full Database (.json)'}
                  </button>

                  <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer border border-slate-700">
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Upload &amp; Pulihkan Database (.json)</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleSelectRestoreFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
                <div className="bg-slate-950/60 border border-emerald-500/30 rounded-lg p-3">
                  <div className="font-bold text-emerald-300 mb-1">🛡️ Bundel Update Aman (.ZIP)</div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Tombol <strong className="text-emerald-300">Download Paket Siap Upload cPanel (.zip)</strong> hanya berisi update fitur/tampilan terbaru dan <strong>tidak menimpa</strong> file database live <code className="text-amber-300">data/baraka-db.json</code> di hosting Anda.
                  </p>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <div className="font-bold text-amber-300 mb-1">📦 Backup Database Terpisah (.JSON)</div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Gunakan tombol <strong className="text-amber-300">Download Full Database (.json)</strong> untuk mencadangkan atau memindahkan seluruh Course, Pos, Peserta, Akun Organizer, dan Skor.
                  </p>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <div className="font-bold text-purple-300 mb-1">🚀 Alur Update Mudah ke cPanel</div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Setiap selesai mengubah fitur lewat AI Studio, cukup unduh bundel <strong>.zip</strong>, unggah &amp; Extract di folder aplikasi cPanel, lalu klik <strong>Restart</strong> di Setup Node.js App.
                  </p>
                </div>
              </div>
            </div>
        )}

      {/* Modal Konfirmasi Hapus 1 Peserta */}
      {confirmDeleteParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400">
                  Konfirmasi Hapus Peserta
                </span>
                <h3 className="text-base font-bold text-white">
                  Hapus Tim "{confirmDeleteParticipant.teamName}"?
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus peserta Tim{' '}
              <strong className="text-emerald-300">
                {confirmDeleteParticipant.teamName}
              </strong>{' '}
              (Pendaftar: <strong className="text-white">{confirmDeleteParticipant.name}</strong>) beserta seluruh sesi dan riwayat laporannya?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingParticipants}
                onClick={() => setConfirmDeleteParticipant(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingParticipants}
                onClick={handleConfirmDeleteParticipant}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
              >
                {isDeletingParticipants ? 'Menghapus...' : 'Ya, Hapus Peserta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Massal Peserta */}
      {confirmBulkDeleteScope && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400">
                  Konfirmasi Pembersihan Peserta
                </span>
                <h3 className="text-base font-bold text-white">
                  {confirmBulkDeleteScope === 'ALL'
                    ? 'Hapus Seluruh Daftar Peserta?'
                    : confirmBulkDeleteScope === 'SELF_REGISTERED'
                      ? 'Hapus Semua Peserta Daftar Mandiri?'
                      : 'Hapus Semua Peserta Buatan Anda?'}
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {confirmBulkDeleteScope === 'ALL' ? (
                <>
                  Tindakan ini akan menghapus{' '}
                  <strong className="text-white">
                    seluruh peserta terdaftar ({dashboard?.participants.length || 0} peserta)
                  </strong>{' '}
                  baik yang dibuat oleh Superadmin, Organizer, maupun yang mendaftar mandiri, beserta seluruh sesi &amp; hasil lombanya.
                </>
              ) : confirmBulkDeleteScope === 'SELF_REGISTERED' ? (
                <>
                  Tindakan ini akan menghapus seluruh peserta yang{' '}
                  <strong className="text-sky-300">mendaftar mandiri</strong> beserta sesi lombanya, sementara peserta yang didaftarkan oleh Panitia/Superadmin tetap aman.
                </>
              ) : (
                <>
                  Tindakan ini akan menghapus seluruh peserta yang{' '}
                  <strong className="text-emerald-300">Anda daftarkan sendiri</strong> beserta riwayat sesi lombanya. Peserta milik Organizer lain atau daftar mandiri tidak akan terhapus.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingParticipants}
                onClick={() => setConfirmBulkDeleteScope(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingParticipants}
                onClick={handleConfirmBulkDeleteParticipants}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
              >
                {isDeletingParticipants ? 'Menghapus...' : 'Ya, Hapus Sekarang'}
              </button>
            </div>
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

      {/* Modal Konfirmasi Intervensi Darurat Superadmin */}
      {isConfirmEmergencyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/50 bg-slate-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400 font-bold">
                  Otorisasi Superadmin
                </span>
                <h3 className="text-base font-bold text-white">
                  Aktifkan Mode Intervensi Darurat?
                </h3>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>
                Secara normal, Superadmin berada dalam <strong>Mode Pantau (Read-Only)</strong> agar Course, titik Peta, Pos CP, dan Peserta milik Admin tidak terubah secara tidak sengaja.
              </p>
              <p className="text-rose-300">
                Dengan mengaktifkan <strong>Intervensi Darurat</strong>, seluruh kunci pengaman akan dibuka sementara sehingga Anda dapat membuat, mengedit, menggeser titik peta, maupun menghapus Course, CP, dan Peserta.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmEmergencyOpen(false)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Batal (Tetap Mode Pantau)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSuperAdminEmergencyMode(true);
                  setIsConfirmEmergencyOpen(false);
                  showTemporarySuccess(
                    'Mode Intervensi Darurat diaktifkan! Kunci edit/hapus kini terbuka sementara.'
                  );
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-rose-600/20"
              >
                Ya, Buka Intervensi Darurat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bagikan Link Live Leaderboard Penonton (Khusus Course Tertentu) */}
      {shareSpectatorCourse && (
        <ShareSpectatorLiveModal
          course={shareSpectatorCourse}
          onClose={() => setShareSpectatorCourse(null)}
        />
      )}

      {/* Bulk Print QR Modal (2 to 8 QR per page — Satu-satunya pintu cetak semua QR) */}
      {bulkPrintCourse && (
        <BulkQrPrintModal
          course={bulkPrintCourse}
          onClose={() => setBulkPrintCourse(null)}
        />
      )}

      {/* Modal Lembar Informasi Course & Tabel Pos Checkpoint */}
      {infoSheetCourse && (
        <CourseInfoSheetModal
          course={infoSheetCourse}
          onClose={() => setInfoSheetCourse(null)}
        />
      )}

      {/* Fullscreen Spectator Arena Live Leaderboard Modal */}
      {isSpectatorFullscreen && dashboard && (
        <SpectatorLiveLeaderboardModal
          courses={dashboard.courses}
          sessions={dashboard.sessions}
          participants={dashboard.participants}
          initialCourseId={selectedCourse?.id}
          onClose={() => setIsSpectatorFullscreen(false)}
        />
      )}

      {/* Modal Konfirmasi Restore Database (100% Mandiri) */}
      {pendingRestoreData && restoreStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/50 bg-slate-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Konfirmasi Pemulihan Database
                </span>
                <h3 className="text-base font-bold text-white">
                  Pulihkan Seluruh Database Lomba?
                </h3>
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs font-mono">
              <div className="text-slate-400 font-semibold mb-1">
                Data yang terdeteksi di dalam file backup:
              </div>
              <div className="flex justify-between text-slate-200">
                <span>• Total Course:</span>
                <strong className="text-amber-300">
                  {restoreStats.coursesCount} Course
                </strong>
              </div>
              <div className="flex justify-between text-slate-200">
                <span>• Total Peserta Terdaftar:</span>
                <strong className="text-emerald-300">
                  {restoreStats.participantsCount} Peserta
                </strong>
              </div>
              <div className="flex justify-between text-slate-200">
                <span>• Total Sesi Hasil Lari:</span>
                <strong className="text-sky-300">
                  {restoreStats.sessionsCount} Sesi
                </strong>
              </div>
              {restoreStats.exportedAt && (
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800">
                  Waktu Ekspor: {new Date(restoreStats.exportedAt).toLocaleString('id-ID')}
                </div>
              )}
            </div>

            <p className="text-xs text-rose-300 leading-relaxed bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-lg">
              ⚠️ <strong>Perhatian:</strong> Database server akan diperbarui mengikuti isi file backup ini. Seluruh data Course, Pos, Peserta, dan Sesi akan disinkronkan seketika.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isRestoringDb}
                onClick={() => {
                  setPendingRestoreData(null);
                  setRestoreStats(null);
                }}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isRestoringDb}
                onClick={handleExecuteRestoreDatabase}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20"
              >
                {isRestoringDb ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Memulihkan Database...
                  </>
                ) : (
                  'Ya, Pulihkan Database Sekarang'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ganti Password Organizer Sendiri */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Ganti Password Akun</h3>
                  <p className="text-xs text-slate-400">
                    {dashboard?.currentOrganizer?.name || 'Organizer / Superadmin'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsChangePasswordOpen(false);
                  setChangePassError(null);
                  setChangePassCurrent('');
                  setChangePassNew('');
                  setChangePassConfirm('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleChangeOwnPassword();
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password Saat Ini <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={changePassCurrent}
                  onChange={(e) => setChangePassCurrent(e.target.value)}
                  placeholder="Masukkan password saat ini"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password Baru (Min. 6 Karakter) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={changePassNew}
                  onChange={(e) => setChangePassNew(e.target.value)}
                  placeholder="Minimal 6 karakter (bebas kombinasi)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Boleh huruf, angka, tanda baca, simbol, atau gabungan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Konfirmasi Password Baru <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={changePassConfirm}
                  onChange={(e) => setChangePassConfirm(e.target.value)}
                  placeholder="Ulangi password baru"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              {changePassError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {changePassError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsChangePasswordOpen(false);
                    setChangePassError(null);
                    setChangePassCurrent('');
                    setChangePassNew('');
                    setChangePassConfirm('');
                  }}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={changePassLoading}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {changePassLoading ? (
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

      {/* Modal Edit Kuota Course & Masa Aktif Organizer */}
      {selectedEditOrg && token && (
        <EditOrganizerQuotaModal
          organizer={selectedEditOrg}
          token={token}
          onClose={() => setSelectedEditOrg(null)}
          onSuccess={async () => {
            setSelectedEditOrg(null);
            await fetchDashboard();
            showTemporarySuccess(
              'Pengaturan kuota course & masa aktif organizer berhasil diperbarui!'
            );
          }}
        />
      )}

      {/* Modal Pop-Up Rincian Peserta (Biodata, WA, Skor & Tabel Split Time Pos CP) */}
      {detailModalParticipant && dashboard && (
        <ParticipantDetailModal
          participant={
            dashboard.participants.find(
              (p) => p.id === detailModalParticipant.id
            ) || detailModalParticipant
          }
          course={selectedCourse}
          allCourses={dashboard.courses}
          organizerName={
            selectedCourse?.createdByOrganizerName ||
            dashboard.organizers?.find(
              (o) => o.id === selectedCourse?.createdByOrganizerId
            )?.name ||
            'Superadmin / Panitia'
          }
          participantRows={leaderboardRows.filter(
            (r) =>
              (!selectedCourse || r.courseId === selectedCourse.id) &&
              r.participantId === detailModalParticipant.id
          )}
          initialSessionId={detailModalSessionId}
          reports={dashboard.reports}
          isSuperAdminReadOnly={isSuperAdminReadOnly}
          resetParticipantPasswordId={resetParticipantPasswordId}
          resetParticipantPasswordValue={resetParticipantPasswordValue}
          onClose={() => {
            setDetailModalParticipant(null);
            setDetailModalSessionId(null);
          }}
          onSetResetParticipantPasswordId={setResetParticipantPasswordId}
          onSetResetParticipantPasswordValue={setResetParticipantPasswordValue}
          onSaveResetParticipantPassword={handleSaveResetParticipantPassword}
          onConfirmDeleteParticipant={(p) => {
            setDetailModalParticipant(null);
            setConfirmDeleteParticipant(p);
          }}
        />
      )}
      {/* Modal Override Manual Estafet Panitia (Darurat Offline / Baterai Habis) */}
      {relayOverrideTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/50 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300 font-bold">
                    Override Estafet Manual Panitia
                  </span>
                  <h3 className="text-base font-bold text-white">
                    {relayOverrideTarget.teamLabel}
                  </h3>
                  <div className="text-[11px] text-slate-400">
                    {relayOverrideTarget.parentTeamName
                      ? `Tim Induk: ${relayOverrideTarget.parentTeamName} • Sub-Team #${relayOverrideTarget.legIndex || '?'}`
                      : 'Belum mengatur Tim Induk'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRelayOverrideTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteRelayOverride} className="space-y-3 text-xs">
              <div className="space-y-2">
                <label className="block text-slate-300 font-semibold">
                  Pilih Tindakan Darurat:
                </label>

                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                    relayOverrideAction === 'UNLOCK_LEG'
                      ? 'bg-sky-500/15 border-sky-400 text-sky-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="relayOverrideAction"
                    checked={relayOverrideAction === 'UNLOCK_LEG'}
                    onChange={() => setRelayOverrideAction('UNLOCK_LEG')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold">
                      Buka Kunci Giliran Start (Unlock Sub-Team)
                    </div>
                    <div className="text-[11px] opacity-80">
                      Izinkan Sub-Team ini langsung Scan Start QR tanpa menunggu sinyal/Finish dari Sub-Team sebelumnya.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                    relayOverrideAction === 'FORCE_FINISH'
                      ? 'bg-emerald-500/15 border-emerald-400 text-emerald-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="relayOverrideAction"
                    checked={relayOverrideAction === 'FORCE_FINISH'}
                    onChange={() => setRelayOverrideAction('FORCE_FINISH')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold flex items-center gap-1">
                      <Flag className="w-3.5 h-3.5" />
                      Paksa Selesaikan (Force Finish)
                    </div>
                    <div className="text-[11px] opacity-80">
                      Hentikan waktu sebagai Finish bersih (misal HP mati di garis Finish) dan otomatis buka giliran Sub-Team berikutnya.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                    relayOverrideAction === 'FORCE_DNF'
                      ? 'bg-rose-500/15 border-rose-400 text-rose-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="relayOverrideAction"
                    checked={relayOverrideAction === 'FORCE_DNF'}
                    onChange={() => setRelayOverrideAction('FORCE_DNF')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold">
                      Tandai Gugur / DNF (Force DNF)
                    </div>
                    <div className="text-[11px] opacity-80">
                      Tutup sesi sebagai DNF (hitung skor sesuai aturan DNF Relay) dan otomatis buka giliran Sub-Team berikutnya.
                    </div>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">
                  Catatan Alasan Override (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: HP Sub-Team 1 habis baterai saat tiba di Finish"
                  value={relayOverrideReason}
                  onChange={(e) => setRelayOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRelayOverrideTarget(null)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isExecutingRelayOverride}
                  className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isExecutingRelayOverride ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    'Terapkan Override'
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
