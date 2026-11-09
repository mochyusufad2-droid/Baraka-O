import React, { useState, useMemo } from 'react';
import {
  Shield,
  Map as MapIcon,
  Users,
  User,
  ChevronRight,
  MapPin,
  Clock,
  CheckCircle2,
  Trophy,
  Radio,
  Phone,
  KeyRound,
  Trash2,
  X,
  Activity,
  Award,
  Compass,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  AllTimePlatformStats,
  Course,
  CheckpointReport,
  OrganizerPublic,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus,
} from '../../types';
import { InvestorReportModal } from './InvestorReportModal';

export interface ExplorerSplitItem {
  stepIndex: number;
  checkpointId: string;
  shortCode: string;
  fullCode: string;
  points: number;
  cumulativeSeconds?: number;
  legSplitSeconds?: number;
  measuredAt?: string;
}

export interface ExplorerLeaderboardRow {
  rank: number;
  sessionId: string;
  participantId: string;
  bibNumber: string;
  participantName: string;
  teamName: string;
  gender: string;
  ageGroup: string;
  courseId: string;
  courseName: string;
  attemptNumber: number;
  status: SessionStatus;
  checkpointsCompleted: number;
  totalCheckpoints: number;
  grossScore: number;
  overtimeMinutes: number;
  penaltyPoints: number;
  totalScore: number;
  durationSeconds?: number;
  startedAt?: string;
  finishedAt?: string;
  entryDateLabel: string;
  entryTimeLabel: string;
  splits: ExplorerSplitItem[];
  finishCumulativeSeconds?: number;
  finishSplitSeconds?: number;
  lastLocationAt?: string;
  isDnf?: boolean;
  dnfReason?: string;
}

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

// ============================================================================
// BLOK A (RADAR LIVE SAAT INI) & BLOK B (REKAM JEJAK SEJAK AWAL DIBUAT)
// Ditampilkan di bagian atas Tab 1: Overview khusus Superadmin
// ============================================================================
interface SuperAdminGlobalOverviewBlocksProps {
  courses: Course[];
  organizers: OrganizerPublic[];
  participants: ParticipantPublic[];
  sessions: ParticipantSession[];
  reports?: CheckpointReport[];
  allTimeStats?: AllTimePlatformStats;
  selectedOrganizerFilter: string;
  onSelectCourseToMonitor: (course: Course) => void;
  onSelectOrganizerFilter: (organizerId: string) => void;
}

