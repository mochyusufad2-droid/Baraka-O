import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Radio,
  Copy,
  Check,
  ExternalLink,
  Download,
  ShieldCheck,
  Zap,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Course } from '../../types';

interface ShareSpectatorLiveModalProps {
  course: Course;
  onClose: () => void;
}

export function ShareSpectatorLiveModal({
  course,
  onClose,
}: ShareSpectatorLiveModalProps) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const liveUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}?live=true&course=${encodeURIComponent(course.id)}`
      : `?live=true&course=${course.id}`;

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(liveUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0284c7', // Sky-600
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Gagal generate QR Code link penonton:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [liveUrl]);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(liveUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = liveUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `QR_LiveScore_${course.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-sky-500/30 bg-slate-900 p-5 sm:p-6 text-slate-100 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div className="min-w-0 pr-8">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400">
              Live Spectator Portal
            </span>
            <h2 className="text-base font-bold text-white truncate">
              Link Live Leaderboard Penonton
            </h2>
            <p className="text-xs text-slate-400 truncate">{course.name}</p>
          </div>
        </div>

        {/* Kotak Link URL & Salin */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            Tautan Khusus Penonton (Bebas Akses Tanpa Login):
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-slate-950 p-2">
            <input
              type="text"
              readOnly
              value={liveUrl}
              className="w-full bg-transparent px-2 text-xs font-mono text-sky-300 focus:outline-none select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                copied
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Salin Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Area QR Code untuk Di-scan Penonton / Dipasang di Layar Arena */}
        <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex flex-col items-center shrink-0">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Link Live ${course.name}`}
                className="h-36 w-36 rounded-lg bg-white p-2 shadow-md"
              />
            ) : (
              <div className="h-36 w-36 animate-pulse rounded-lg bg-slate-800 flex items-center justify-center text-xs text-slate-500">
                Membuat QR...
              </div>
            )}
            <button
              type="button"
              onClick={handleDownloadQr}
              disabled={!qrDataUrl}
              className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh QR (PNG)
            </button>
          </div>

          <div className="space-y-2 text-xs text-slate-300 flex-1">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Kemudahan untuk Penonton
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              QR Code ini dapat langsung di-scan menggunakan kamera smartphone
              penonton, dicetak pada banner arena, atau ditampilkan pada monitor
              proyektor / TV di lokasi perlombaan.
            </p>
            <div className="pt-1">
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                Buka Pratinjau Layar Penonton
              </a>
            </div>
          </div>
        </div>

        {/* Keunggulan & Jaminan Privasi */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-emerald-300">Privasi Peserta Terlindungi</p>
              <p className="text-slate-400">
                Hanya menampilkan Nama Tim, Pos terlewati &amp; skor. Nama pendaftar &amp; nomor telepon dirahasiakan.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">Auto-Refresh Cepat</p>
              <p className="text-slate-400">
                Peringkat diperbarui otomatis setiap 5 detik secara hemat kuota &amp; bandwidth.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 sm:col-span-2">
            <Layers className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sky-300">Mendukung Multi-Course Serentak</p>
              <p className="text-slate-400">
                Setiap Course memiliki ID unik. Ribuan penonton dari berbagai organizer dapat memantau lomba masing-masing secara bersamaan tanpa tertukar.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Tombol Tutup */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-white transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
