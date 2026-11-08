import React, { useState, useMemo } from 'react';
import {
  Shield,
  Map as MapIcon,
  Users,
  User,
  ChevronRight,
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Radio,
  Printer,
  FileText,
  FileSpreadsheet,
  Maximize2,
  Layers,
  Eye,
  Phone,
  KeyRound,
  Trash2,
  Search,
  Edit3,
  Plus,
} from 'lucide-react';
import {
  Course,
  CheckpointReport,
  ORIENTEERING_AGE_GROUPS,
  ORIENTEERING_GENDER_OPTIONS,
  OrganizerPublic,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus,
  ValidationMethod,
} from '../../types';

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

interface SuperAdminBreadcrumbProps {
  level: 1 | 2 | 3 | 4;
  selectedOrganizerName?: string;
  selectedCourseName?: string;
  selectedParticipantTeamName?: string;
  organizersCount: number;
  onSelectLevel: (targetLevel: 1 | 2 | 3 | 4) => void;
}

export function SuperAdminBreadcrumb({
  level,
  selectedOrganizerName,
  selectedCourseName,
  selectedParticipantTeamName,
  organizersCount,
  onSelectLevel,
}: SuperAdminBreadcrumbProps) {
  const steps = [
    {
      step: 1 as const,
      title: 'Level 1: Daftar Organizer',
      subtitle: `${organizersCount} Akun Panitia`,
      icon: Shield,
      available: true,
    },
    {
      step: 2 as const,
      title: 'Level 2: Daftar Course',
      subtitle: selectedOrganizerName || 'Pilih Organizer dulu',
      icon: MapIcon,
      available: level >= 2 && Boolean(selectedOrganizerName),
    },
    {
      step: 3 as const,
      title: 'Level 3: Daftar Peserta',
      subtitle: selectedCourseName || 'Pilih Course dulu',
      icon: Users,
      available: level >= 3 && Boolean(selectedCourseName),
    },
    {
      step: 4 as const,
      title: 'Level 4: Info Detail Peserta',
      subtitle: selectedParticipantTeamName || 'Pilih Peserta dulu',
      icon: User,
      available: level === 4 && Boolean(selectedParticipantTeamName),
    },
  ];

  return (
    <div className="rounded-xl border border-sky-500/30 bg-[#0a1f38] p-3 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
            Alur Eksplorasi Bertingkat (4 Level)
          </span>
          <span className="text-xs text-slate-300 hidden sm:inline">
            Klik tahapan di bawah untuk berpindah cepat antar level data
          </span>
        </div>
        {level > 1 && (
          <button
            type="button"
            onClick={() => onSelectLevel((level - 1) as 1 | 2 | 3)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Level {level - 1}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {steps.map((item) => {
          const Icon = item.icon;
          const isCurrent = level === item.step;
          const isCompleted = level > item.step;
          return (
            <button
              key={item.step}
              type="button"
              disabled={!item.available}
              onClick={() => item.available && onSelectLevel(item.step)}
              className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition ${
                isCurrent
                  ? 'bg-amber-500/15 border-amber-400 text-white shadow-md cursor-pointer'
                  : isCompleted
                  ? 'bg-slate-900/90 border-sky-500/40 text-slate-200 hover:border-amber-400/60 cursor-pointer'
                  : 'bg-slate-950/50 border-slate-800/80 text-slate-500 cursor-not-allowed opacity-60'
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold ${
                  isCurrent
                    ? 'bg-amber-500 text-slate-950 border-amber-300'
                    : isCompleted
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[11px] font-mono uppercase font-bold truncate ${
                    isCurrent
                      ? 'text-amber-300'
                      : isCompleted
                      ? 'text-sky-300'
                      : 'text-slate-500'
                  }`}
                >
                  {item.title}
                </div>
                <div className="text-xs font-semibold truncate text-white">
                  {item.subtitle}
                </div>
              </div>
              {item.step < 4 && (
                <ChevronRight
                  className={`w-4 h-4 shrink-0 ${
                    isCurrent
                      ? 'text-amber-400'
                      : isCompleted
                      ? 'text-sky-400'
                      : 'text-slate-600'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
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
    label: `Sisa ${diffDays} hari (${new Date(expiresAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })})`,
    isExpired: false,
    colorClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  };
}

// ============================================================================
// LEVEL 2: DAFTAR COURSE MILIK ORGANIZER TERPILIH
// ============================================================================
interface SuperAdminLevel2CoursesProps {
  organizer: OrganizerPublic | null;
  isUnassignedGroup?: boolean;
  courses: Course[];
  sessions: ParticipantSession[];
  participants: ParticipantPublic[];
  selectedCourseId: string;
  inspectingMapCourseId: string | null;
  isSuperAdminReadOnly: boolean;
  onBackToOrganizers: () => void;
  onOpenCourseParticipants: (course: Course) => void;
  onToggleInspectCourseMap: (course: Course) => void;
  onBulkPrintCourse: (course: Course) => void;
  onInfoSheetCourse: (course: Course) => void;
  onDeleteCourse: (course: Course) => void;
}

export function SuperAdminLevel2Courses({
  organizer,
  isUnassignedGroup,
  courses,
  sessions,
  participants,
  inspectingMapCourseId,
  isSuperAdminReadOnly,
  onBackToOrganizers,
  onOpenCourseParticipants,
  onToggleInspectCourseMap,
  onBulkPrintCourse,
  onInfoSheetCourse,
  onDeleteCourse,
}: SuperAdminLevel2CoursesProps) {
  const orgCourseIds = useMemo(() => new Set(courses.map((c) => c.id)), [courses]);

  const totalUniqueParticipantsInOrg = useMemo(() => {
    const pIds = new Set<string>();
    sessions.forEach((s) => {
      if (orgCourseIds.has(s.courseId)) {
        pIds.add(s.participantId);
      }
    });
    if (organizer) {
      participants.forEach((p) => {
        if (p.createdByOrganizerId === organizer.id) {
          pIds.add(p.id);
        }
      });
    }
    return pIds.size;
  }, [sessions, participants, orgCourseIds, organizer]);

  const expInfo = formatExpirationStatus(organizer?.expiresAt);

  return (
    <div className="space-y-5">
      {/* Header Profil Organizer Terpilih */}
      <div className="bg-[#0a1f38] border border-sky-500/30 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <button
              type="button"
              onClick={onBackToOrganizers}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Daftar Organizer</span>
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                  LEVEL 2 • DAFTAR COURSE MILIK ORGANIZER
                </span>
                {organizer && (
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {organizer.code}
                  </span>
                )}
                {organizer && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      organizer.isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {organizer.isActive ? 'AKUN AKTIF' : 'NONAKTIF / DIBEKUKAN'}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-extrabold text-white mt-1">
                {isUnassignedGroup
                  ? 'Course Internal / Dibuat Superadmin'
                  : organizer?.name || 'Organizer'}
              </h2>
            </div>
          </div>

          {organizer && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                Username: <strong className="text-white">{organizer.username}</strong>
              </span>
              {organizer.organization && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                  Instansi: <strong className="text-sky-300">{organizer.organization}</strong>
                </span>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                Kuota Course:{' '}
                <strong className="text-amber-300">
                  {courses.length} /{' '}
                  {organizer.maxCourses === null || organizer.maxCourses === undefined
                    ? '∞ (Unlimited)'
                    : `${organizer.maxCourses} Course`}
                </strong>
              </span>
              <span className={`px-2.5 py-1 rounded-lg border ${expInfo.colorClass}`}>
                Masa Aktif: {expInfo.label}
              </span>
            </div>
          )}
        </div>

        {/* Ringkasan Statistik Organizer Ini */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">Total Course Dibuat</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">
              {courses.length} Course
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">Total Pos Checkpoint</div>
            <div className="text-xl font-bold font-mono text-sky-400 mt-0.5">
              {courses.reduce((acc, c) => acc + c.checkpoints.length, 0)} Pos CP
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">Total Peserta Terlibat</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {totalUniqueParticipantsInOrg} Peserta
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">Total Sesi Lomba</div>
            <div className="text-xl font-bold font-mono text-purple-300 mt-0.5">
              {sessions.filter((s) => orgCourseIds.has(s.courseId)).length} Sesi
            </div>
          </div>
        </div>
      </div>

      {/* Daftar Course yang Dibuat oleh Organizer Ini */}
      <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <span className="text-[11px] font-mono uppercase text-amber-400">
              Pilih Course untuk Membuka Daftar Peserta (Level 3)
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              Daftar Course Milik{' '}
              {isUnassignedGroup ? 'Superadmin' : organizer?.name || 'Organizer'} (
              {courses.length} Course)
            </h3>
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl">
            Organizer ini belum membuat Course apa pun.
          </div>
        ) : (
          <div className="space-y-3.5">
            {courses.map((c, idx) => {
              const courseSessions = sessions.filter((s) => s.courseId === c.id);
              const uniqueParticipantIds = new Set(
                courseSessions.map((s) => s.participantId)
              );
              const activeCount = courseSessions.filter(
                (s) => s.status === SessionStatus.ACTIVE && !s.isDnf
              ).length;
              const finishedCount = courseSessions.filter(
                (s) => s.status === SessionStatus.FINISHED && !s.isDnf
              ).length;
              const isInspectingThisMap = inspectingMapCourseId === c.id;

              return (
                <div
                  key={c.id}
                  className={`rounded-xl border p-4 transition ${
                    isInspectingThisMap
                      ? 'bg-sky-950/30 border-sky-400 shadow-lg'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Course #{idx + 1}
                        </span>
                        <h4 className="text-base font-bold text-white truncate">
                          {c.name}
                        </h4>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                          {c.checkpoints.length} Pos CP
                        </span>
                        {c.startLocation && c.finishLocation ? (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            🗺️ Start &amp; Finish Peta Aktif
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            Peta Interaktif
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-400" />
                          {c.locationName || 'Lokasi tidak diisi'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-sky-400" />
                          {c.date}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                          • Mode:{' '}
                          <strong className="text-slate-200">
                            {c.enforceOrder ? 'Wajib Urut (Klasik)' : 'Bebas (Score/Point)'}
                          </strong>
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                          • Durasi:{' '}
                          <strong className="text-amber-300">
                            {c.durationMinutes && c.durationMinutes > 0
                              ? `${c.durationMinutes} Menit`
                              : 'Tanpa Batas'}
                          </strong>
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                          • Validasi:{' '}
                          <strong className="text-sky-300">{c.validationMethod}</strong>
                        </span>
                      </div>

                      {/* Ringkasan Peserta di Course Ini */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300">
                          <Users className="w-3.5 h-3.5" />
                          <strong>{uniqueParticipantIds.size} Tim Peserta</strong>
                          <span className="text-slate-500">
                            ({courseSessions.length} Sesi)
                          </span>
                        </span>
                        {activeCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-mono text-emerald-300">
                            <Radio className="w-3.5 h-3.5 animate-pulse" />
                            {activeCount} Sedang Lari
                          </span>
                        )}
                        {finishedCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs font-mono text-amber-300">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {finishedCount} Sudah Finish
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tombol Aksi Level 2 pada Setiap Course */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenCourseParticipants(c)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition cursor-pointer shadow-lg shadow-amber-500/20"
                      >
                        <Users className="w-4 h-4" />
                        <span>
                          Buka Daftar Peserta ({uniqueParticipantIds.size} Tim)
                        </span>
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleInspectCourseMap(c)}
                        className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs border transition cursor-pointer ${
                          isInspectingThisMap
                            ? 'bg-sky-500 text-slate-950 border-sky-300 shadow'
                            : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700'
                        }`}
                      >
                        <MapIcon className="w-4 h-4" />
                        <span>
                          {isInspectingThisMap
                            ? 'Tutup Peta & Pos CP'
                            : 'Info Peta & Pos CP'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onInfoSheetCourse(c)}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 font-semibold text-xs transition cursor-pointer"
                        title="Lihat Lembar Info Course"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Info Course</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onBulkPrintCourse(c)}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold text-xs transition cursor-pointer"
                        title="Lihat / Cetak QR Code Course"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">QR Code</span>
                      </button>

                      {!isSuperAdminReadOnly && (
                        <button
                          type="button"
                          onClick={() => onDeleteCourse(c)}
                          className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                          title="Hapus Course Ini (Intervensi Darurat)"
                        >
                          <Trash2 className="w-4 h-4" />
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
  );
}

// ============================================================================
// LEVEL 3: DAFTAR PESERTA DI COURSE TERPILIH
// ============================================================================
interface SuperAdminLevel3ParticipantsProps {
  course: Course;
  organizerName: string;
  leaderboardRows: ExplorerLeaderboardRow[];
  allParticipants: ParticipantPublic[];
  allSessions: ParticipantSession[];
  splitColumnCount: number;
  showResultSplits: boolean;
  resultGenderFilter: string;
  resultAgeGroupFilter: string;
  isSuperAdminReadOnly: boolean;
  showLiveMonitoringMap: boolean;
  onBackToCourses: () => void;
  onSelectParticipantDetail: (
    participant: ParticipantPublic,
    sessionRow?: ExplorerLeaderboardRow
  ) => void;
  onToggleShowResultSplits: (show: boolean) => void;
  onChangeGenderFilter: (val: string) => void;
  onChangeAgeGroupFilter: (val: string) => void;
  onToggleLiveMonitoringMap: () => void;
  onShareSpectatorCourse: (course: Course) => void;
  onOpenSpectatorFullscreen: () => void;
  onExportCsv: () => void;
  onDeleteSessionResult: (sessionId: string) => void;
}

export function SuperAdminLevel3Participants({
  course,
  organizerName,
  leaderboardRows,
  allParticipants,
  allSessions,
  splitColumnCount,
  showResultSplits,
  resultGenderFilter,
  resultAgeGroupFilter,
  isSuperAdminReadOnly,
  showLiveMonitoringMap,
  onBackToCourses,
  onSelectParticipantDetail,
  onToggleShowResultSplits,
  onChangeGenderFilter,
  onChangeAgeGroupFilter,
  onToggleLiveMonitoringMap,
  onShareSpectatorCourse,
  onOpenSpectatorFullscreen,
  onExportCsv,
  onDeleteSessionResult,
}: SuperAdminLevel3ParticipantsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filter baris klasemen hanya untuk Course yang sedang dibuka di Level 3
  const courseLeaderboardRows = useMemo(() => {
    const rowsForCourse = leaderboardRows.filter((r) => r.courseId === course.id);
    if (!searchQuery.trim()) return rowsForCourse;
    const q = searchQuery.trim().toLowerCase();
    return rowsForCourse.filter(
      (r) =>
        r.teamName.toLowerCase().includes(q) ||
        r.participantName.toLowerCase().includes(q) ||
        r.bibNumber.toLowerCase().includes(q)
    );
  }, [leaderboardRows, course.id, searchQuery]);

  // Peserta yang dibuat oleh Organizer pemilik course ini tetapi belum memulai sesi di course ini
  const unstartedParticipants = useMemo(() => {
    const startedParticipantIds = new Set(
      allSessions.filter((s) => s.courseId === course.id).map((s) => s.participantId)
    );
    return allParticipants.filter((p) => {
      if (startedParticipantIds.has(p.id)) return false;
      if (
        course.createdByOrganizerId &&
        p.createdByOrganizerId === course.createdByOrganizerId
      ) {
        if (
          resultGenderFilter !== 'ALL' &&
          (p.gender || 'Other').toLowerCase() !== resultGenderFilter.toLowerCase()
        ) {
          return false;
        }
        if (
          resultAgeGroupFilter !== 'ALL' &&
          (p.ageGroup || 'Semua Umur') !== resultAgeGroupFilter
        ) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          return (
            p.teamName.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.bibNumber || '').toLowerCase().includes(q)
          );
        }
        return true;
      }
      return false;
    });
  }, [
    allParticipants,
    allSessions,
    course.id,
    course.createdByOrganizerId,
    resultGenderFilter,
    resultAgeGroupFilter,
    searchQuery,
  ]);

  return (
    <div className="space-y-5">
      {/* Header Info Course Terpilih */}
      <div className="bg-[#0a1f38] border border-sky-500/30 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <button
              type="button"
              onClick={onBackToCourses}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Daftar Course</span>
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  LEVEL 3 • DAFTAR PESERTA DI COURSE INI
                </span>
                <span className="text-xs font-mono text-sky-300">
                  Organizer: <strong>{organizerName}</strong>
                </span>
              </div>
              <h2 className="text-lg font-extrabold text-white mt-1">
                {course.name}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleLiveMonitoringMap}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                showLiveMonitoringMap
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>
                {showLiveMonitoringMap
                  ? 'Tutup Peta Live Monitoring'
                  : 'Lihat Peta Live Monitoring'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onShareSpectatorCourse(course)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-bold text-xs transition cursor-pointer"
            >
              <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
              <span>Bagikan Link Penonton</span>
            </button>

            <button
              type="button"
              onClick={onOpenSpectatorFullscreen}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Layar Penuh Penonton</span>
            </button>

            <button
              type="button"
              onClick={onExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Kategori, Pencarian, dan Toggle Split */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Tim / Nama Peserta..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Gender:</span>
              <select
                value={resultGenderFilter}
                onChange={(e) => onChangeGenderFilter(e.target.value)}
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

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Umur:</span>
              <select
                value={resultAgeGroupFilter}
                onChange={(e) => onChangeAgeGroupFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-medium focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">Semua Umur</option>
                {ORIENTEERING_AGE_GROUPS.map((ag) => (
                  <option key={ag} value={ag}>
                    {ag === 'Semua Umur' ? 'Semua Umur' : `Kelompok ${ag}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => onToggleShowResultSplits(false)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  !showResultSplits
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Ringkas
              </button>
              <button
                type="button"
                onClick={() => onToggleShowResultSplits(true)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  showResultSplits
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Show Split (#1..#{splitColumnCount || 1})
              </button>
            </div>
          </div>
        </div>

        {/* Tabel Daftar Peserta yang Mengikuti Course Ini */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                <th className="py-3 px-3 whitespace-nowrap">Rank</th>
                <th className="py-3 px-3 whitespace-nowrap">Nama Tim &amp; Pendaftar</th>
                <th className="py-3 px-3 whitespace-nowrap">Kategori</th>
                <th className="py-3 px-3 whitespace-nowrap">Status Sesi</th>
                <th className="py-3 px-3 whitespace-nowrap">Pos Valid</th>
                <th className="py-3 px-3 whitespace-nowrap">Skor Akhir</th>
                <th className="py-3 px-3 whitespace-nowrap">Waktu Tempuh</th>
                {showResultSplits &&
                  Array.from({ length: splitColumnCount }, (_, idx) => (
                    <th
                      key={`exp-split-col-${idx + 1}`}
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
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  Buka Detail Peserta (Level 4)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {courseLeaderboardRows.length === 0 &&
              unstartedParticipants.length === 0 ? (
                <tr>
                  <td
                    colSpan={8 + (showResultSplits ? splitColumnCount + 1 : 0)}
                    className="py-10 text-center text-slate-400 text-xs"
                  >
                    Belum ada peserta yang mengikuti Course ini.
                  </td>
                </tr>
              ) : (
                <>
                  {courseLeaderboardRows.map((row) => {
                    const partObj = allParticipants.find(
                      (p) => p.id === row.participantId
                    ) || {
                      id: row.participantId,
                      name: row.participantName,
                      teamName: row.teamName,
                      gender: row.gender,
                      ageGroup: row.ageGroup,
                      bibNumber: row.bibNumber,
                      phone: '',
                      registeredAt: '',
                    };

                    return (
                      <tr
                        key={row.sessionId}
                        onClick={() => onSelectParticipantDetail(partObj, row)}
                        className="hover:bg-sky-950/40 transition cursor-pointer group"
                      >
                        <td className="py-3 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                          #{row.rank}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-bold text-emerald-300 group-hover:text-amber-300 transition flex items-center gap-1.5">
                            <span>{row.teamName}</span>
                            {row.attemptNumber > 1 && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                Attempt #{row.attemptNumber}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Pendaftar: {row.participantName}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                          <div>{row.gender}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {row.ageGroup}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {row.isDnf ? (
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
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
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-200 whitespace-nowrap">
                          {row.checkpointsCompleted} / {row.totalCheckpoints} CP
                        </td>
                        <td className="py-3 px-3 font-mono whitespace-nowrap">
                          <div className="font-bold text-emerald-400 text-sm">
                            {row.totalScore} pts
                          </div>
                          {row.overtimeMinutes > 0 && (
                            <div className="text-[10px] text-rose-400">
                              Penalti -{row.penaltyPoints} ({row.overtimeMinutes}m)
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-white whitespace-nowrap">
                          {formatElapsedSeconds(row.durationSeconds)}
                        </td>

                        {showResultSplits &&
                          Array.from({ length: splitColumnCount }, (_, splitIdx) => {
                            const sp = row.splits[splitIdx];
                            if (!sp) {
                              return (
                                <td
                                  key={`exp-cell-${row.sessionId}-${splitIdx}`}
                                  className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap bg-slate-950/40 border-l border-slate-800/70"
                                >
                                  -
                                </td>
                              );
                            }
                            return (
                              <td
                                key={`exp-cell-${row.sessionId}-${splitIdx}`}
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
                          })}

                        {showResultSplits && (
                          <td className="py-2 px-3 text-center whitespace-nowrap leading-tight bg-slate-950/40 border-l border-slate-800/70">
                            {row.status === SessionStatus.FINISHED ? (
                              <>
                                <div className="font-mono font-bold text-emerald-300 text-[11px]">
                                  {formatElapsedSeconds(
                                    row.finishCumulativeSeconds ?? row.durationSeconds
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

                        <td
                          className="py-2.5 px-3 whitespace-nowrap text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectParticipantDetail(partObj, row)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Info Detail Peserta</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>

                            {!isSuperAdminReadOnly && (
                              <>
                                {confirmDeleteId === row.sessionId ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onDeleteSessionResult(row.sessionId);
                                        setConfirmDeleteId(null);
                                      }}
                                      className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold"
                                    >
                                      Ya
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px]"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(row.sessionId)}
                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                    title="Hapus Sesi Ini (Mode Intervensi)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Baris Peserta Terdaftar di Organizer Ini yang Belum Scan Setup/Start */}
                  {unstartedParticipants.map((p) => (
                    <tr
                      key={`unstarted-${p.id}`}
                      onClick={() => onSelectParticipantDetail(p, undefined)}
                      className="hover:bg-sky-950/40 transition cursor-pointer bg-slate-950/30"
                    >
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                        -
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-200">{p.teamName}</div>
                        <div className="text-[11px] text-slate-400">
                          Pendaftar: {p.name}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        <div>{p.gender || 'Other'}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {p.ageGroup || 'Semua Umur'}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          BELUM START
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                        0 / {course.checkpoints.length} CP
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                        0 pts
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                        -
                      </td>
                      {showResultSplits &&
                        Array.from({ length: splitColumnCount + 1 }, (_, idx) => (
                          <td
                            key={`unstarted-sp-${p.id}-${idx}`}
                            className="py-2.5 px-3 text-center font-mono text-slate-600 bg-slate-950/40 border-l border-slate-800/70"
                          >
                            -
                          </td>
                        ))}
                      <td
                        className="py-2.5 px-3 whitespace-nowrap text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectParticipantDetail(p, undefined)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-bold text-xs transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Info Detail Peserta</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LEVEL 4: INFO DETAIL LENGKAP PESERTA
// ============================================================================
interface SuperAdminLevel4ParticipantDetailProps {
  participant: ParticipantPublic;
  course: Course;
  organizerName: string;
  participantCourseRows: ExplorerLeaderboardRow[];
  initialSessionId?: string | null;
  reports: CheckpointReport[];
  isSuperAdminReadOnly: boolean;
  resetParticipantPasswordId: string | null;
  resetParticipantPasswordValue: string;
  onBackToParticipants: () => void;
  onSetResetParticipantPasswordId: (id: string | null) => void;
  onSetResetParticipantPasswordValue: (val: string) => void;
  onSaveResetParticipantPassword: (participantId: string) => void;
  onConfirmDeleteParticipant: (participant: ParticipantPublic) => void;
}

export function SuperAdminLevel4ParticipantDetail({
  participant,
  course,
  organizerName,
  participantCourseRows,
  initialSessionId,
  reports,
  isSuperAdminReadOnly,
  resetParticipantPasswordId,
  resetParticipantPasswordValue,
  onBackToParticipants,
  onSetResetParticipantPasswordId,
  onSetResetParticipantPasswordValue,
  onSaveResetParticipantPassword,
  onConfirmDeleteParticipant,
}: SuperAdminLevel4ParticipantDetailProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessionId || participantCourseRows[0]?.sessionId || null
  );

  const activeRow = useMemo(() => {
    if (!participantCourseRows.length) return undefined;
    return (
      participantCourseRows.find((r) => r.sessionId === selectedSessionId) ||
      participantCourseRows[0]
    );
  }, [participantCourseRows, selectedSessionId]);

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
    <div className="space-y-5">
      {/* Header Level 4 */}
      <div className="bg-[#0a1f38] border border-amber-500/40 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <button
              type="button"
              onClick={onBackToParticipants}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Daftar Peserta</span>
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  LEVEL 4 • INFO DETAIL LENGKAP PESERTA
                </span>
                <span className="text-xs font-mono text-sky-300">
                  Course: <strong>{course.name}</strong> ({organizerName})
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-white mt-1 flex flex-wrap items-center gap-2.5">
                <span>Tim {participant.teamName}</span>
                <span className="text-sm font-normal text-slate-300">
                  (Pendaftar: {participant.name})
                </span>
              </h2>
            </div>
          </div>

          {/* Pilihan Attempt jika peserta punya >1 sesi di course ini */}
          {participantCourseRows.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Pilih Sesi / Attempt:</span>
              <select
                value={activeRow?.sessionId || ''}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold"
              >
                {participantCourseRows.map((r) => (
                  <option key={r.sessionId} value={r.sessionId}>
                    Attempt #{r.attemptNumber} — {r.status} ({r.totalScore} pts)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* PANEL 1: BIODATA & IDENTITAS AKUN PESERTA */}
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase text-sky-400 font-bold flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            <span>1. Biodata &amp; Identitas Akun Peserta</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Nama Tim</div>
              <div className="text-sm font-extrabold text-emerald-300 mt-0.5">
                {participant.teamName}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1">
                BIB: {participant.bibNumber || '-'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Nama Peserta Pendaftar</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {participant.name}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <Phone className="w-3 h-3 text-sky-400" />
                <span>No. WA/HP: {participant.phone || 'Tidak diisi'}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Kategori Orienteering</div>
              <div className="text-sm font-bold text-amber-300 mt-0.5">
                Gender: {participant.gender || 'Other'}
              </div>
              <div className="text-[11px] font-mono text-sky-300 mt-1">
                Kelompok Umur: {participant.ageGroup || 'Semua Umur'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
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

          {/* Kontrol Intervensi Akun Peserta (Saat Mode Intervensi Darurat Aktif) */}
          {!isSuperAdminReadOnly && (
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-rose-200 font-medium">
                Mode Intervensi Darurat: Anda dapat mereset password tim ini atau menghapus akun peserta.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {resetParticipantPasswordId === participant.id ? (
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-700">
                    <input
                      type="text"
                      value={resetParticipantPasswordValue}
                      onChange={(e) =>
                        onSetResetParticipantPasswordValue(e.target.value)
                      }
                      placeholder="Password baru (min 6)..."
                      className="w-40 px-2 py-1 rounded bg-slate-900 text-white text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => onSaveResetParticipantPassword(participant.id)}
                      className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-bold"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetResetParticipantPasswordId(null);
                        onSetResetParticipantPasswordValue('');
                      }}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs"
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
                  onClick={() => onConfirmDeleteParticipant(participant)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Peserta</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PANEL 2: RINGKASAN SESI LOMBA & SKOR DI COURSE INI */}
      <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="text-xs font-mono uppercase text-amber-400 font-bold flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" />
          <span>
            2. Ringkasan Sesi Lomba &amp; Perhitungan Skor di Course "{course.name}"
          </span>
        </div>

        {!activeRow ? (
          <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl">
            Peserta ini sudah terdaftar pada akun panitia namun belum melakukan scan Setup / Start QR pada Course ini.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Peringkat &amp; Status</div>
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

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
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

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Waktu Selesai (Finish)</div>
              <div className="text-sm font-bold font-mono text-white mt-0.5">
                {activeRow.finishedAt
                  ? new Date(activeRow.finishedAt).toLocaleTimeString('id-ID')
                  : activeRow.status === SessionStatus.ACTIVE
                  ? 'Sedang Berlomba...'
                  : '-'}
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-1">
                Durasi Maks: {course.durationMinutes || '∞'} mnt
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Total Waktu Tempuh</div>
              <div className="text-lg font-extrabold font-mono text-sky-300 mt-0.5">
                {formatElapsedSeconds(activeRow.durationSeconds)}
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-1">
                Pos Tervalidasi: {activeRow.checkpointsCompleted} /{' '}
                {activeRow.totalCheckpoints} CP
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
              <div className="text-[11px] text-slate-400">Poin Kotor &amp; Penalti</div>
              <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                Poin Pos: {activeRow.grossScore} pts
              </div>
              <div className="text-[11px] font-mono mt-1">
                {activeRow.overtimeMinutes > 0 ? (
                  <span className="text-rose-400 font-semibold">
                    Telat {activeRow.overtimeMinutes}m (-{activeRow.penaltyPoints} pts)
                  </span>
                ) : (
                  <span className="text-emerald-400">Tepat Waktu (Penalti 0)</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40">
              <div className="text-[11px] text-emerald-300 font-semibold">
                Total Skor Akhir Bersih
              </div>
              <div className="text-2xl font-black font-mono text-emerald-400 mt-0.5">
                {activeRow.totalScore} pts
              </div>
              <div className="text-[10px] font-mono text-emerald-300/80 mt-0.5">
                Skor Resmi Klasemen
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PANEL 3: RINCIAN REKAM JEJAK POS CHECKPOINT & SPLIT TIME PESERTA */}
      {activeRow && (
        <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <span className="text-xs font-mono uppercase text-emerald-400 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  3. Rincian Urutan Kunjungan Pos (Split Time) — Tim{' '}
                  {participant.teamName}
                </span>
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Menampilkan kronologi setiap pos checkpoint yang berhasil di-scan oleh peserta beserta waktu kumulatif dan selisih waktu antar-pos.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                  <th className="py-2.5 px-3">Urutan Kunjungan</th>
                  <th className="py-2.5 px-3">Kode &amp; Nama Pos</th>
                  <th className="py-2.5 px-3">Poin Pos</th>
                  <th className="py-2.5 px-3">Jam Scan Lokal</th>
                  <th className="py-2.5 px-3">Waktu Kumulatif</th>
                  <th className="py-2.5 px-3">Split Antar-Pos (Leg)</th>
                  <th className="py-2.5 px-3">Info GPS / Validasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {/* Baris START */}
                <tr className="bg-emerald-950/15">
                  <td className="py-2.5 px-3 font-bold text-emerald-400">START</td>
                  <td className="py-2.5 px-3 text-white font-sans font-semibold">
                    Garis Start ({course.startLocation?.name || 'START'})
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">-</td>
                  <td className="py-2.5 px-3 text-slate-200">
                    {activeRow.startedAt
                      ? new Date(activeRow.startedAt).toLocaleTimeString('id-ID')
                      : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-white font-bold">00:00:00</td>
                  <td className="py-2.5 px-3 text-slate-400">-</td>
                  <td className="py-2.5 px-3 text-emerald-300 text-[11px]">
                    ✅ Waktu Lomba Dimulai
                  </td>
                </tr>

                {/* Baris Tiap Pos yang Dikunjungi Secara Kronologis */}
                {activeRow.splits.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-6 text-center text-slate-400 font-sans"
                    >
                      Peserta belum memindai pos checkpoint mana pun.
                    </td>
                  </tr>
                ) : (
                  activeRow.splits.map((sp) => {
                    const cpMeta = course.checkpoints.find(
                      (c) => c.id === sp.checkpointId
                    );
                    const rep = sessionReportsMap.get(sp.checkpointId);
                    return (
                      <tr key={`detail-sp-${sp.stepIndex}-${sp.checkpointId}`} className="hover:bg-slate-900/40">
                        <td className="py-2.5 px-3 font-bold text-amber-300">
                          Pos #{sp.stepIndex}
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 mr-2">
                            {sp.fullCode}
                          </span>
                          <span className="text-slate-300">
                            {cpMeta?.name || ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-emerald-400 font-bold">
                          +{sp.points} pts
                        </td>
                        <td className="py-2.5 px-3 text-slate-200">
                          {sp.measuredAt
                            ? new Date(sp.measuredAt).toLocaleTimeString('id-ID')
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-white font-bold">
                          {formatElapsedSeconds(sp.cumulativeSeconds)}
                        </td>
                        <td className="py-2.5 px-3 text-sky-300">
                          +{formatElapsedSeconds(sp.legSplitSeconds)}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-300">
                          {rep?.accuracyMeters !== undefined &&
                          rep?.accuracyMeters !== null
                            ? `${rep.validationUsed} (Akurasi ±${Math.round(rep.accuracyMeters)}m)`
                            : rep?.validationUsed || 'QR Tervalidasi'}
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* Baris FINISH */}
                {activeRow.status === SessionStatus.FINISHED && (
                  <tr className="bg-amber-950/20">
                    <td className="py-2.5 px-3 font-bold text-amber-400">FINISH</td>
                    <td className="py-2.5 px-3 text-white font-sans font-semibold">
                      Garis Finish ({course.finishLocation?.name || 'FINISH'})
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">-</td>
                    <td className="py-2.5 px-3 text-slate-200">
                      {activeRow.finishedAt
                        ? new Date(activeRow.finishedAt).toLocaleTimeString('id-ID')
                        : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">
                      {formatElapsedSeconds(
                        activeRow.finishCumulativeSeconds ?? activeRow.durationSeconds
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-amber-300">
                      +{formatElapsedSeconds(activeRow.finishSplitSeconds)}
                    </td>
                    <td className="py-2.5 px-3 text-amber-300 text-[11px] font-bold">
                      🏁 Selesai Berlomba
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PANEL 4: CHECKLIST SELURUH POS PADA COURSE (TERVALIDASI VS BELUM DIAMBIL) */}
      <div className="bg-[#0a1f38] border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="text-xs font-mono uppercase text-sky-400 font-bold flex items-center gap-1.5">
          <MapIcon className="w-3.5 h-3.5" />
          <span>
            4. Status Kunjungan Seluruh Pos pada Course ({course.checkpoints.length} Pos CP)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {course.checkpoints.map((cp) => {
            const visited = visitedCpMap.get(cp.id);
            return (
              <div
                key={cp.id}
                className={`p-3 rounded-xl border text-xs transition ${
                  visited
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-white'
                    : 'bg-slate-950/70 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono font-extrabold text-sm text-amber-300">
                    {cp.code}
                  </span>
                  <span className="font-mono text-[11px] text-emerald-400 font-bold">
                    {cp.points} pts
                  </span>
                </div>
                {cp.name && (
                  <div className="text-[11px] truncate text-slate-300 mt-0.5">
                    {cp.name}
                  </div>
                )}
                <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] font-mono">
                  {visited ? (
                    <span className="text-emerald-300 font-bold">
                      ✅ Diambil (#{visited.stepIndex} •{' '}
                      {formatElapsedSeconds(visited.cumulativeSeconds)})
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
    </div>
  );
}