export function SuperAdminGlobalOverviewBlocks({
  courses,
  organizers,
  participants,
  sessions,
  reports = [],
  allTimeStats,
  selectedOrganizerFilter,
  onSelectCourseToMonitor,
  onSelectOrganizerFilter,
}: SuperAdminGlobalOverviewBlocksProps) {
  const [isInvestorModalOpen, setIsInvestorModalOpen] =
    useState<boolean>(false);

  // Hitung statistik BLOK A (Real-Time Saat Ini di seluruh platform)
  const liveStats = useMemo(() => {
    const activeRunningSessions = sessions.filter(
      (s) => s.status === SessionStatus.ACTIVE && !s.isDnf
    );
    const finishedSessions = sessions.filter(
      (s) => s.status === SessionStatus.FINISHED && !s.isDnf
    );
    const dnfSessions = sessions.filter((s) => Boolean(s.isDnf));

    // Course yang saat ini sedang memiliki peserta ACTIVE berlari di lintasan
    const runningCourseIdSet = new Set(
      activeRunningSessions.map((s) => s.courseId)
    );
    const runningCourses = courses.filter((c) => runningCourseIdSet.has(c.id));

    return {
      runningCoursesCount: runningCourses.length,
      runningCourses,
      activeRunnersCount: activeRunningSessions.length,
      finishedRunnersCount: finishedSessions.length,
      dnfRunnersCount: dnfSessions.length,
    };
  }, [courses, sessions]);

  // Hitung statistik BLOK B (Rekam Jejak Kumulatif Sejak Awal Dibuat s/d Sekarang)
  const cumulativeStats = useMemo(() => {
    // Gabungkan data server allTimeStats dengan data aktif saat ini agar selalu akurat minimal sebesar data aktif
    const totalOrganizersEver = Math.max(
      allTimeStats?.totalOrganizersEver || 0,
      organizers.length
    );
    const totalCoursesEver = Math.max(
      allTimeStats?.totalCoursesEver || 0,
      courses.length
    );
    const totalParticipantsEver = Math.max(
      allTimeStats?.totalParticipantsEver || 0,
      participants.length
    );
    const totalSessionsEver = Math.max(
      allTimeStats?.totalSessionsEver || 0,
      sessions.length
    );

    const locMap = new Map<
      string,
      { locationName: string; coursesCount: number; lastUsedDate?: string }
    >();

    if (allTimeStats?.locations && allTimeStats.locations.length > 0) {
      allTimeStats.locations.forEach((loc) => {
        if (loc.locationName?.trim()) {
          locMap.set(loc.locationName.trim().toLowerCase(), { ...loc });
        }
      });
    } else {
      courses.forEach((c) => {
        const cleanLoc = (c.locationName || '').trim();
        if (!cleanLoc) return;
        const key = cleanLoc.toLowerCase();
        const existing = locMap.get(key);
        if (!existing) {
          locMap.set(key, {
            locationName: cleanLoc,
            coursesCount: 1,
            lastUsedDate: c.date,
          });
        } else {
          existing.coursesCount += 1;
          if (
            c.date &&
            (!existing.lastUsedDate || c.date > existing.lastUsedDate)
          ) {
            existing.lastUsedDate = c.date;
          }
        }
      });
    }

    const locationsList = Array.from(locMap.values()).sort(
      (a, b) => b.coursesCount - a.coursesCount
    );

    const totalCheckpointsActive = courses.reduce(
      (sum, c) => sum + c.checkpoints.length,
      0
    );

    return {
      totalOrganizersEver,
      totalCoursesEver,
      totalParticipantsEver,
      totalSessionsEver,
      totalLocationsEver: locationsList.length,
      locationsList,
      totalCheckpointsActive,
    };
  }, [allTimeStats, organizers, courses, participants, sessions]);

  return (
    <div className="space-y-5">
      {/* ====================================================================
          BLOK A — RADAR LIVE SAAT INI (REAL-TIME ACTIVE RACE STATUS)
         ==================================================================== */}
      <div className="bg-[#0a1f38] border border-emerald-500/35 rounded-xl p-5 space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                  BLOK A • RADAR LIVE SAAT INI (REAL-TIME)
                </span>
              </div>
              <h2 className="text-base font-extrabold text-white">
                Pantauan Langsung Course &amp; Peserta yang Sedang Running Lomba Detik Ini
              </h2>
            </div>
          </div>

          <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Auto-Refresh Real-Time Aktif
          </span>
        </div>

        {/* 3 Kartu Utama Blok A */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Course Sedang Running Lomba</span>
              <Radio
                className={`w-4 h-4 ${
                  liveStats.runningCoursesCount > 0
                    ? 'text-emerald-400 animate-pulse'
                    : 'text-slate-500'
                }`}
              />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                {liveStats.runningCoursesCount}
              </span>
              <span className="text-xs font-mono text-slate-400">
                Course Sedang Live
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Dari total <strong className="text-white">{courses.length} Course</strong> yang tersedia saat ini
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Peserta Sedang Running (ACTIVE)</span>
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
                {liveStats.activeRunnersCount}
              </span>
              <span className="text-xs font-mono text-slate-400">
                Tim di Lintasan
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Stopwatch sedang berjalan (sudah Start, belum Finish)
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Sudah Finish / Selesai Lomba</span>
              <CheckCircle2 className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-sky-400">
                {liveStats.finishedRunnersCount}
              </span>
              <span className="text-xs font-mono text-slate-400">
                Sesi Selesai
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {liveStats.dnfRunnersCount > 0 ? (
                <span>
                  Termasuk catatan <strong className="text-rose-400">{liveStats.dnfRunnersCount} DNF (Gugur)</strong>
                </span>
              ) : (
                <span>Seluruh sesi selesai tanpa DNF</span>
              )}
            </div>
          </div>
        </div>

        {/* Daftar Course yang Sedang Running Detik Ini */}
        <div className="rounded-xl bg-slate-950/70 border border-slate-800/90 p-3.5 space-y-2.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold">
            Daftar Course yang Sedang Running Saat Ini ({liveStats.runningCoursesCount} Course):
          </div>

          {liveStats.runningCourses.length === 0 ? (
            <div className="py-3 px-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
              <span>
                Saat ini sedang tidak ada peserta yang berstatus ACTIVE di lintasan (0 tim sedang berlari).
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Standby
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {liveStats.runningCourses.map((c) => {
                const cSessions = sessions.filter((s) => s.courseId === c.id);
                const cActive = cSessions.filter(
                  (s) => s.status === SessionStatus.ACTIVE && !s.isDnf
                ).length;
                const cFinished = cSessions.filter(
                  (s) => s.status === SessionStatus.FINISHED && !s.isDnf
                ).length;

                return (
                  <div
                    key={c.id}
                    className="rounded-lg bg-slate-900/90 border border-emerald-500/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold">
                          🟢 LIVE RUNNING
                        </span>
                        <span className="font-bold text-white text-xs sm:text-sm">
                          {c.name}
                        </span>
                        <span className="text-xs font-mono text-sky-300">
                          • Organizer:{' '}
                          <strong>
                            {c.createdByOrganizerName || 'Superadmin'}
                          </strong>
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 flex flex-wrap items-center gap-3 font-mono">
                        <span>
                          📍 {c.locationName || 'Lokasi tidak diisi'}
                        </span>
                        <span className="text-amber-300 font-bold">
                          🏃 {cActive} Tim Sedang Lari
                        </span>
                        <span className="text-emerald-300">
                          🏁 {cFinished} Sudah Finish
                        </span>
                        <span className="text-slate-400">
                          🚩 {c.checkpoints.length} Pos CP
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectCourseToMonitor(c)}
                      className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Pantau Course Ini</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================
          BLOK B — REKAM JEJAK PENGGUNAAN ORIENTRA (SEJAK AWAL DIBUAT S/D SEKARANG)
         ==================================================================== */}
      <div className="bg-[#0a1f38] border border-amber-500/35 rounded-xl p-5 space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                BLOK B • REKAM JEJAK KUMULATIF ORIENTRA (SEJAK AWAL DIBUAT HINGGA SEKARANG)
              </span>
              <h2 className="text-base font-extrabold text-white">
                Total Akumulasi Penyelenggara, Course, Peserta &amp; Lokasi yang Pernah Dipakai
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsInvestorModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-amber-500/20"
              title="Buka Laporan Overview Investor (PDF/CSV) & Generator Materi Presentasi Google NotebookLM"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Laporan Investor &amp; Prompt NotebookLM</span>
              <Sparkles className="w-3.5 h-3.5" />
            </button>

            <span className="text-[11px] font-mono px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
              All-Time Platform Ledger
            </span>
          </div>
        </div>

        {/* 4 Kartu Milestone Utama Blok B */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Organizer</span>
              <Shield className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-white">
              {cumulativeStats.totalOrganizersEver}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Panitia/Instansi pernah terdaftar ({organizers.length} aktif)
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Course</span>
              <Compass className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
              {cumulativeStats.totalCoursesEver}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Pernah dibuat ({courses.length} aktif •{' '}
              {cumulativeStats.totalCheckpointsActive} CP)
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Peserta</span>
              <Users className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-sky-400">
              {cumulativeStats.totalParticipantsEver}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Tim/Peserta pernah ikut ({cumulativeStats.totalSessionsEver} total sesi)
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Lokasi Lomba</span>
              <MapPin className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
              {cumulativeStats.totalLocationsEver}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Titik lokasi unik pernah memakai ORIENTRA
            </div>
          </div>
        </div>

        {/* Daftar Lokasi & Daftar Organizer Pengguna ORIENTRA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Daftar Lokasi yang Pernah Dipakai */}
          <div className="rounded-xl bg-slate-950/75 border border-slate-800 p-3.5 space-y-2.5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>
                Daftar Lokasi yang Pernah Dipakai Menggunakan ORIENTRA (
                {cumulativeStats.totalLocationsEver} Lokasi):
              </span>
            </div>

            {cumulativeStats.locationsList.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-1">
                Belum ada nama lokasi spesifik yang diisi pada Course.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cumulativeStats.locationsList.map((loc) => (
                  <span
                    key={loc.locationName}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-emerald-500/30 text-xs text-slate-200"
                  >
                    <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                    <strong className="font-semibold text-white">
                      {loc.locationName}
                    </strong>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                      {loc.coursesCount} Course
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Daftar Organizer Pengguna ORIENTRA (Klik untuk langsung Filter) */}
          <div className="rounded-xl bg-slate-950/75 border border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-sky-400 font-bold flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span>
                  Filter Cepat Per Organizer ({organizers.length} Organizer Aktif):
                </span>
              </div>
              {selectedOrganizerFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => onSelectOrganizerFilter('ALL')}
                  className="text-[11px] font-mono text-amber-400 hover:underline cursor-pointer"
                >
                  Tampilkan Semua Organizer
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectOrganizerFilter('ALL')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                  selectedOrganizerFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold shadow'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                <span>Semua Organizer ({courses.length} Course)</span>
              </button>

              {organizers.map((org) => {
                const orgCourseCount = courses.filter(
                  (c) => c.createdByOrganizerId === org.id
                ).length;
                const isSelected = selectedOrganizerFilter === org.id;
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() =>
                      onSelectOrganizerFilter(isSelected ? 'ALL' : org.id)
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500 text-slate-950 border-sky-300 font-bold shadow'
                        : 'bg-slate-900 text-slate-200 border-slate-800 hover:border-sky-500/50'
                    }`}
                  >
                    <span>{org.name}</span>
                    {org.organization && (
                      <span
                        className={`text-[10px] ${
                          isSelected ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        ({org.organization})
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-slate-950/20 text-slate-950 font-bold'
                          : 'bg-sky-500/15 text-sky-300'
                      }`}
                    >
                      {orgCourseCount} Course
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Laporan Eksekutif Investor & Generator Presentasi NotebookLM */}
      {isInvestorModalOpen && (
        <InvestorReportModal
          courses={courses}
          organizers={organizers}
          participants={participants}
          sessions={sessions}
          reports={reports}
          allTimeStats={allTimeStats}
          onClose={() => setIsInvestorModalOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// POP-UP MODAL INFO DETAIL LENGKAP PESERTA (TANPA PINDAH HALAMAN / TAB)
// Muncul saat nama tim/peserta diklik di Tab 1 (Overview) atau Tab 4 (Result)
// ============================================================================
interface ParticipantDetailModalProps {
  participant: ParticipantPublic;
  course?: Course;
  allCourses: Course[];
  organizerName: string;
  participantRows: ExplorerLeaderboardRow[];
  initialSessionId?: string | null;
  reports: CheckpointReport[];
  isSuperAdminReadOnly: boolean;
  resetParticipantPasswordId: string | null;
  resetParticipantPasswordValue: string;
  onClose: () => void;
  onSetResetParticipantPasswordId: (id: string | null) => void;
  onSetResetParticipantPasswordValue: (val: string) => void;
  onSaveResetParticipantPassword: (participantId: string) => void;
  onConfirmDeleteParticipant: (participant: ParticipantPublic) => void;
}

export function ParticipantDetailModal({
  participant,
  course,
  allCourses,
  organizerName,
  participantRows,
  initialSessionId,
  reports,
  isSuperAdminReadOnly,
  resetParticipantPasswordId,
  resetParticipantPasswordValue,
  onClose,
  onSetResetParticipantPasswordId,
  onSetResetParticipantPasswordValue,
  onSaveResetParticipantPassword,
  onConfirmDeleteParticipant,
}: ParticipantDetailModalProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessionId || participantRows[0]?.sessionId || null
  );

  const activeRow = useMemo(() => {
    if (!participantRows.length) return undefined;
    return (
      participantRows.find((r) => r.sessionId === selectedSessionId) ||
      participantRows[0]
    );
  }, [participantRows, selectedSessionId]);

  const effectiveCourse = useMemo(() => {
    if (activeRow) {
      return (
        allCourses.find((c) => c.id === activeRow.courseId) || course
      );
    }
    return course;
  }, [activeRow, allCourses, course]);

  const visitedCpMap = useMemo(() => {
    const map = new Map<string, ExplorerSplitItem>();
    if (!activeRow) return map;
    for (const sp of activeRow.splits) {
      map.set(sp.checkpointId, sp);
    }
    return map;
  }, [activeRow]);

  const sessionReportsMap = useMemo(() => {
    const map = new Map<string, CheckpointReport>();
    if (!activeRow) return map;
    reports
      .filter((r) => r.sessionId === activeRow.sessionId)
      .forEach((r) => {
        if (r.checkpointId) {
          map.set(r.checkpointId, r);
        }
      });
    return map;
  }, [reports, activeRow]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-sky-500/40 bg-[#051224] p-4 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Pop-Up Detail Peserta */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4 sticky top-0 bg-[#051224]/95 backdrop-blur z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                INFO DETAIL LENGKAP PESERTA
              </span>
              {effectiveCourse && (
                <span className="text-xs font-mono text-sky-300">
                  Course: <strong>{effectiveCourse.name}</strong> ({organizerName})
                </span>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-white mt-1 flex flex-wrap items-center gap-2">
              <span>Tim {participant.teamName}</span>
              <span className="text-sm font-normal text-slate-300">
                (Pendaftar: {participant.name})
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {participantRows.length > 1 && (
              <select
                value={activeRow?.sessionId || ''}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold"
              >
                {participantRows.map((r) => (
                  <option key={r.sessionId} value={r.sessionId}>
                    {r.courseName} — Attempt #{r.attemptNumber} ({r.status} •{' '}
                    {r.totalScore} pts)
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Tutup</span>
            </button>
          </div>
        </div>

        {/* 1. BIODATA & IDENTITAS AKUN PESERTA */}
        <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="text-xs font-mono uppercase text-sky-400 font-bold flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            <span>1. Biodata &amp; Identitas Akun Peserta</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Nama Tim</div>
              <div className="text-sm font-extrabold text-emerald-300 mt-0.5">
                {participant.teamName}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1">
                BIB: {participant.bibNumber || '-'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Nama Peserta Pendaftar</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {participant.name}
              </div>
              <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-1">
                <Phone className="w-3 h-3 text-sky-400" />
                <span>No. WA/HP: {participant.phone || 'Tidak diisi'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Kategori Orienteering</div>
              <div className="text-sm font-bold text-amber-300 mt-0.5">
                Gender: {participant.gender || 'Other'}
              </div>
              <div className="text-[11px] font-mono text-sky-300 mt-1">
                Kelompok Umur: {participant.ageGroup || 'Semua Umur'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Asal &amp; Waktu Pendaftaran</div>
              <div className="text-xs font-bold text-purple-300 mt-0.5">
                {participant.createdByOrganizerId
                  ? `Didaftarkan Panitia (${organizerName})`
                  : 'Pendaftaran Mandiri Aplikasi'}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                {participant.registeredAt
                  ? new Date(participant.registeredAt).toLocaleString('id-ID')
                  : '-'}
              </div>
            </div>
          </div>

          {!isSuperAdminReadOnly && (
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-300">
                Pengelolaan Akun Tim Peserta:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {resetParticipantPasswordId === participant.id ? (
                  <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-lg border border-slate-700">
                    <input
                      type="text"
                      value={resetParticipantPasswordValue}
                      onChange={(e) =>
                        onSetResetParticipantPasswordValue(e.target.value)
                      }
                      placeholder="Password baru (min 6)..."
                      className="w-40 px-2 py-1 rounded bg-slate-950 text-white text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => onSaveResetParticipantPassword(participant.id)}
                      className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetResetParticipantPasswordId(null);
                        onSetResetParticipantPasswordValue('');
                      }}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSetResetParticipantPasswordId(participant.id);
                      onSetResetParticipantPasswordValue('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-semibold cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset Password Tim</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onConfirmDeleteParticipant(participant);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Peserta</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. RINGKASAN SESI LOMBA & SKOR */}
        <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="text-xs font-mono uppercase text-amber-400 font-bold flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            <span>
              2. Ringkasan Sesi Lomba &amp; Perhitungan Skor{' '}
              {effectiveCourse ? `(${effectiveCourse.name})` : ''}
            </span>
          </div>

          {!activeRow ? (
            <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl">
              Peserta ini belum memulai sesi lomba (belum melakukan scan Setup / Start QR).
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
                <div className="text-[11px] text-slate-400">Rank &amp; Status</div>
                <div className="text-lg font-extrabold font-mono text-amber-400 mt-0.5">
                  Rank #{activeRow.rank}
                </div>
                <div className="mt-1">
                  {activeRow.isDnf ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                      DNF (Gugur)
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        activeRow.status === SessionStatus.FINISHED
                          ? 'bg-amber-500/20 text-amber-300'
                          : activeRow.status === SessionStatus.ACTIVE
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {activeRow.status} (Attempt #{activeRow.attemptNumber})
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
                <div className="text-[11px] text-slate-400">Waktu Mulai (Start)</div>
                <div className="text-sm font-bold font-mono text-white mt-0.5">
                  {activeRow.startedAt
                    ? new Date(activeRow.startedAt).toLocaleTimeString('id-ID')
                    : '-'}
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-1">
                  {activeRow.entryDateLabel}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
                <div className="text-[11px] text-slate-400">Waktu Finish</div>
                <div className="text-sm font-bold font-mono text-white mt-0.5">
                  {activeRow.finishedAt
                    ? new Date(activeRow.finishedAt).toLocaleTimeString('id-ID')
                    : activeRow.status === SessionStatus.ACTIVE
                    ? 'Sedang Lari...'
                    : '-'}
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-1">
                  Batas: {effectiveCourse?.durationMinutes || '∞'} mnt
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
                <div className="text-[11px] text-slate-400">Total Waktu Tempuh</div>
                <div className="text-lg font-extrabold font-mono text-sky-300 mt-0.5">
                  {formatElapsedSeconds(activeRow.durationSeconds)}
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-1">
                  Pos Valid: {activeRow.checkpointsCompleted} /{' '}
                  {activeRow.totalCheckpoints} CP
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
                <div className="text-[11px] text-slate-400">Poin Pos &amp; Penalti</div>
                <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                  Kotor: {activeRow.grossScore} pts
                </div>
                <div className="text-[11px] font-mono mt-1">
                  {activeRow.overtimeMinutes > 0 ? (
                    <span className="text-rose-400 font-semibold">
                      Telat {activeRow.overtimeMinutes}m (-{activeRow.penaltyPoints})
                    </span>
                  ) : (
                    <span className="text-emerald-400">Penalti: 0</span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40">
                <div className="text-[11px] text-emerald-300 font-semibold">
                  Skor Akhir Bersih
                </div>
                <div className="text-2xl font-black font-mono text-emerald-400 mt-0.5">
                  {activeRow.totalScore} pts
                </div>
                <div className="text-[10px] font-mono text-emerald-300/80 mt-0.5">
                  Skor Resmi
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. TABEL RINCIAN URUTAN KUNJUNGAN POS (SPLIT TIME) */}
        {activeRow && (
          <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-mono uppercase text-emerald-400 font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>
                3. Rincian Urutan Scan Pos Checkpoint &amp; Split Time
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                    <th className="py-2 px-3">Urutan</th>
                    <th className="py-2 px-3">Kode &amp; Nama Pos</th>
                    <th className="py-2 px-3">Poin</th>
                    <th className="py-2 px-3">Jam Scan</th>
                    <th className="py-2 px-3">Waktu Kumulatif</th>
                    <th className="py-2 px-3">Split Antar-Pos</th>
                    <th className="py-2 px-3">Validasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr className="bg-emerald-950/15">
                    <td className="py-2 px-3 font-bold text-emerald-400">START</td>
                    <td className="py-2 px-3 text-white font-sans font-semibold">
                      Garis Start ({effectiveCourse?.startLocation?.name || 'START'})
                    </td>
                    <td className="py-2 px-3 text-slate-400">-</td>
                    <td className="py-2 px-3 text-slate-200">
                      {activeRow.startedAt
                        ? new Date(activeRow.startedAt).toLocaleTimeString('id-ID')
                        : '-'}
                    </td>
                    <td className="py-2 px-3 text-white font-bold">00:00:00</td>
                    <td className="py-2 px-3 text-slate-400">-</td>
                    <td className="py-2 px-3 text-emerald-300 text-[11px]">
                      ✅ Start QR
                    </td>
                  </tr>

                  {activeRow.splits.map((sp) => {
                    const cpMeta = effectiveCourse?.checkpoints.find(
                      (c) => c.id === sp.checkpointId
                    );
                    const rep = sessionReportsMap.get(sp.checkpointId);
                    return (
                      <tr
                        key={`modal-sp-${sp.stepIndex}-${sp.checkpointId}`}
                        className="hover:bg-slate-900/40"
                      >
                        <td className="py-2 px-3 font-bold text-amber-300">
                          #{sp.stepIndex}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 mr-2">
                            {sp.fullCode}
                          </span>
                          <span className="text-slate-300">
                            {cpMeta?.name || ''}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400 font-bold">
                          +{sp.points} pts
                        </td>
                        <td className="py-2 px-3 text-slate-200">
                          {sp.measuredAt
                            ? new Date(sp.measuredAt).toLocaleTimeString('id-ID')
                            : '-'}
                        </td>
                        <td className="py-2 px-3 text-white font-bold">
                          {formatElapsedSeconds(sp.cumulativeSeconds)}
                        </td>
                        <td className="py-2 px-3 text-sky-300">
                          +{formatElapsedSeconds(sp.legSplitSeconds)}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-300">
                          {rep?.accuracyMeters !== undefined &&
                          rep?.accuracyMeters !== null
                            ? `${rep.validationUsed} (±${Math.round(rep.accuracyMeters)}m)`
                            : rep?.validationUsed || 'QR Valid'}
                        </td>
                      </tr>
                    );
                  })}

                  {activeRow.status === SessionStatus.FINISHED && (
                    <tr className="bg-amber-950/20">
                      <td className="py-2 px-3 font-bold text-amber-400">FINISH</td>
                      <td className="py-2 px-3 text-white font-sans font-semibold">
                        Garis Finish ({effectiveCourse?.finishLocation?.name || 'FINISH'})
                      </td>
                      <td className="py-2 px-3 text-slate-400">-</td>
                      <td className="py-2 px-3 text-slate-200">
                        {activeRow.finishedAt
                          ? new Date(activeRow.finishedAt).toLocaleTimeString('id-ID')
                          : '-'}
                      </td>
                      <td className="py-2 px-3 text-emerald-400 font-bold">
                        {formatElapsedSeconds(
                          activeRow.finishCumulativeSeconds ?? activeRow.durationSeconds
                        )}
                      </td>
                      <td className="py-2 px-3 text-amber-300">
                        +{formatElapsedSeconds(activeRow.finishSplitSeconds)}
                      </td>
                      <td className="py-2 px-3 text-amber-300 text-[11px] font-bold">
                        🏁 Finish QR
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. CHECKLIST SELURUH POS PADA COURSE */}
        {effectiveCourse && effectiveCourse.checkpoints.length > 0 && (
          <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-mono uppercase text-sky-400 font-bold flex items-center gap-1.5">
              <MapIcon className="w-3.5 h-3.5" />
              <span>
                4. Status Kunjungan Seluruh Pos pada Course ({effectiveCourse.checkpoints.length} Pos CP)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {effectiveCourse.checkpoints.map((cp) => {
                const visited = visitedCpMap.get(cp.id);
                return (
                  <div
                    key={cp.id}
                    className={`p-2.5 rounded-xl border text-xs ${
                      visited
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-white'
                        : 'bg-slate-950/70 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-extrabold text-amber-300">
                        {cp.code}
                      </span>
                      <span className="font-mono text-[10px] text-emerald-400 font-bold">
                        {cp.points} pts
                      </span>
                    </div>
                    <div className="mt-1.5 text-[10px] font-mono">
                      {visited ? (
                        <span className="text-emerald-300 font-bold">
                          ✅ #{visited.stepIndex} ({formatElapsedSeconds(visited.cumulativeSeconds)})
                        </span>
                      ) : (
                        <span className="text-slate-500">⚪ Belum Diambil</span>
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
  );
}
