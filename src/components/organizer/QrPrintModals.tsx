import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Printer } from 'lucide-react';
import { Course } from '../../types';

export interface PrintableQrItem {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  payload: string;
}

export function QrCardModal({
  title,
  subtitle,
  payload,
  onClose,
}: {
  title: string;
  subtitle: string;
  payload: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(payload, {
      width: 320,
      margin: 2,
      color: { dark: '#090d16', light: '#ffffff' },
    })
      .then((url) => setDataUrl(url))
      .catch(() => setDataUrl(''));
  }, [payload]);

  function handleCopy() {
    navigator.clipboard?.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadPng() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `QR-${title.replace(/\s+/g, '-')}.png`;
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              BARAKA ADVENTURE — QR Resmi
            </span>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            Tutup
          </button>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl bg-white p-4">
          {dataUrl ? (
            <img src={dataUrl} alt={title} className="h-56 w-56 object-contain" />
          ) : (
            <div className="h-56 w-56 flex items-center justify-center text-xs text-slate-500">
              Membuat QR Code...
            </div>
          )}
          <span className="mt-2 font-mono text-[11px] text-slate-700 break-all text-center">
            {payload}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Tersalin!' : 'Salin Kode Teks'}
          </button>
          <button
            type="button"
            onClick={handleDownloadPng}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh Gambar PNG
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * MODAL PRINT QR CODE MASSAL (OPSI 2 HINGGA 8 QR PER PAGE)
 */
export function BulkQrPrintModal({
  course,
  onClose,
}: {
  course: Course;
  onClose: () => void;
}) {
  const [qrPerPage, setQrPerPage] = useState<number>(4);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);

  const allItems: PrintableQrItem[] = useMemo(() => {
    const durationNote =
      course.durationMinutes && course.durationMinutes > 0
        ? ` • Durasi: ${course.durationMinutes} Menit${
            course.overtimePenaltyEnabled && course.overtimePenaltyPointsPerMinute
              ? ` (Penalti -${course.overtimePenaltyPointsPerMinute} pts/mnt)`
              : ''
          }`
        : '';

    return [
      {
        id: 'setup',
        badge: 'WAJIB SEBELUM MULAI',
        title: 'SETUP QR CODE',
        subtitle: `Course: ${course.name}${durationNote}`,
        payload: course.setupQrCode,
      },
      {
        id: 'start',
        badge: 'GARIS START',
        title: 'START QR CODE',
        subtitle: `Course: ${course.name}${durationNote}`,
        payload: course.startQrCode,
      },
      ...course.checkpoints.map((cp) => ({
        id: cp.id,
        badge: `CHECKPOINT #${cp.orderIndex}`,
        title: cp.name ? `${cp.code} — ${cp.name}` : cp.code,
        subtitle: `Radius GPS: ${cp.radiusMeters}m • Poin: ${cp.points}`,
        payload: cp.qrSecret,
      })),
      {
        id: 'finish',
        badge: 'GARIS FINISH',
        title: 'FINISH QR CODE',
        subtitle: `Course: ${course.name}`,
        payload: course.finishQrCode,
      },
    ];
  }, [course]);

  useEffect(() => {
    let mounted = true;
    async function generateAll() {
      const map: Record<string, string> = {};
      for (const item of allItems) {
        try {
          map[item.id] = await QRCode.toDataURL(item.payload, {
            width: 300,
            margin: 2,
            color: { dark: '#090d16', light: '#ffffff' },
          });
        } catch {
          map[item.id] = '';
        }
      }
      if (mounted) setQrImages(map);
    }
    generateAll();
    return () => {
      mounted = false;
    };
  }, [allItems]);

  const pages = useMemo(() => {
    const chunked: PrintableQrItem[][] = [];
    for (let i = 0; i < allItems.length; i += qrPerPage) {
      chunked.push(allItems.slice(i, i + qrPerPage));
    }
    return chunked;
  }, [allItems, qrPerPage]);

  async function handleDownloadPagePng(pageItems: PrintableQrItem[], pageIndex: number) {
    setIsGeneratingSheet(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#090d16';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('BARAKA ADVENTURE — LEMBAR CETAK QR CODE', 60, 60);
      ctx.fillStyle = '#475569';
      ctx.font = '20px sans-serif';
      ctx.fillText(
        `Course: ${course.name} (${course.locationName} • ${course.date}) — Hal ${
          pageIndex + 1
        }/${pages.length} (${qrPerPage} QR/Page)`,
        60,
        95
      );

      const cols = qrPerPage === 2 ? 1 : 2;
      const rows = Math.ceil(qrPerPage / cols);
      const gridTop = 130;
      const gridWidth = canvas.width - 120;
      const gridHeight = canvas.height - 180;
      const cellW = gridWidth / cols;
      const cellH = gridHeight / rows;

      for (let idx = 0; idx < pageItems.length; idx++) {
        const item = pageItems[idx];
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = 60 + col * cellW;
        const y = gridTop + row * cellH;

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(x + 10, y + 10, cellW - 20, cellH - 20);
        ctx.setLineDash([]);

        ctx.fillStyle = '#059669';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(item.badge, x + 30, y + 48);

        ctx.fillStyle = '#090d16';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(item.title.slice(0, 34), x + 30, y + 80);

        ctx.fillStyle = '#475569';
        ctx.font = '16px sans-serif';
        ctx.fillText(item.subtitle.slice(0, 48), x + 30, y + 106);

        const qrDataUrl = qrImages[item.id];
        if (qrDataUrl) {
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = qrDataUrl;
          });
          const qrSize = Math.min(cellW - 80, cellH - 170, 320);
          const qrX = x + (cellW - qrSize) / 2;
          const qrY = y + 120;
          ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

          ctx.fillStyle = '#334155';
          ctx.font = '14px monospace';
          ctx.fillText(item.payload, x + 30, qrY + qrSize + 24);
        }
      }

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `Lembar-QR-${course.id}-Hal-${pageIndex + 1}-(${qrPerPage}perPage).png`;
      a.click();
    } finally {
      setIsGeneratingSheet(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
      <div className="mx-auto max-w-5xl rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Print QR Code Massal (2 s/d 8 QR per Halaman)
            </span>
            <h3 className="text-lg font-bold text-white">{course.name}</h3>
            <p className="text-xs text-slate-400">
              Total {allItems.length} QR Code (Setup + Start + {course.checkpoints.length} Checkpoint + Finish) terbagi menjadi {pages.length} halaman.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs">
              <span className="text-slate-300 font-medium">Jumlah QR per Page:</span>
              <select
                value={qrPerPage}
                onChange={(e) => setQrPerPage(Number(e.target.value))}
                className="rounded bg-slate-800 px-2 py-1 font-bold text-emerald-300 focus:outline-none"
              >
                <option value={2}>2 QR / Halaman (Besar)</option>
                <option value={3}>3 QR / Halaman</option>
                <option value={4}>4 QR / Halaman (Grid 2x2)</option>
                <option value={5}>5 QR / Halaman</option>
                <option value={6}>6 QR / Halaman (Grid 2x3)</option>
                <option value={7}>7 QR / Halaman</option>
                <option value={8}>8 QR / Halaman (Grid 2x4)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <Printer className="h-4 w-4" />
              Print Semua Halaman
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Tutup
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {pages.map((pageItems, pageIndex) => (
            <div
              key={pageIndex}
              className="rounded-xl border border-slate-700 bg-white p-6 text-slate-900 space-y-4 shadow"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    BARAKA ADVENTURE — LEMBAR QR RESMI (HALAMAN {pageIndex + 1} DARI {pages.length})
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {course.name} • {course.locationName} ({course.date}) — Opsi: {qrPerPage} QR / Page
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isGeneratingSheet}
                  onClick={() => handleDownloadPagePng(pageItems, pageIndex)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh Halaman {pageIndex + 1} (PNG A4)
                </button>
              </div>

              <div
                className={`grid gap-4 ${
                  qrPerPage <= 4
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-4'
                }`}
              >
                {pageItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col items-center justify-between rounded-xl border-2 border-dashed border-slate-300 p-4 text-center"
                  >
                    <div className="w-full">
                      <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {item.badge}
                      </span>
                      <h4 className="mt-1 text-sm font-extrabold text-slate-900">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-600">{item.subtitle}</p>
                    </div>

                    {qrImages[item.id] ? (
                      <img
                        src={qrImages[item.id]}
                        alt={item.title}
                        className={`my-2 object-contain ${
                          qrPerPage <= 2
                            ? 'h-52 w-52'
                            : qrPerPage <= 4
                            ? 'h-40 w-40'
                            : 'h-28 w-28'
                        }`}
                      />
                    ) : (
                      <div className="my-4 text-xs text-slate-400">Memuat QR...</div>
                    )}

                    <div className="w-full border-t border-slate-200 pt-1.5 font-mono text-[10px] text-slate-600 break-all">
                      {item.payload}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
