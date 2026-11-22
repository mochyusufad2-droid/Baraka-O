/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useEffect } from 'react';
import { BookOpen, Shield, Smartphone } from 'lucide-react';
import OrganizerDashboard from './components/organizer/OrganizerDashboard';
import ParticipantView from './components/participant/ParticipantView';
import PublicLiveLeaderboard from './components/public/PublicLiveLeaderboard';
import { TutorialGuideModal } from './components/public/TutorialGuideModal';
import { loadPersistedParticipantState } from './services/offlineQueue';
import { UserRole } from './types';

const ORG_TOKEN_STORAGE_KEY = 'baraka_organizer_token';

function detectLiveQuery(): { isLive: boolean; courseId: string | null } {
  try {
    const url = new URL(window.location.href);
    const hasLiveParam = url.searchParams.get('live') === 'true';
    const path = url.pathname.toLowerCase();
    const isLivePath = path.startsWith('/live');
    const courseId = url.searchParams.get('course') || null;
    return { isLive: hasLiveParam || isLivePath, courseId };
  } catch {
    return { isLive: false, courseId: null };
  }
}

function detectInitialAuthenticatedRole(): UserRole | null {
  try {
    const participantState = loadPersistedParticipantState();
    if (participantState.token && participantState.participant) {
      return UserRole.PARTICIPANT;
    }
    const orgToken = localStorage.getItem(ORG_TOKEN_STORAGE_KEY);
    if (orgToken) {
      return UserRole.ORGANIZER;
    }
  } catch {
    // Abaikan jika localStorage tidak tersedia
  }
  return null;
}

export default function App() {
  const [liveInfo, setLiveInfo] = useState<{ isLive: boolean; courseId: string | null }>(
    () => detectLiveQuery()
  );
  const [authenticatedRole, setAuthenticatedRole] = useState<UserRole | null>(
    () => detectInitialAuthenticatedRole()
  );
  const [loginRoleChoice, setLoginRoleChoice] = useState<UserRole>(
    UserRole.PARTICIPANT
  );
  const [isParticipantInActiveCourse, setIsParticipantInActiveCourse] =
    useState<boolean>(false);
  const [isTutorialGuideOpen, setIsTutorialGuideOpen] = useState<boolean>(false);

  useEffect(() => {
    const handlePopState = () => {
      setLiveInfo(detectLiveQuery());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleParticipantAuthenticated = useCallback(() => {
    setAuthenticatedRole(UserRole.PARTICIPANT);
  }, []);

  const handleOrganizerAuthenticated = useCallback(() => {
    setAuthenticatedRole(UserRole.ORGANIZER);
  }, []);

  const handleLogoutToGate = useCallback(() => {
    setAuthenticatedRole(null);
    setIsParticipantInActiveCourse(false);
  }, []);

  const handleExitLiveView = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('live');
    url.searchParams.delete('course');
    if (url.pathname.startsWith('/live')) {
      url.pathname = '/';
    }
    window.history.pushState({}, '', url.toString());
    setLiveInfo({ isLive: false, courseId: null });
  }, []);

  // JIKA SEDANG MEMBUKA LINK LIVE PENONTON (BEBAS AKSES TANPA LOGIN)
  if (liveInfo.isLive) {
    return (
      <PublicLiveLeaderboard
        initialCourseId={liveInfo.courseId}
        onBackToApp={handleExitLiveView}
      />
    );
  }

  const currentRole = authenticatedRole ?? loginRoleChoice;
  const hideOuterHeaderForRunnerCockpit =
    currentRole === UserRole.PARTICIPANT && isParticipantInActiveCourse;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* HEADER UTAMA ORIENTRA (DISEMBUNYIKAN SAAT PELARI DI DALAM KOKPIT LOMBA AGAR MENYATU DI HEADER KOKPIT) */}
      {!hideOuterHeaderForRunnerCockpit && (
        <header className="sticky top-0 z-30 border-b border-sky-500/25 bg-[#061529]/95 backdrop-blur shadow-lg shadow-black/30">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3.5 py-2 sm:px-4 sm:py-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-white p-0.5 shadow-md shadow-sky-950/60 ring-2 ring-sky-400/50 shrink-0 overflow-hidden">
                <img
                  src="/orientra-logo.jpeg"
                  alt="ORIENTRA Logo"
                  className="h-full w-full object-contain scale-125"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-extrabold tracking-wider text-white sm:text-lg leading-tight">
                    ORIENT<span className="text-amber-500">RA</span>
                  </h1>
                </div>
                <p className="text-[10px] sm:text-[11px] font-medium text-sky-300/90 leading-tight">
                  Digital Orienteering &amp; Race Platform
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsTutorialGuideOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-3 py-1.5 text-xs font-bold text-emerald-300 shadow-sm transition cursor-pointer"
                title="Buka Panduan Lengkap Peserta & Organizer (PDF / Markdown / NotebookLM)"
              >
                <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
                <span>Panduan</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {isTutorialGuideOpen && (
        <TutorialGuideModal onClose={() => setIsTutorialGuideOpen(false)} />
      )}

      {/* KONTEN UTAMA */}
      <main
        className={`mx-auto max-w-6xl ${
          hideOuterHeaderForRunnerCockpit
            ? 'px-2.5 py-1.5 sm:px-4 sm:py-3'
            : 'px-3 py-3 sm:px-4 sm:py-6'
        }`}
      >
        {/* GERBANG PILIHAN LOGIN AWAL (HANYA MUNCUL SAAT BELUM LOGIN!) */}
        {authenticatedRole === null && (
          <div className="mx-auto mb-4 max-w-md rounded-2xl border border-sky-500/25 bg-[#0a1f38]/95 p-2.5 shadow-xl shadow-black/40">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLoginRoleChoice(UserRole.PARTICIPANT)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
                  loginRoleChoice === UserRole.PARTICIPANT
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-950/60 ring-1 ring-sky-400/50'
                    : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <Smartphone className="h-4 w-4" />
                Peserta
              </button>
              <button
                type="button"
                onClick={() => setLoginRoleChoice(UserRole.ORGANIZER)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
                  loginRoleChoice === UserRole.ORGANIZER
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-950/60 ring-1 ring-amber-300/50'
                    : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <Shield className="h-4 w-4" />
                Organizer
              </button>
            </div>
          </div>
        )}

        {currentRole === UserRole.PARTICIPANT ? (
          <ParticipantView
            onAuthenticated={handleParticipantAuthenticated}
            onLogout={handleLogoutToGate}
            onActiveCourseModeChange={setIsParticipantInActiveCourse}
          />
        ) : (
          <OrganizerDashboard
            onAuthenticated={handleOrganizerAuthenticated}
            onLogout={handleLogoutToGate}
          />
        )}
      </main>
    </div>
  );
}
