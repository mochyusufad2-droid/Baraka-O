import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutDashboard,
  Map as MapIcon,
  Radio,
  Trophy,
  Plus,
  Trash2,
  QrCode,
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
  Copy,
  Check,
  Printer,
  Calendar,
  MapPin,
} from 'lucide-react';
import {
  Course,
  Checkpoint,
  CheckpointReport,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus,
  ValidationMethod,
} from '../../types';
import { QrCardModal, BulkQrPrintModal } from './QrPrintModals';

interface DashboardApiData {
  serverTime: string;
  courses: Course[];
  participants: ParticipantPublic[];
  sessions: ParticipantSession[];
  reports: CheckpointReport[];
}

type OrganizerTab = 'OVERVIEW' | 'COURSES' | 'MONITORING' | 'RESULT';

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

export default function OrganizerDashboard() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(ORG_TOKEN_STORAGE_KEY)
  );
  const [pinInput, setPinInput] = useState<string>('123456');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<OrganizerTab>('OVERVIEW');
  const [dashboard, setDashboard] = useState<DashboardApiData | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedQr, setCopiedQr] = useState<string | null>(null);
  const [previewQr, setPreviewQr] = useState<{
    title: string;
    subtitle: string;
    payload: string;
  } | null>(null);
  const [bulkPrintCourse, setBulkPrintCourse] = useState<Course | null>(null);

  // Unified Course Creation Form State (1-Step Course Setup)
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
  const [newCourseRadius, setNewCourseRadius] = useState<number>(35);
  const [newCourseEnforceOrder, setNewCourseEnforceOrder] = useState<boolean>(true);

  // Form States for Checkpoint Creation
  const [cpCode, setCpCode] = useState('');
  const [cpName, setCpName] = useState('');
  const [cpPoints, setCpPoints] = useState<number>(100);
  const [cpLat, setCpLat] = useState<string>('-6.8586');
  const [cpLng, setCpLng] = useState<string>('107.6305');
  const [cpRadius, setCpRadius] = useState<number>(35);

  // Form States for Participant Creation by Organizer
  const [partName, setPartName] = useState('');
  const [partTeam, setPartTeam] = useState('');
  const [partPhone, setPartPhone] = useState('');
  const [partPin, setPartPin] = useState('');
  const [partStatusMsg, setPartStatusMsg] = useState<string | null>(null);

  // Live timer tick for active sessions
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(ORG_TOKEN_STORAGE_KEY);
    setToken(null);
    setDashboard(null);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/organizer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'PIN Organizer tidak valid.');
        return;
      }
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

  // Compute Leaderboard rows sorted by Status (FINISHED > ACTIVE > NOT_STARTED), Score DESC, Duration ASC
  const leaderboardRows = useMemo(() => {
    if (!dashboard) return [];
    const filteredSessions = dashboard.sessions.filter(
      (s: ParticipantSession) => !selectedCourse || s.courseId === selectedCourse.id
    );

    const statusWeight = (status: SessionStatus) => {
      if (status === SessionStatus.FINISHED) return 3;
      if (status === SessionStatus.ACTIVE) return 2;
      return 1;
    };

    return [...filteredSessions]
      .sort((a, b) => {
        const wDiff = statusWeight(b.status) - statusWeight(a.status);
        if (wDiff !== 0) return wDiff;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        const aDur = a.durationSeconds ?? Number.MAX_SAFE_INTEGER;
        const bDur = b.durationSeconds ?? Number.MAX_SAFE_INTEGER;
        return aDur - bDur;
      })
      .map((sess, idx) => {
        const participant = dashboard.participants.find(
          (p: ParticipantPublic) => p.id === sess.participantId
        );
        const course = dashboard.courses.find((c: Course) => c.id === sess.courseId);
        const liveDurationSec =
          sess.status === SessionStatus.FINISHED
            ? sess.durationSeconds
            : sess.status === SessionStatus.ACTIVE && sess.startedAt
            ? Math.max(0, Math.floor((nowTick - Date.parse(sess.startedAt)) / 1000))
            : undefined;

        return {
          rank: idx + 1,
          sessionId: sess.id,
          bibNumber: participant?.bibNumber || '-',
          participantName: participant?.name || 'Peserta',
          teamName: participant?.teamName || '-',
          courseId: sess.courseId,
          courseName: course?.name || sess.courseId,
          status: sess.status,
          checkpointsCompleted: sess.validatedCheckpointIds.length,
          totalCheckpoints: course?.checkpoints.length || 0,
          totalScore: sess.totalScore,
          durationSeconds: liveDurationSec,
          lastLocationAt: sess.lastLocation?.measuredAt,
        };
      });
  }, [dashboard, selectedCourse, nowTick]);

  const handleCopyQr = (qrText: string) => {
    navigator.clipboard.writeText(qrText);
    setCopiedQr(qrText);
    setTimeout(() => setCopiedQr(null), 1800);
  };

  // Create Unified Course
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim() || !token) return;
    try {
      const res = await fetch('/api/organizer/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCourseName,
          description: newCourseDescription,
          locationName: newCourseLocation || 'Area Lomba Utama',
          date: newCourseDate,
          scoringEnabled: newCourseScoring,
          validationMethod: newCourseValidation,
          defaultGpsRadiusMeters: newCourseRadius,
          enforceOrder: newCourseEnforceOrder,
          allowParticipantMapVisibility: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat Course baru');
      const created: Course = data.course;
      setNewCourseName('');
      setNewCourseDescription('');
      setNewCourseLocation('');
      await fetchDashboard();
      if (created?.id) {
        setSelectedCourseId(created.id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat Course');
    }
  };

  // Add Checkpoint to Course
  const handleAddCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !cpCode.trim() || !cpName.trim() || !token) return;
    try {
      const res = await fetch(
        `/api/organizer/courses/${selectedCourse.id}/checkpoints`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            code: cpCode,
            name: cpName,
            points: cpPoints,
            latitude: parseFloat(cpLat),
            longitude: parseFloat(cpLng),
            radiusMeters: cpRadius,
          }),
        }
      );
      if (!res.ok) throw new Error('Gagal menambahkan checkpoint');
      setCpCode('');
      setCpName('');
      await fetchDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambahkan checkpoint');
    }
  };

  // Delete Checkpoint
  const handleDeleteCheckpoint = async (cpId: string) => {
    if (!selectedCourse || !token) return;
    try {
      await fetch(
        `/api/organizer/courses/${selectedCourse.id}/checkpoints/${cpId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      await fetchDashboard();
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

  // Export CSV Leaderboard
  const handleExportCsv = () => {
    const headers = [
      'Rank',
      'BIB',
      'Nama Peserta',
      'Nama Tim',
      'Course',
      'Status',
      'CP Valid',
      'Total CP',
      'Skor Poin',
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
          r.status,
          r.checkpointsCompleted,
          r.totalCheckpoints,
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

  // Organizer Login View
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
                Otorisasi Panitia
              </span>
              <h2 className="text-lg font-bold text-white">
                Login Dashboard Organizer
              </h2>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Masukkan PIN Organizer untuk mengelola Course, mencetak QR Code
            massal (2–8 QR per halaman), memantau peserta aktif, dan mengunduh
            hasil lomba.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                PIN Keamanan Organizer
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Masukkan PIN Organizer (Default: 123456)"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-amber-400"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                PIN bawaan demo: <code className="text-amber-300">123456</code>{' '}
                (Disimpan dalam bentuk Hash + Salt di server).
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
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
            >
              {isLoggingIn ? 'Memverifikasi PIN...' : 'Masuk ke Dashboard Organizer'}
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
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">
                PUSAT KENDALI ORGANIZER
              </span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                COURSE UNIFIED
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Kelola Course, Cetak QR Code Massal (2–8/Hal), Live Monitoring &amp;
              Leaderboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {dashboard && dashboard.courses.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5">
              <MapIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedCourse?.id || ''}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none font-medium"
              >
                {dashboard.courses.map((c: Course) => (
                  <option
                    key={c.id}
                    value={c.id}
                    className="bg-slate-900 text-slate-100"
                  >
                    {c.name}
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

      {/* 4 Main Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-800">
        {[
          { id: 'OVERVIEW', label: '1. Overview', icon: LayoutDashboard },
          { id: 'COURSES', label: '2. Course Management', icon: MapIcon },
          { id: 'MONITORING', label: '3. Live Monitoring', icon: Radio },
          { id: 'RESULT', label: '4. Result & Leaderboard', icon: Trophy },
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
            {/* Selected Course Summary Card */}
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBulkPrintCourse(selectedCourse)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print QR Massal (2–8/Hal)
                    </button>
                    <button
                      onClick={() => setActiveTab('COURSES')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      Kelola Course &amp; QR →
                    </button>
                  </div>
                )}
              </div>

              {selectedCourse ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {selectedCourse.description}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="text-slate-400">Lokasi Course</div>
                      <div className="font-semibold text-white mt-0.5">
                        {selectedCourse.locationName}
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
                          : 'Bebas (Score Orienteering)'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
                      <div className="text-slate-400">Tanggal Pelaksanaan</div>
                      <div className="font-mono font-semibold text-emerald-400 mt-0.5">
                        {selectedCourse.date}
                      </div>
                    </div>
                  </div>

                  {/* Quick QR Codes Preview */}
                  <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-amber-400" />
                      Kode QR Utama (Setup, Start, Finish) — Course:{' '}
                      {selectedCourse.name}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      {[
                        {
                          label: '1. Setup Course QR',
                          code: selectedCourse.setupQrCode,
                        },
                        {
                          label: '2. Start Timer QR',
                          code: selectedCourse.startQrCode,
                        },
                        {
                          label: '3. Finish Timer QR',
                          code: selectedCourse.finishQrCode,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="p-2.5 rounded bg-slate-950 border border-slate-800 flex flex-col justify-between gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-semibold">
                              {item.label}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  setPreviewQr({
                                    title: item.label.toUpperCase(),
                                    subtitle: `Course: ${selectedCourse.name}`,
                                    payload: item.code,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1"
                              >
                                <QrCode className="w-3 h-3" /> QR
                              </button>
                              <button
                                onClick={() => handleCopyQr(item.code)}
                                className="text-slate-400 hover:text-slate-200 p-1"
                                title="Salin Teks Payload"
                              >
                                {copiedQr === item.code ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                          <code className="text-[11px] font-mono text-emerald-300 break-all">
                            {item.code}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Silakan buat Course di tab Course Management.
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

      {/* TAB 2: UNIFIED COURSE MANAGEMENT */}
      {activeTab === 'COURSES' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 cols: Create Unified Course Form */}
            <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[11px] font-mono uppercase text-amber-400">
                  1-Step Course Setup (Penyatuan Event &amp; Course)
                </span>
                <h3 className="text-sm font-bold text-white">
                  Buat Course Baru &amp; Aturan Validasi
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
                      Lokasi Lomba *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Tahura Bandung"
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
                    Deskripsi / Instruksi Course
                  </label>
                  <input
                    type="text"
                    placeholder="Lintasan cepat 4 pos kontrol wajib"
                    value={newCourseDescription}
                    onChange={(e) => setNewCourseDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 mb-1">
                      Metode Validasi (Oleh Penyelenggara)
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
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={newCourseRadius}
                      onChange={(e) =>
                        setNewCourseRadius(Number(e.target.value))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>
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
                    Pilih Course untuk Kelola Checkpoint &amp; Print QR Code
                    Massal
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {dashboard.courses.length} Course
                </span>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {dashboard.courses.map((c: Course) => {
                  const isSelected = selectedCourse?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCourseId(c.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 text-white'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">
                            {c.name}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            {c.checkpoints.length} CP
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            {c.locationName}
                          </span>
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
            </div>
          </div>

          {/* Bottom Row: Selected Course QR & Checkpoints */}
          {selectedCourse && (
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      {selectedCourse.locationName} ({selectedCourse.date})
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Validasi: {selectedCourse.validationMethod} • Radius
                      Default: {selectedCourse.defaultGpsRadiusMeters}m
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1">
                    {selectedCourse.name}
                  </h2>
                </div>

                {/* Bulk Print QR Button (2 to 8 QR per page) */}
                <button
                  onClick={() => setBulkPrintCourse(selectedCourse)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/10 transition"
                >
                  <Printer className="w-4 h-4" />
                  Print QR Code Massal (2 - 8 QR / Halaman)
                </button>
              </div>

              {/* Course Control QR Codes (Setup, Start, Finish) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    title: 'SETUP QR CODE',
                    desc: 'Wajib di-scan peserta untuk masuk Course',
                    code: selectedCourse.setupQrCode,
                    color: 'text-sky-300 border-sky-500/30 bg-sky-500/5',
                  },
                  {
                    title: 'START QR CODE',
                    desc: 'Di-scan peserta di garis Start untuk mulai waktu',
                    code: selectedCourse.startQrCode,
                    color:
                      'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
                  },
                  {
                    title: 'FINISH QR CODE',
                    desc: 'Di-scan peserta di garis Finish untuk hentikan waktu',
                    code: selectedCourse.finishQrCode,
                    color: 'text-amber-300 border-amber-500/30 bg-amber-500/5',
                  },
                ].map((qr) => (
                  <div
                    key={qr.title}
                    className={`p-3.5 rounded-xl border ${qr.color} flex flex-col justify-between gap-2`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold tracking-wider">
                          {qr.title}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setPreviewQr({
                                title: qr.title,
                                subtitle: `Course: ${selectedCourse.name}`,
                                payload: qr.code,
                              })
                            }
                            className="px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-500/40 text-[11px] font-semibold flex items-center gap-1 transition"
                          >
                            <QrCode className="w-3 h-3" />
                            Lihat &amp; Unduh QR
                          </button>
                          <button
                            onClick={() => handleCopyQr(qr.code)}
                            className="p-1.5 rounded bg-slate-900/80 hover:bg-slate-900 text-slate-200"
                            title="Salin Teks Payload"
                          >
                            {copiedQr === qr.code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {qr.desc}
                      </p>
                    </div>
                    <code className="text-xs font-mono bg-slate-950/90 px-2.5 py-1.5 rounded border border-slate-800 break-all">
                      {qr.code}
                    </code>
                  </div>
                ))}
              </div>

              {/* Add Checkpoint Form */}
              <form
                onSubmit={handleAddCheckpoint}
                className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3 text-xs"
              >
                <div className="font-semibold text-slate-200 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-amber-400" />
                  Tambah Checkpoint (Pos Kontrol) ke {selectedCourse.name}
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
                      Nama Lokasi Pos *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Simpang Sungai Batu"
                      value={cpName}
                      onChange={(e) => setCpName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Poin</label>
                    <input
                      type="number"
                      value={cpPoints}
                      onChange={(e) => setCpPoints(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Latitude
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
                      Longitude
                    </label>
                    <input
                      type="text"
                      value={cpLng}
                      onChange={(e) => setCpLng(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2.5">
                  <span className="text-slate-400 whitespace-nowrap">
                    Radius Validasi GPS (m):
                  </span>
                  <input
                    type="number"
                    value={cpRadius}
                    onChange={(e) => setCpRadius(Number(e.target.value))}
                    className="w-20 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold whitespace-nowrap transition"
                  >
                    + Tambah Pos
                  </button>
                </div>
              </form>

              {/* Checkpoint Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                      <th className="py-2.5 px-3">Urutan</th>
                      <th className="py-2.5 px-3">Kode &amp; Nama Pos</th>
                      <th className="py-2.5 px-3">Poin</th>
                      <th className="py-2.5 px-3">Koordinat GPS (Radius)</th>
                      <th className="py-2.5 px-3">QR Secret Payload</th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {selectedCourse.checkpoints.map((cp: Checkpoint) => (
                      <tr key={cp.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          #{cp.orderIndex}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-amber-400 mr-2">
                            {cp.code}
                          </span>
                          <span className="font-medium text-white">
                            {cp.name}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">
                          {cp.points} pts
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)}{' '}
                          <span className="text-slate-500">
                            ({cp.radiusMeters}m)
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                setPreviewQr({
                                  title: `${cp.code} — ${cp.name}`,
                                  subtitle: `Course: ${selectedCourse.name} • Radius: ${cp.radiusMeters}m • Poin: ${cp.points}`,
                                  payload: cp.qrSecret,
                                })
                              }
                              className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1 shrink-0 transition"
                            >
                              <QrCode className="w-3 h-3" />
                              QR
                            </button>
                            <code className="font-mono text-[11px] text-sky-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                              {cp.qrSecret}
                            </code>
                            <button
                              onClick={() => handleCopyQr(cp.qrSecret)}
                              className="text-slate-400 hover:text-white"
                              title="Salin QR Checkpoint"
                            >
                              {copiedQr === cp.qrSecret ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteCheckpoint(cp.id)}
                            className="p-1 text-slate-400 hover:text-rose-400"
                            title="Hapus Checkpoint"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
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

                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                            <div className="text-slate-400 text-[11px]">
                              Waktu Berjalan
                            </div>
                            <div className="font-mono font-bold text-sm text-white mt-0.5 flex items-center gap-1">
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
                              Total Skor
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
                  tertinggi → Waktu tempuh tercepat.
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
                    <th className="py-3 px-3">Total Skor</th>
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
                        {row.courseName}
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
                      <td className="py-3 px-3 font-mono font-bold text-emerald-400">
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

      {/* Single QR Code Preview & Download Modal */}
      {previewQr && (
        <QrCardModal
          title={previewQr.title}
          subtitle={previewQr.subtitle}
          payload={previewQr.payload}
          onClose={() => setPreviewQr(null)}
        />
      )}

      {/* Bulk Print QR Modal (2 to 8 QR per page) */}
      {bulkPrintCourse && (
        <BulkQrPrintModal
          course={bulkPrintCourse}
          onClose={() => setBulkPrintCourse(null)}
        />
      )}
    </div>
  );
}
