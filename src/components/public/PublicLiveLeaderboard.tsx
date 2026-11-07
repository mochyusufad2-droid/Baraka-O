import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Compass,
  Trophy,
  Clock,
  RefreshCw,
  Search,
  Maximize2,
  Minimize2,
  Calendar,
  MapPin,
  Users,
  Flag,
  Share2,
  Check,
  ChevronRight,
  ArrowLeft,
  Radio,
} from 'lucide-react';
import { SessionStatus } from '../../types';

interface PublicCourseSummary {
  id: string;
  name: string;
  description?: string;
  locationName?: string;
  date: string;
  durationMinutes: number;
  scoringEnabled: boolean;
  validationMethod: string;
  checkpointsCount: number;
  createdByOrganizerName: string;
}

interface PublicLeaderboardItem {
  sessionId: string;
  rank: number;
  teamName: string;
  gender: string;
  ageGroup: string;
  attemptNumber: number;
  status: SessionStatus;
  checkpointsCompleted: number;
  totalCheckpoints: number;
  grossScore: number;
  overtimeMinutes: number;
  penaltyPoints: number;
  totalScore: number;
  durationSeconds?: number;
  isDnf?: boolean;
  dnfReason?: string;
}

interface PublicLeaderboardData {
  course: {
    id: string;
    name: string;
    locationName?: string;
    date: string;
    durationMinutes: number;
    checkpointsCount: number;
    createdByOrganizerName: string;
  };
  totalParticipants: number;
  updatedAt: string;
  leaderboard: PublicLeaderboardItem[];
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
  return [m.toString().padStart(2, '0'), s.toString().padStart(2, '0')].join(':');
}

