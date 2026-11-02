import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  ChevronDown,
  Clock,
  Compass,
  Crown,
  Eye,
  Flag,
  Maximize2,
  Minimize2,
  Play,
  Radio,
  RefreshCw,
  Trophy,
  Users,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import {
  Course,
  ORIENTEERING_AGE_GROUPS,
  ORIENTEERING_GENDER_OPTIONS,
  ParticipantPublic,
  ParticipantSession,
  SessionStatus,
} from '../../types';

interface SpectatorLiveLeaderboardModalProps {
  courses: Course[];
  sessions: ParticipantSession[];
  participants: ParticipantPublic[];
  initialCourseId?: string;
  onClose: () => void;
}

interface SplitStep {
  stepIndex: number;
  checkpointId: string;
  shortCode: string;
  points: number;
  cumulativeSeconds?: number;
  legSplitSeconds?: number;
}

interface LeaderboardItem {
  sessionId: string;
  rank: number;
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
  splits: SplitStep[];
  finishCumulativeSeconds?: number;
  finishSplitSeconds?: number;
}

function formatElapsedSeconds(totalSeconds?: number): string {
  if (totalSeconds === undefined || totalSeconds === null || totalSeconds < 0) {
    return '--:--';
  }
  const sec = Math.floor(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return [
      h.toString().padStart(2, '0'),
      m.toString().padStart(2, '0'),
      s.toString().padStart(2, '0'),
    ].join(':');
  }
  return [m.toString().padStart(2, '0'), s.toString().padStart(2, '0')].join(
    ':'
  );
}

function statusWeight(status: SessionStatus): number {
  switch (status) {
    case SessionStatus.FINISHED:
      return 3;
    case SessionStatus.ACTIVE:
      return 2;
    default:
      return 1;
  }
}

