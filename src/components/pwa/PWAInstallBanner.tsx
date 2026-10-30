import React, { useState } from 'react';
import { Smartphone, Download, ShieldCheck, X, Info } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('baraka_pwa_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [showGuideModal, setShowGuideModal] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('baraka_pwa_banner_dismissed', '1');
    } catch {
      // Abaikan
    }
  };

  // Jika sudah dibuka dari Ikon Layar Utama (Mode Standalone), tampilkan badge kecil bahwa mode layar penuh aktif
  if (isInstalled) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-2 flex items-center justify-between text-xs text-emerald-300">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>
            <strong>Mode Ikon Layar HP Aktif:</strong> Layar penuh tanpa tombol tutup tab &amp; tahan offline.
          </span>
        </div>
      </div>
    );
  }

  if (dismissed) {
    return null;
  }

  return (
    <>
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mt-0.5">
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">
                Pengaman Offline Browser Aktif Otomatis
              </span>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                Tanpa Install APK
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Sesi, timer &amp; pos otomatis tersimpan di browser ini (jangan gunakan Mode Incognito). Opsional: pasang ikon jalan pintas di layar HP agar lebih mudah dibuka kembali.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isInstallable ? (
            <button
              type="button"
              onClick={install}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              <Download className="h-3.5 w-3.5" />
              Pasang Ikon di HP (Opsional)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition"
            >
              <Info className="h-3.5 w-3.5" />
              {isIOS ? 'Cara Pasang Ikon di iPhone' : 'Cara Pasang Ikon di HP'}
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Sembunyikan info ini"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Opsional &amp; Sangat Ringan (&lt; 1 MB)
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Pasang Ikon BARAKA di Layar Depan HP
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                Tutup
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside">
                <li>
                  Ketuk tombol <strong>Bagikan (Share)</strong> di bagian bawah browser Safari.
                </li>
                <li>
                  Geser ke bawah lalu pilih{' '}
                  <strong className="text-emerald-300">
                    Tambah ke Layar Utama (Add to Home Screen)
                  </strong>
                  .
                </li>
                <li>
                  Ketuk <strong>Tambah (Add)</strong> di pojok kanan atas.
                </li>
              </ol>
            ) : (
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside">
                <li>
                  Ketuk ikon <strong>Menu Titik Tiga (⋮)</strong> di pojok kanan atas browser Chrome.
                </li>
                <li>
                  Pilih{' '}
                  <strong className="text-emerald-300">
                    Tambahkan ke Layar Utama (Add to Home screen / Install App)
                  </strong>
                  .
                </li>
                <li>
                  Ikon <strong>BARAKA</strong> langsung muncul di layar HP Anda tanpa perlu download dari Play Store.
                </li>
              </ol>
            )}

            <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-[11px] text-slate-400">
              <strong>Catatan:</strong> Langkah ini 100% opsional. Jika Anda langsung memakai browser biasa tanpa memasang ikon, fitur penyimpanan sesi otomatis &amp; antrean offline tetap aktif penuh.
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