export default function PublicLiveLeaderboard({
  initialCourseId,
  onBackToApp,
}: {
  initialCourseId?: string | null;
  onBackToApp?: () => void;
}) {
  const [courses, setCourses] = useState<PublicCourseSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    initialCourseId || null
  );
  const [data, setData] = useState<PublicLeaderboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ambil daftar course publik jika belum ada course terpilih
  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await fetch('/api/public/courses');
        if (res.ok) {
          const body = await res.json();
          const list: PublicCourseSummary[] = body.courses || [];
          setCourses(list);
          if (!selectedCourseId && list.length > 0) {
            // Jika ada query param ?course= di URL, gunakan itu
            const urlParams = new URLSearchParams(window.location.search);
            const queryCourse = urlParams.get('course');
            if (queryCourse && list.some((c) => c.id === queryCourse)) {
              setSelectedCourseId(queryCourse);
            } else if (list.length === 1) {
              setSelectedCourseId(list[0].id);
            }
          }
        }
      } catch {
        // Abaikan kegagalan awal
      }
    }
    loadCourses();
  }, [selectedCourseId]);

  // Ambil data leaderboard khusus course terpilih secara berkala (Auto Poll 5 detik)
  useEffect(() => {
    if (!selectedCourseId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchLeaderboard(isSilent = false) {
      if (!isSilent) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const res = await fetch(`/api/public/leaderboard/${selectedCourseId}`);
        if (!res.ok) {
          throw new Error('Course tidak ditemukan atau belum memiliki data lomba.');
        }
        const json: PublicLeaderboardData = await res.json();
        if (isMounted) {
          setData(json);
          setErrorMsg(null);
        }
      } catch (err: any) {
        if (isMounted && !data) {
          setErrorMsg(err.message || 'Gagal memuat papan skor.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    fetchLeaderboard(false);
    const interval = setInterval(() => fetchLeaderboard(true), 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedCourseId]);

  // Fungsi salin link course khusus penonton
  const handleCopyCourseLink = () => {
    if (!selectedCourseId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('live', 'true');
    url.searchParams.set('course', selectedCourseId);
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Filter pencarian nama tim
  const filteredLeaderboard: PublicLeaderboardItem[] = useMemo(() => {
    if (!data?.leaderboard) return [];
    if (!searchQuery.trim()) return data.leaderboard;
    const q = searchQuery.toLowerCase();
    return data.leaderboard.filter((row: PublicLeaderboardItem) =>
      row.teamName.toLowerCase().includes(q)
    );
  }, [data?.leaderboard, searchQuery]);

  const top3: PublicLeaderboardItem[] = useMemo(() => {
    return filteredLeaderboard.slice(0, 3);
  }, [filteredLeaderboard]);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none font-sans"
    >
      {/* HEADER LIVE SPECTATOR */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 shadow-md">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onBackToApp && (
              <button
                type="button"
                onClick={onBackToApp}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
                title="Kembali ke Aplikasi Utama"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400">
                  LIVE ARENA LEADERBOARD
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-black tracking-wide text-white">
                {data?.course?.name || 'Papan Skor Langsung'}
              </h1>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {selectedCourseId && (
              <button
                type="button"
                onClick={handleCopyCourseLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Link Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Bagikan Link</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
              title="Layar Penuh (TV Display)"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* KONTEN UTAMA */}
      <main className="flex-1 mx-auto max-w-7xl w-full p-4 sm:p-6 space-y-6">
        {/* JIKA BELUM MEMILIH COURSE ATAU INGIN GANTI COURSE */}
        {courses.length > 1 && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-mono uppercase font-bold text-amber-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-rose-400" /> Pilih Lintasan Lomba (Course):
              </span>
              <span className="text-xs text-slate-400">
                {courses.length} Course Tersedia
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {courses.map((c) => {
                const isSelected = selectedCourseId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCourseId(c.id);
                      const url = new URL(window.location.href);
                      url.searchParams.set('live', 'true');
                      url.searchParams.set('course', c.id);
                      window.history.replaceState({}, '', url.toString());
                    }}
                    className={`text-left p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 text-white shadow-lg shadow-amber-500/10'
                        : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm line-clamp-1">{c.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>Penyelenggara: {c.createdByOrganizerName}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] font-mono text-amber-300/80 flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <span>{c.checkpointsCount} Pos Checkpoint</span>
                      <span>{c.date}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* LOADING & ERROR STATES */}
        {isLoading && (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 mx-auto text-amber-400 animate-spin" />
            <p className="text-sm text-slate-400 font-mono">
              Menghubungkan ke Papan Skor Langsung...
            </p>
          </div>
        )}

        {errorMsg && !isLoading && (
          <div className="p-6 text-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
            <p className="font-bold">{errorMsg}</p>
            <p className="text-xs text-slate-400">
              Silakan pilih Course lain atau pastikan koneksi internet aktif.
            </p>
          </div>
        )}

        {/* DATA LEADERBOARD TERSEDIA */}
        {data && !isLoading && (
          <>
            {/* DETAIL COURSE & SEARCH */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  {data.course.locationName && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      {data.course.locationName}
                    </span>
                  )}
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    {data.course.date}
                  </span>
                  <span>•</span>
                  <span className="text-amber-300 font-medium">
                    {data.course.checkpointsCount} Checkpoints
                  </span>
                  <span>•</span>
                  <span className="text-slate-300">
                    Oleh: {data.course.createdByOrganizerName}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari Nama Tim..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
                {isRefreshing && (
                  <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                )}
              </div>
            </div>

            {/* PODIUM TOP 3 */}
            {top3.length > 0 && !searchQuery && (
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* #2 Perak */}
                <div className="order-2 md:order-1 rounded-2xl bg-slate-900/80 border border-slate-500/30 p-4 relative overflow-hidden shadow-xl flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-400/15 border border-slate-400/40 text-2xl">
                      🥈
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                        Peringkat 2
                      </span>
                      <div className="font-extrabold text-white text-base truncate">
                        {top3[1] ? top3[1].teamName : 'Belum Terisi'}
                      </div>
                      {top3[1] && (
                        <div className="text-xs text-slate-400 truncate">
                          {top3[1].gender} • {top3[1].ageGroup} • {top3[1].checkpointsCompleted}/{data.course.checkpointsCount} CP
                        </div>
                      )}
                    </div>
                  </div>
                  {top3[1] && (
                    <div className="text-right shrink-0 pl-2">
                      <div className="font-mono font-black text-emerald-400 text-lg">
                        {top3[1].totalScore} pts
                      </div>
                      <div className="font-mono text-xs text-slate-300">
                        {formatElapsedSeconds(top3[1].durationSeconds)}
                      </div>
                    </div>
                  )}
                </div>

                {/* #1 Emas */}
                <div className="order-1 md:order-2 rounded-2xl bg-gradient-to-b from-amber-500/20 to-slate-900/90 border-2 border-amber-400 p-4.5 relative overflow-hidden shadow-2xl shadow-amber-500/10 flex items-center justify-between transform md:-translate-y-1">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400/25 border border-amber-400 text-3xl shadow-inner">
                      🏆
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded">
                        PEMIMPIN KLASEMEN
                      </span>
                      <div className="font-black text-white text-lg truncate mt-1">
                        {top3[0].teamName}
                      </div>
                      <div className="text-xs text-amber-200/90 truncate">
                        {top3[0].gender} • {top3[0].ageGroup} • {top3[0].checkpointsCompleted}/{data.course.checkpointsCount} CP
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <div className="font-mono font-black text-emerald-300 text-2xl">
                      {top3[0].totalScore} pts
                    </div>
                    <div className="font-mono text-xs font-bold text-white flex items-center justify-end gap-1">
                      {top3[0].status === SessionStatus.ACTIVE && (
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      )}
                      {formatElapsedSeconds(top3[0].durationSeconds)}
                    </div>
                  </div>
                </div>

                {/* #3 Perunggu */}
                <div className="order-3 md:order-3 rounded-2xl bg-slate-900/80 border border-amber-700/40 p-4 relative overflow-hidden shadow-xl flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-700/20 border border-amber-700/50 text-2xl">
                      🥉
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase text-amber-500 font-bold">
                        Peringkat 3
                      </span>
                      <div className="font-extrabold text-white text-base truncate">
                        {top3[2] ? top3[2].teamName : 'Belum Terisi'}
                      </div>
                      {top3[2] && (
                        <div className="text-xs text-slate-400 truncate">
                          {top3[2].gender} • {top3[2].ageGroup} • {top3[2].checkpointsCompleted}/{data.course.checkpointsCount} CP
                        </div>
                      )}
                    </div>
                  </div>
                  {top3[2] && (
                    <div className="text-right shrink-0 pl-2">
                      <div className="font-mono font-bold text-emerald-400 text-lg">
                        {top3[2].totalScore} pts
                      </div>
                      <div className="font-mono text-xs text-slate-300">
                        {formatElapsedSeconds(top3[2].durationSeconds)}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* TABEL PERINGKAT LENGKAP */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-mono text-[11px] uppercase">
                      <th className="py-3.5 px-4 text-center">Rank</th>
                      <th className="py-3.5 px-4">Nama Tim</th>
                      <th className="py-3.5 px-3">Kategori</th>
                      <th className="py-3.5 px-3">Status</th>
                      <th className="py-3.5 px-3">Progres Pos</th>
                      <th className="py-3.5 px-3 text-right">Poin</th>
                      <th className="py-3.5 px-3 text-right">Penalti</th>
                      <th className="py-3.5 px-4 text-right text-emerald-300 font-bold">
                        Total Skor
                      </th>
                      <th className="py-3.5 px-4 text-right font-bold text-white">
                        Waktu Tempuh
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredLeaderboard.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="py-16 text-center text-slate-500 font-mono text-xs"
                        >
                          Belum ada data peserta untuk lintasan ini.
                        </td>
                      </tr>
                    ) : (
                      filteredLeaderboard.map((row: PublicLeaderboardItem) => {
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
                            {/* Rank */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
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

                            {/* Nama Tim */}
                            <td className="py-3.5 px-4 text-emerald-300 font-extrabold whitespace-nowrap text-sm sm:text-base">
                              {row.teamName}
                            </td>

                            {/* Kategori */}
                            <td className="py-3.5 px-3 text-slate-300 font-mono text-xs whitespace-nowrap">
                              {row.gender} • {row.ageGroup}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-3 whitespace-nowrap">
                              {row.isDnf ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  DNF (Gugur)
                                </span>
                              ) : row.status === SessionStatus.FINISHED ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                                  <Flag className="w-3 h-3" /> FINISHED
                                </span>
                              ) : row.status === SessionStatus.ACTIVE ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  RUNNING
                                </span>
                              ) : (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                  NOT STARTED
                                </span>
                              )}
                            </td>

                            {/* Progres Pos */}
                            <td className="py-3.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                              {row.checkpointsCompleted} / {row.totalCheckpoints} CP
                            </td>

                            {/* Poin Gross */}
                            <td className="py-3.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                              {row.grossScore}
                            </td>

                            {/* Penalti */}
                            <td className="py-3.5 px-3 text-right font-mono whitespace-nowrap">
                              {row.penaltyPoints > 0 ? (
                                <span className="text-rose-400 font-semibold">
                                  -{row.penaltyPoints}
                                </span>
                              ) : (
                                <span className="text-slate-600">0</span>
                              )}
                            </td>

                            {/* Total Skor */}
                            <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-300 text-base sm:text-lg whitespace-nowrap">
                              {row.totalScore}
                            </td>

                            {/* Waktu Tempuh */}
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-white text-sm sm:text-base whitespace-nowrap">
                              {formatElapsedSeconds(row.durationSeconds)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-3 text-center text-[11px] text-slate-500 font-mono">
        BARAKA ADVENTURE — Digital Orienteering Live Timing • Pembaruan otomatis setiap 5 detik
      </footer>
    </div>
  );
}