export function SpectatorLiveLeaderboardModal({
  courses,
  sessions,
  participants,
  initialCourseId,
  onClose,
}: SpectatorLiveLeaderboardModalProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialCourseId || (courses.length > 0 ? courses[0].id : 'ALL')
  );
  const [genderFilter, setGenderFilter] = useState<string>('ALL');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>('ALL');
  const [showSplits, setShowSplits] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const containerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollDirectionRef = useRef<'down' | 'up'>('down');

  // Real-time wall clock and live session running duration ticking every second
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Listen to ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Sync fullscreen state with document
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleBrowserFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current) {
          await containerRef.current.requestFullscreen();
        } else {
          await document.documentElement.requestFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Browser might block or not support
    }
  };

  // TV Auto-Scroll implementation
  useEffect(() => {
    if (!autoScroll) return;
    const el = tableContainerRef.current;
    if (!el) return;

    const scrollInterval = window.setInterval(() => {
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      if (scrollDirectionRef.current === 'down') {
        if (el.scrollTop >= maxScroll - 5) {
          // Pause at bottom, then scroll up
          scrollDirectionRef.current = 'up';
        } else {
          el.scrollTop += 1.5;
        }
      } else {
        if (el.scrollTop <= 5) {
          scrollDirectionRef.current = 'down';
        } else {
          el.scrollTop -= 2.5;
        }
      }
    }, 45);

    return () => window.clearInterval(scrollInterval);
  }, [autoScroll]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  // Compute enriched and sorted leaderboard rows
  const leaderboardRows = useMemo<LeaderboardItem[]>(() => {
    const participantMap = new Map(participants.map((p) => [p.id, p]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    const targetSessions = sessions.filter((s) => {
      if (selectedCourseId !== 'ALL' && s.courseId !== selectedCourseId) {
        return false;
      }
      return true;
    });

    const enriched = targetSessions.map((sess) => {
      const p = participantMap.get(sess.participantId);
      const c = courseMap.get(sess.courseId);

      const startMs = sess.startedAt ? Date.parse(sess.startedAt) : undefined;
      const finishMs = sess.finishedAt
        ? Date.parse(sess.finishedAt)
        : undefined;

      const liveDurationSec =
        sess.status === SessionStatus.FINISHED
          ? sess.durationSeconds ||
            (startMs && finishMs
              ? Math.max(0, Math.floor((finishMs - startMs) / 1000))
              : undefined)
          : sess.status === SessionStatus.ACTIVE && startMs
          ? Math.max(
              sess.durationSeconds || 0,
              Math.floor((nowTick - startMs) / 1000)
            )
          : sess.durationSeconds;

      // Compute checkpoint points
      const cpPoints =
        c && c.scoringEnabled
          ? sess.validatedCheckpointIds.reduce((sum, cpId) => {
              const cp = c.checkpoints.find((chk) => chk.id === cpId);
              return sum + (cp ? Number(cp.points) || 0 : 0);
            }, 0)
          : 0;

      const grossScore =
        c && !c.scoringEnabled
          ? 0
          : Math.max(
              cpPoints,
              sess.grossScore || 0,
              sess.totalScore || 0
            );

      let overtimeMinutes = 0;
      let penaltyPoints = 0;

      if (
        c &&
        c.durationMinutes &&
        c.durationMinutes > 0 &&
        liveDurationSec !== undefined &&
        liveDurationSec > c.durationMinutes * 60
      ) {
        const overSec = liveDurationSec - c.durationMinutes * 60;
        overtimeMinutes = Math.ceil(overSec / 60);
        if (c.overtimePenaltyEnabled) {
          penaltyPoints =
            overtimeMinutes *
            Math.max(0, Number(c.overtimePenaltyPointsPerMinute) || 0);
        }
      }

      const netScore = Math.max(0, grossScore - penaltyPoints);

      // Simple splits based on validatedCheckpointIds
      const splits: SplitStep[] = (sess.validatedCheckpointIds || []).map(
        (cpId, idx) => {
          const cp = c?.checkpoints.find((chk) => chk.id === cpId);
          return {
            stepIndex: idx + 1,
            checkpointId: cpId,
            shortCode: cp?.code || `#${idx + 1}`,
            points: cp ? Number(cp.points) || 0 : 0,
          };
        }
      );

      return {
        sessionId: sess.id,
        rank: 0,
        bibNumber: p?.bibNumber || '-',
        participantName: p?.name || 'Peserta',
        teamName: p?.teamName || p?.name || '-',
        gender: p?.gender || 'Other',
        ageGroup: p?.ageGroup || 'Semua Umur',
        courseId: sess.courseId,
        courseName: c?.name || sess.courseId,
        attemptNumber: sess.attemptNumber || 1,
        status: sess.status,
        checkpointsCompleted: sess.validatedCheckpointIds?.length || 0,
        totalCheckpoints: c?.checkpoints?.length || 0,
        grossScore,
        overtimeMinutes,
        penaltyPoints,
        totalScore: netScore,
        durationSeconds: liveDurationSec,
        splits,
        finishCumulativeSeconds: liveDurationSec,
      };
    });

    const filtered = enriched.filter((item) => {
      if (
        genderFilter !== 'ALL' &&
        item.gender.toLowerCase() !== genderFilter.toLowerCase()
      ) {
        return false;
      }
      if (ageGroupFilter !== 'ALL' && item.ageGroup !== ageGroupFilter) {
        return false;
      }
      return true;
    });

    return filtered
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
  }, [
    courses,
    sessions,
    participants,
    selectedCourseId,
    genderFilter,
    ageGroupFilter,
    nowTick,
  ]);

  const splitColumnCount = useMemo(() => {
    const courseCpCount = selectedCourse?.checkpoints.length || 0;
    const maxVisitedInRows = leaderboardRows.reduce(
      (max, r) => Math.max(max, r.splits.length),
      0
    );
    return Math.max(courseCpCount, maxVisitedInRows);
  }, [selectedCourse, leaderboardRows]);

  // Summary counts
  const totalCount = leaderboardRows.length;
  const activeCount = leaderboardRows.filter(
    (r) => r.status === SessionStatus.ACTIVE
  ).length;
  const finishedCount = leaderboardRows.filter(
    (r) => r.status === SessionStatus.FINISHED
  ).length;

  const top3 = leaderboardRows.slice(0, 3);
  const currentTimeString = new Date(nowTick).toLocaleTimeString('id-ID', {
    hour12: false,
  });

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#070b14] text-slate-100 flex flex-col overflow-hidden font-sans select-none"
    >
      {/* 1. TOP BROADCAST HEADER */}
      <header className="border-b border-slate-800/80 bg-slate-900/95 px-4 py-3 backdrop-blur-md shadow-2xl flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Event Title */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                  BARAKA ADVENTURE
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                  LIVE ARENA
                </span>
              </div>
              <h1 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
                {selectedCourse ? selectedCourse.name : 'SEMUA COURSE PERLOMBAAN'}
                {selectedCourse?.locationName && (
                  <span className="text-xs font-normal text-slate-400 hidden sm:inline">
                    • {selectedCourse.locationName}
                  </span>
                )}
              </h1>
            </div>
          </div>

          {/* Real-time Wall Clock & Quick Stats */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              <div className="font-mono text-base md:text-lg font-bold text-white tracking-wider">
                {currentTimeString}
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-3 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono">
              <div>
                <span className="text-slate-400">Total: </span>
                <strong className="text-white font-bold">{totalCount}</strong>
              </div>
              <span className="text-slate-700">|</span>
              <div className="text-emerald-400">
                <span className="text-slate-400">Lari: </span>
                <strong>{activeCount}</strong>
              </div>
              <span className="text-slate-700">|</span>
              <div className="text-sky-400">
                <span className="text-slate-400">Finish: </span>
                <strong>{finishedCount}</strong>
              </div>
            </div>

            {/* Controls: Fullscreen, AutoScroll, Close */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                title="Gulir otomatis ke bawah & atas untuk layar TV tanpa operator"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  autoScroll
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                <Radio
                  className={`w-3.5 h-3.5 ${autoScroll ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline">Auto-Scroll TV</span>
              </button>

              <button
                type="button"
                onClick={toggleBrowserFullscreen}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh (F11)'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition cursor-pointer"
                title="Tutup Mode Penonton (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. FILTER & SPLIT SELECTOR ROW */}
        <div className="mt-3 pt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Course Selector */}
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-amber-300 font-bold focus:outline-none focus:border-amber-400 text-xs"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  Course: {c.name}
                </option>
              ))}
              <option value="ALL">Semua Course</option>
            </select>

            {/* Gender Filter */}
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-400 text-xs"
            >
              <option value="ALL">Semua Gender</option>
              {ORIENTEERING_GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>

            {/* Age Group Filter */}
            <select
              value={ageGroupFilter}
              onChange={(e) => setAgeGroupFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-400 text-xs"
            >
              <option value="ALL">Semua Kelompok Umur</option>
              {ORIENTEERING_AGE_GROUPS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>

            {(genderFilter !== 'ALL' || ageGroupFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setGenderFilter('ALL');
                  setAgeGroupFilter('ALL');
                }}
                className="text-amber-400 hover:underline font-medium text-xs ml-1"
              >
                Reset Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Split Columns */}
            <button
              type="button"
              onClick={() => setShowSplits(!showSplits)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                showSplits
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
              }`}
            >
              {showSplits ? 'Tutup Split Pos' : 'Tampilkan Split Pos (#1..#N)'}
            </button>
          </div>
        </div>
      </header>

      {/* 3. PODIUM HIGHLIGHTS (TOP 3 SPOTLIGHT) */}
      {top3.length > 0 && (
        <section className="bg-gradient-to-b from-slate-900/60 to-transparent px-4 py-3 border-b border-slate-800/60 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* #2 Perak */}
            <div className="order-2 md:order-1 rounded-xl bg-slate-900/80 border border-slate-400/30 p-3 relative overflow-hidden shadow-lg flex items-center justify-between">
              <div className="absolute top-0 right-0 h-16 w-16 bg-slate-400/5 rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-slate-400/15 border border-slate-400/40 text-slate-300 font-black text-xl">
                  🥈
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                    Peringkat 2
                  </span>
                  <div className="font-bold text-white text-sm truncate">
                    {top3[1] ? (
                      <>
                        <span className="font-mono text-slate-300 mr-1.5">
                          {top3[1].bibNumber}
                        </span>
                        {top3[1].participantName}
                      </>
                    ) : (
                      'Belum Terisi'
                    )}
                  </div>
                  {top3[1] && (
                    <div className="text-[11px] text-slate-400 truncate">
                      {top3[1].teamName} • {top3[1].checkpointsCompleted}/
                      {top3[1].totalCheckpoints} CP
                    </div>
                  )}
                </div>
              </div>
              {top3[1] && (
                <div className="text-right flex-shrink-0 pl-2">
                  <div className="font-mono font-bold text-emerald-400 text-sm">
                    {top3[1].totalScore} pts
                  </div>
                  <div className="font-mono text-xs text-white">
                    {formatElapsedSeconds(top3[1].durationSeconds)}
                  </div>
                </div>
              )}
            </div>

            {/* #1 Emas (Champion Spotlight) */}
            <div className="order-1 md:order-2 rounded-xl bg-gradient-to-b from-amber-500/15 to-slate-900/90 border-2 border-amber-400 p-3.5 relative overflow-hidden shadow-xl shadow-amber-500/10 flex items-center justify-between transform md:-translate-y-1">
              <div className="absolute -top-6 -right-6 h-20 w-20 bg-amber-400/20 rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-400/25 border border-amber-400 text-amber-300 font-black text-2xl shadow-inner">
                  🏆
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded">
                      PEMIMPIN KLASEMEN
                    </span>
                  </div>
                  <div className="font-black text-white text-base truncate mt-0.5">
                    <span className="font-mono text-amber-300 mr-1.5">
                      {top3[0].bibNumber}
                    </span>
                    {top3[0].participantName}
                  </div>
                  <div className="text-xs text-amber-200/80 truncate">
                    {top3[0].teamName} • {top3[0].checkpointsCompleted}/
                    {top3[0].totalCheckpoints} CP
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0 pl-3">
                <div className="font-mono font-black text-emerald-300 text-lg">
                  {top3[0].totalScore} pts
                </div>
                <div className="font-mono text-xs font-bold text-white flex items-center justify-end gap-1">
                  {top3[0].status === SessionStatus.ACTIVE && (
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                  )}
                  {formatElapsedSeconds(top3[0].durationSeconds)}
                </div>
              </div>
            </div>

            {/* #3 Perunggu */}
            <div className="order-3 md:order-3 rounded-xl bg-slate-900/80 border border-amber-700/40 p-3 relative overflow-hidden shadow-lg flex items-center justify-between">
              <div className="absolute top-0 right-0 h-16 w-16 bg-amber-700/10 rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-700/20 border border-amber-700/50 text-amber-500 font-black text-xl">
                  🥉
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-mono uppercase text-amber-500 font-bold">
                    Peringkat 3
                  </span>
                  <div className="font-bold text-white text-sm truncate">
                    {top3[2] ? (
                      <>
                        <span className="font-mono text-slate-300 mr-1.5">
                          {top3[2].bibNumber}
                        </span>
                        {top3[2].participantName}
                      </>
                    ) : (
                      'Belum Terisi'
                    )}
                  </div>
                  {top3[2] && (
                    <div className="text-[11px] text-slate-400 truncate">
                      {top3[2].teamName} • {top3[2].checkpointsCompleted}/
                      {top3[2].totalCheckpoints} CP
                    </div>
                  )}
                </div>
              </div>
              {top3[2] && (
                <div className="text-right flex-shrink-0 pl-2">
                  <div className="font-mono font-bold text-emerald-400 text-sm">
                    {top3[2].totalScore} pts
                  </div>
                  <div className="font-mono text-xs text-white">
                    {formatElapsedSeconds(top3[2].durationSeconds)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 4. MAIN SPECTATOR LEADERBOARD TABLE */}
      <main
        ref={tableContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
      >
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-mono text-[11px] md:text-xs uppercase">
                  <th className="py-3 px-3 text-center whitespace-nowrap">Rank</th>
                  <th className="py-3 px-4 whitespace-nowrap">BIB &amp; Peserta</th>
                  <th className="py-3 px-4 whitespace-nowrap">Tim</th>
                  <th className="py-3 px-3 whitespace-nowrap">Kategori</th>
                  <th className="py-3 px-3 whitespace-nowrap">Status</th>
                  <th className="py-3 px-3 whitespace-nowrap">Progres Pos</th>
                  <th className="py-3 px-3 whitespace-nowrap text-right">Poin</th>
                  <th className="py-3 px-3 whitespace-nowrap text-right">Penalti</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right text-emerald-300 font-bold">
                    Total Skor
                  </th>
                  <th className="py-3 px-4 whitespace-nowrap text-right font-bold text-white">
                    Waktu Tempuh
                  </th>
                  {showSplits &&
                    Array.from({ length: splitColumnCount }, (_, idx) => (
                      <th
                        key={`spectator-split-${idx + 1}`}
                        className="py-3 px-3 text-center whitespace-nowrap bg-slate-950/90 border-l border-slate-800 text-amber-300"
                      >
                        #{idx + 1}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {leaderboardRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10 + (showSplits ? splitColumnCount : 0)}
                      className="py-16 text-center text-slate-500 font-mono text-sm"
                    >
                      Belum ada data peserta untuk filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  leaderboardRows.map((row) => {
                    const isTop1 = row.rank === 1;
                    const isTop2 = row.rank === 2;
                    const isTop3 = row.rank === 3;

                    return (
                      <tr
                        key={row.sessionId}
                        className={`transition-colors ${
                          isTop1
                            ? 'bg-amber-500/10 hover:bg-amber-500/15'
                            : isTop2
                            ? 'bg-slate-300/5 hover:bg-slate-300/10'
                            : isTop3
                            ? 'bg-amber-700/10 hover:bg-amber-700/15'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          {isTop1 ? (
                            <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/30">
                              #1
                            </span>
                          ) : isTop2 ? (
                            <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-slate-300 text-slate-950 font-black text-xs">
                              #2
                            </span>
                          ) : isTop3 ? (
                            <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-amber-700 text-white font-black text-xs">
                              #3
                            </span>
                          ) : (
                            <span className="font-mono font-bold text-slate-400 text-sm">
                              #{row.rank}
                            </span>
                          )}
                        </td>

                        {/* BIB & Nama */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-amber-400 mr-2 text-xs md:text-sm bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            {row.bibNumber}
                          </span>
                          <span className="font-bold text-white text-sm md:text-base">
                            {row.participantName}
                          </span>
                        </td>

                        {/* Nama Tim */}
                        <td className="py-3.5 px-4 text-emerald-300 font-semibold whitespace-nowrap text-xs md:text-sm">
                          {row.teamName}
                        </td>

                        {/* Gender & Age Group */}
                        <td className="py-3.5 px-3 text-slate-300 font-mono text-xs whitespace-nowrap">
                          {row.gender} • {row.ageGroup}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {row.status === SessionStatus.FINISHED ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                              <Flag className="w-3 h-3" /> FINISHED
                            </span>
                          ) : row.status === SessionStatus.ACTIVE ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              RUNNING
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              NOT STARTED
                            </span>
                          )}
                        </td>

                        {/* Progres Pos */}
                        <td className="py-3.5 px-3 font-mono whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-200 font-bold">
                              {row.checkpointsCompleted}/{row.totalCheckpoints} CP
                            </span>
                            <div className="w-16 bg-slate-800 rounded-full h-1.5 hidden sm:block overflow-hidden">
                              <div
                                className="bg-amber-400 h-1.5 rounded-full transition-all duration-500"
                                style={{
                                  width: `${
                                    row.totalCheckpoints > 0
                                      ? (row.checkpointsCompleted /
                                          row.totalCheckpoints) *
                                        100
                                      : 0
                                  }%`,
                                }}
                              ></div>
                            </div>
                          </div>
                        </td>

                        {/* Poin Pos */}
                        <td className="py-3.5 px-3 font-mono text-slate-300 text-right whitespace-nowrap">
                          {row.grossScore}
                        </td>

                        {/* Penalti */}
                        <td className="py-3.5 px-3 font-mono text-right whitespace-nowrap">
                          {row.penaltyPoints > 0 ? (
                            <span className="text-rose-400 font-bold">
                              -{row.penaltyPoints}
                            </span>
                          ) : (
                            <span className="text-slate-600">0</span>
                          )}
                        </td>

                        {/* Total Skor Akhir */}
                        <td className="py-3.5 px-4 font-mono font-black text-emerald-400 text-base md:text-lg text-right whitespace-nowrap">
                          {row.totalScore}
                        </td>

                        {/* Waktu Tempuh Live */}
                        <td className="py-3.5 px-4 font-mono font-bold text-white text-sm md:text-base text-right whitespace-nowrap">
                          <span
                            className={
                              row.status === SessionStatus.ACTIVE
                                ? 'text-amber-300 animate-pulse'
                                : 'text-white'
                            }
                          >
                            {formatElapsedSeconds(row.durationSeconds)}
                          </span>
                        </td>

                        {/* Split Columns */}
                        {showSplits &&
                          Array.from(
                            { length: splitColumnCount },
                            (_, splitIdx) => {
                              const sp = row.splits[splitIdx];
                              if (!sp) {
                                return (
                                  <td
                                    key={`spectator-cell-${row.sessionId}-${splitIdx}`}
                                    className="py-2.5 px-3 text-center font-mono text-slate-600 whitespace-nowrap bg-slate-950/50 border-l border-slate-800/80"
                                  >
                                    -
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={`spectator-cell-${row.sessionId}-${splitIdx}`}
                                  className="py-2 px-3 text-center whitespace-nowrap bg-slate-950/50 border-l border-slate-800/80 font-mono text-xs"
                                >
                                  <div className="font-bold text-amber-300">
                                    {sp.shortCode}
                                  </div>
                                  <div className="text-[10px] text-emerald-400">
                                    +{sp.points}
                                  </div>
                                </td>
                              );
                            }
                          )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 5. FOOTER BROADCAST TICKER */}
      <footer className="border-t border-slate-800 bg-slate-950 px-4 py-2 text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>
            AUTO-UPDATE REAL-TIME • DILAYANI SERVER BARAKA ADVENTURE
          </span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>
            Tekan <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-200">ESC</kbd> untuk keluar
          </span>
          <span>•</span>
          <button
            type="button"
            onClick={toggleBrowserFullscreen}
            className="text-amber-400 hover:underline"
          >
            {isFullscreen ? 'Normal View' : 'Fullscreen (F11)'}
          </button>
        </div>
      </footer>
    </div>
  );
}
