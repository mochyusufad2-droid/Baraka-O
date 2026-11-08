import React, { useState } from 'react';
import {
  X,
  Shield,
  Layers,
  Calendar,
  Infinity,
  Check,
  AlertTriangle,
  Lock,
  Clock,
  Sparkles,
} from 'lucide-react';
import { OrganizerPublic } from '../../types';

interface EditOrganizerQuotaModalProps {
  organizer: OrganizerPublic;
  token: string;
  onClose: () => void;
  onSuccess: (updatedOrg?: OrganizerPublic) => Promise<void>;
}

export function EditOrganizerQuotaModal({
  organizer,
  token,
  onClose,
  onSuccess,
}: EditOrganizerQuotaModalProps) {
  const [isUnlimited, setIsUnlimited] = useState<boolean>(
    organizer.maxCourses === null || organizer.maxCourses === undefined
  );
  const [maxCoursesInput, setMaxCoursesInput] = useState<string>(
    organizer.maxCourses !== null && organizer.maxCourses !== undefined
      ? String(organizer.maxCourses)
      : '3'
  );

  // Duration option: 'keep' | '1' | '3' | '6' | '9' | '12' | 'lifetime' | 'custom'
  const [durationChoice, setDurationChoice] = useState<string>('keep');
  const [customDate, setCustomDate] = useState<string>(
    organizer.expiresAt ? organizer.expiresAt.slice(0, 10) : ''
  );
  const [newPin, setNewPin] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(organizer.isActive !== false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hitung pratinjau tanggal baru berdasarkan pilihan
  const previewExpiresText = (() => {
    if (durationChoice === 'lifetime') {
      return '♾️ Lifetime (Selamanya / Tanpa Batas Waktu)';
    }
    if (durationChoice === 'custom') {
      return customDate
        ? `📅 Berlaku hingga: ${new Date(customDate).toLocaleDateString('id-ID', { dateStyle: 'long' })}`
        : 'Pilih tanggal kustom di bawah';
    }
    if (durationChoice === 'keep') {
      if (!organizer.expiresAt) return '♾️ Lifetime (Selamanya)';
      const isExp = new Date(organizer.expiresAt).getTime() < Date.now();
      return `${isExp ? '⚠️ Sudah Expired pada: ' : '📅 Berlaku hingga: '} ${new Date(
        organizer.expiresAt
      ).toLocaleDateString('id-ID', { dateStyle: 'long' })}`;
    }
    const months = Number(durationChoice);
    if (!Number.isNaN(months) && months > 0) {
      // Jika akun masih aktif, perpanjang dari tanggal expired lama, jika sudah expired/lifetime, tambah dari hari ini
      const baseDate =
        organizer.expiresAt && new Date(organizer.expiresAt).getTime() > Date.now()
          ? new Date(organizer.expiresAt)
          : new Date();
      baseDate.setMonth(baseDate.getMonth() + months);
      return `📅 Diperpanjang hingga: ${baseDate.toLocaleDateString('id-ID', {
        dateStyle: 'long',
      })}`;
    }
    return '';
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const payload: Record<string, any> = {
        isActive,
      };

      // 1. Quota Course
      if (isUnlimited) {
        payload.maxCourses = null;
      } else {
        const num = Number(maxCoursesInput);
        if (Number.isNaN(num) || num <= 0) {
          setErrorMsg('Jatah course harus berupa angka minimal 1.');
          setIsLoading(false);
          return;
        }
        payload.maxCourses = Math.max(1, Math.round(num));
      }

      // 2. Expiration
      if (durationChoice === 'lifetime') {
        payload.durationMonths = 'lifetime';
      } else if (durationChoice === 'custom') {
        if (!customDate) {
          setErrorMsg('Silakan pilih tanggal kadaluarsa kustom.');
          setIsLoading(false);
          return;
        }
        payload.expiresAt = new Date(customDate).toISOString();
      } else if (durationChoice !== 'keep') {
        payload.durationMonths = Number(durationChoice);
      }

      // 3. New Password (optional)
      if (newPin.trim()) {
        if (newPin.trim().length < 6) {
          setErrorMsg('Password baru minimal 6 karakter (huruf/angka/simbol).');
          setIsLoading(false);
          return;
        }
        payload.newPassword = newPin.trim();
        payload.newPin = newPin.trim();
      }

      const res = await fetch(`/api/organizer/accounts/${organizer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menyimpan perubahan organizer.');
        setIsLoading(false);
        return;
      }

      await onSuccess(data.organizer);
      onClose();
    } catch {
      setErrorMsg('Kesalahan jaringan saat menyimpan perubahan.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-purple-500/40 bg-slate-900 p-5 sm:p-6 text-slate-100 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Tombol Tutup */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Modal */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400">
              Otoritas Superadmin
            </span>
            <h2 className="text-base font-bold text-white">
              Kelola Jatah Kuota &amp; Masa Aktif Organizer
            </h2>
            <p className="text-xs text-slate-400">
              {organizer.name} ({organizer.code} • @{organizer.username})
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* BAGIAN 1: JATAH KUOTA COURSE */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                Jatah Kuota Pembuatan Course
              </label>
              <label className="flex items-center gap-1.5 text-xs text-emerald-400 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={isUnlimited}
                  onChange={(e) => setIsUnlimited(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5"
                />
                Tak Terbatas (Unlimited)
              </label>
            </div>

            {!isUnlimited ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required={!isUnlimited}
                    value={maxCoursesInput}
                    onChange={(e) => setMaxCoursesInput(e.target.value)}
                    placeholder="Contoh: 1, 2, 3, 5"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-purple-400"
                  />
                  <span className="text-slate-400 shrink-0 font-medium">Course</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Organizer hanya dapat membuat course sebanyak angka ini.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-[11px] text-emerald-300 flex items-center gap-2">
                <Infinity className="w-4 h-4" />
                <span>Akun ini bebas membuat Course sebanyak apa pun tanpa batasan kuota.</span>
              </div>
            )}
          </div>

          {/* BAGIAN 2: MASA AKTIF AKUN (EXPIRED DATE) */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2.5">
            <label className="font-bold text-slate-200 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              Masa Aktif Akun (Expired)
            </label>

            {/* Pilihan Cepat Durasi */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                { id: 'keep', label: 'Tetap' },
                { id: '1', label: '+1 Bulan' },
                { id: '3', label: '+3 Bulan' },
                { id: '6', label: '+6 Bulan' },
                { id: '9', label: '+9 Bulan' },
                { id: '12', label: '+1 Tahun' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDurationChoice(opt.id)}
                  className={`py-1.5 px-2 rounded-lg text-center font-semibold transition cursor-pointer border ${
                    durationChoice === opt.id
                      ? 'bg-purple-600 text-white border-purple-500 shadow'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDurationChoice('lifetime')}
                className={`py-2 px-3 rounded-lg text-center font-semibold transition cursor-pointer border flex items-center justify-center gap-1.5 ${
                  durationChoice === 'lifetime'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                    : 'bg-slate-900 text-emerald-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Infinity className="w-4 h-4" />
                Lifetime (Selamanya)
              </button>

              <button
                type="button"
                onClick={() => setDurationChoice('custom')}
                className={`py-2 px-3 rounded-lg text-center font-semibold transition cursor-pointer border flex items-center justify-center gap-1.5 ${
                  durationChoice === 'custom'
                    ? 'bg-sky-600 text-white border-sky-500 shadow'
                    : 'bg-slate-900 text-sky-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Calendar className="w-4 h-4" />
                Pilih Tanggal Manual
              </button>
            </div>

            {durationChoice === 'custom' && (
              <div className="pt-1.5">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-purple-400"
                />
              </div>
            )}

            {/* Pratinjau Tanggal Expired */}
            <div className="rounded-lg bg-slate-900 p-2.5 border border-slate-800 text-[11px] font-mono flex items-center justify-between text-slate-300">
              <span>Status Masa Aktif:</span>
              <strong className="text-purple-300">{previewExpiresText}</strong>
            </div>
          </div>

          {/* BAGIAN 3: STATUS AKTIF / BEKUKAN & RESET PIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
              <label className="font-bold text-slate-200">Status Akses Akun</label>
              <select
                value={isActive ? 'true' : 'false'}
                onChange={(e) => setIsActive(e.target.value === 'true')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-medium focus:outline-none focus:border-purple-400"
              >
                <option value="true">✅ Akun Aktif (Bisa Login)</option>
                <option value="false">⛔ Dibekukan (Tidak Bisa Login)</option>
              </select>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
              <label className="font-bold text-slate-200 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-400" /> Reset Password (Opsional)
              </label>
              <input
                type="text"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="Minimal 6 karakter (kosongkan jika tidak diganti)"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-purple-600/20"
            >
              {isLoading ? (
                'Menyimpan Perubahan...'
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Simpan Kuota &amp; Masa Aktif
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
