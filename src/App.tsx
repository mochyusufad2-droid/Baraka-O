/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useEffect } from 'react';
import { Shield, Smartphone } from 'lucide-react';
import OrganizerDashboard from './components/organizer/OrganizerDashboard';
import ParticipantView from './components/participant/ParticipantView';
import PublicLiveLeaderboard from './components/public/PublicLiveLeaderboard';
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* HEADER UTAMA ORIENTRA (DENGAN LOGO RESMI & TONE KOMPAS BIRU-ORANYE) */}
      <header className="sticky top-0 z-30 border-b border-sky-500/25 bg-[#061529]/95 backdrop-blur shadow-lg shadow-black/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-0.5 shadow-md shadow-sky-950/60 ring-2 ring-sky-400/50 shrink-0 overflow-hidden">
              <img
                src="/orientra-logo.jpeg"
                alt="ORIENTRA Logo"
                className="h-full w-full object-contain scale-125"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-wider text-white sm:text-lg">
                  ORIENT<span className="text-amber-500">RA</span>
                </h1>
              </div>
              <p className="text-[11px] font-medium text-sky-300/90">
                Digital Orienteering &amp; Race Platform
              </p>
            </div>
          </div>

          {/* Indikator Peran Aktif khusus Organizer */}
          {authenticatedRole === UserRole.ORGANIZER && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300 shadow-sm">
              <Shield className="h-3.5 w-3.5 text-amber-400" />
              Dashboard Organizer
            </span>
          )}
        </div>
      </header>

      {/* KONTEN UTAMA */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* GERBANG PILIHAN LOGIN AWAL (HANYA MUNCUL SAAT BELUM LOGIN!) */}
        {authenticatedRole === null && (
          <div className="mx-auto mb-5 max-w-md rounded-2xl border border-sky-500/25 bg-[#0a1f38]/95 p-3.5 shadow-xl shadow-black/40">
            <p className="mb-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-sky-300/90">
              Pilih Akses Masuk ORIENTRA
            </p>
            <div className="grid grid-cols-2 gap-2.5">
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
                Masuk Peserta
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
                Masuk Organizer
              </button>
            </div>
          </div>
        )}

        {currentRole === UserRole.PARTICIPANT ? (
          <ParticipantView
            onAuthenticated={handleParticipantAuthenticated}
            onLogout={handleLogoutToGate}
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
