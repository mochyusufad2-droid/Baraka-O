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

  if (isInstalled || dismissed) {
    return null;
  }

  return (
    <>
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 shadow-sm flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-slate-200 font-medium truncate">
            Mode Offline Aktif
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isInstallable ? (
            <button
              type="button"
              onClick={install}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 transition cursor-pointer"
            >
              <Download className="h-3 w-3" />
              <span>+ Ikon HP</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition cursor-pointer"
            >
              <Info className="h-3 w-3" />
              <span>+ Ikon HP</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
            title="Sembunyikan"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-white">
                Pasang Ikon ORIENTRA di HP
              </h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                Tutup
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-1.5 text-xs text-slate-300 list-decimal list-inside">
                <li>Ketuk tombol <strong>Share</strong> di browser Safari.</li>
                <li>Pilih <strong className="text-sky-300">Add to Home Screen</strong>.</li>
                <li>Ketuk <strong>Add</strong>.</li>
              </ol>
            ) : (
              <ol className="space-y-1.5 text-xs text-slate-300 list-decimal list-inside">
                <li>Ketuk menu <strong>Titik Tiga (⋮)</strong> di pojok kanan atas Chrome.</li>
                <li>Pilih <strong className="text-sky-300">Tambahkan ke Layar Utama / Install App</strong>.</li>
              </ol>
            )}

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
