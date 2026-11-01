/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { Compass, Shield, Smartphone } from 'lucide-react';
import OrganizerDashboard from './components/organizer/OrganizerDashboard';
import ParticipantView from './components/participant/ParticipantView';
import { loadPersistedParticipantState } from './services/offlineQueue';
import { UserRole } from './types';

const ORG_TOKEN_STORAGE_KEY = 'baraka_organizer_token';

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
  const [authenticatedRole, setAuthenticatedRole] = useState<UserRole | null>(
    () => detectInitialAuthenticatedRole()
  );
  const [loginRoleChoice, setLoginRoleChoice] = useState<UserRole>(
    UserRole.PARTICIPANT
  );

  const handleParticipantAuthenticated = useCallback(() => {
    setAuthenticatedRole(UserRole.PARTICIPANT);
  }, []);

  const handleOrganizerAuthenticated = useCallback(() => {
    setAuthenticatedRole(UserRole.ORGANIZER);
  }, []);

  const handleLogoutToGate = useCallback(() => {
    setAuthenticatedRole(null);
  }, []);

  const currentRole = authenticatedRole ?? loginRoleChoice;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* HEADER UTAMA BARAKA ADVENTURE (TANPA TOMBOL PINDAH DASHBOARD SETELAH LOGIN) */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white sm:text-base">
                BARAKA ADVENTURE
              </h1>
              <p className="text-[11px] text-slate-400">
                Digital Orienteering &amp; Amazing Race Platform
              </p>
            </div>
          </div>

          {/* Indikator Peran Aktif (Hanya teks status, bukan tombol pindah dashboard) */}
          {authenticatedRole === UserRole.PARTICIPANT && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Smartphone className="h-3.5 w-3.5" />
              Mode Peserta
            </span>
          )}
          {authenticatedRole === UserRole.ORGANIZER && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              <Shield className="h-3.5 w-3.5" />
              Dashboard Organizer
            </span>
          )}
        </div>
      </header>

      {/* KONTEN UTAMA */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* GERBANG PILIHAN LOGIN AWAL (HANYA MUNCUL SAAT BELUM LOGIN!) */}
        {authenticatedRole === null && (
          <div className="mx-auto mb-5 max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-3 shadow-xl">
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Pilih Akses Masuk Aplikasi
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLoginRoleChoice(UserRole.PARTICIPANT)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                  loginRoleChoice === UserRole.PARTICIPANT
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Smartphone className="h-4 w-4" />
                Masuk Peserta
              </button>
              <button
                type="button"
                onClick={() => setLoginRoleChoice(UserRole.ORGANIZER)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                  loginRoleChoice === UserRole.ORGANIZER
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/50'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
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
