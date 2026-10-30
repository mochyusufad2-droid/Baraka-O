/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Compass, LayoutDashboard, Smartphone } from 'lucide-react';
import OrganizerDashboard from './components/organizer/OrganizerDashboard';
import ParticipantView from './components/participant/ParticipantView';
import { UserRole } from './types';

export default function App() {
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.PARTICIPANT);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* HEADER NAVIGASI BARAKA ADVENTURE */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white sm:text-base">
                BARAKA ADVENTURE
              </h1>
              <p className="text-[11px] text-slate-400">
                Digital Orienteering & Amazing Race Platform
              </p>
            </div>
          </div>

          {/* PEMILIH PERAN PENGGUNA (HANYA 2 PERAN SESUAI SPESIFIKASI: PARTICIPANT & ORGANIZER) */}
          <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setActiveRole(UserRole.PARTICIPANT)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeRole === UserRole.PARTICIPANT
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Aplikasi Peserta
            </button>
            <button
              type="button"
              onClick={() => setActiveRole(UserRole.ORGANIZER)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeRole === UserRole.ORGANIZER
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard Organizer
            </button>
          </div>
        </div>
      </header>

      {/* KONTEN UTAMA */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {activeRole === UserRole.PARTICIPANT ? (
          <ParticipantView />
        ) : (
          <OrganizerDashboard />
        )}
      </main>
    </div>
  );
}
