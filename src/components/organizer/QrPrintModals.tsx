import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, FileText, Printer, RefreshCw } from 'lucide-react';
import { Course, ValidationMethod } from '../../types';

export interface PrintableQrItem {
  id: string;
  type: 'SETUP' | 'START' | 'CP' | 'FINISH';
  badge: string;
  title: string;
  subtitle: string;
  payload: string;
}

/**
 * Menggabungkan satu atau beberapa HTMLCanvasElement (A4 Portrait) menjadi 1 file PDF standar (PDF 1.4)
 * tanpa ketergantungan library eksternal, bekerja 100% offline.
 */
function buildMultiPagePdfFromCanvases(canvases: HTMLCanvasElement[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let currentOffset = 0;

  function pushString(str: string) {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  function pushBytes(bytes: Uint8Array) {
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  function dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const pageCount = canvases.length;
  const totalObjects = 2 + pageCount * 3;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  // Header PDF 1.4
  pushString('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Object 1: Catalog
  offsets[1] = currentOffset;
  pushString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  const kidsRefs: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    kidsRefs.push(`${3 + i * 3} 0 R`);
  }
  offsets[2] = currentOffset;
  pushString(
    `2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs.join(' ')} ] /Count ${pageCount} >>\nendobj\n`
  );

  // Ukuran A4 dalam satuan points PDF (72 pt/inch): 595.28 x 841.89
  const pageWidthPt = 595.28;
  const pageHeightPt = 841.89;

  for (let i = 0; i < pageCount; i++) {
    const canvas = canvases[i];
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;
    const imgName = `/Im${i + 1}`;

    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const jpegBytes = dataUrlToUint8Array(jpegDataUrl);

    // Page Object
    offsets[pageObjId] = currentOffset;
    pushString(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${pageWidthPt} ${pageHeightPt} ] /Resources << /XObject << ${imgName} ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // Content Stream Object (menggambar gambar penuh 1 halaman A4)
    const contentStream = `q ${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm ${imgName} Do Q`;
    offsets[contentObjId] = currentOffset;
    pushString(
      `${contentObjId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`
    );

    // Image XObject (DCTDecode / JPEG)
    offsets[imageObjId] = currentOffset;
    pushString(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    );
    pushBytes(jpegBytes);
    pushString('\nendstream\nendobj\n');
  }

  // Tabel XREF
  const xrefOffset = currentOffset;
  pushString(`xref\n0 ${totalObjects + 1}\n`);
  pushString('0000000000 65535 f \n');
  for (let objId = 1; objId <= totalObjects; objId++) {
    const offStr = String(offsets[objId]).padStart(10, '0');
    pushString(`${offStr} 00000 n \n`);
  }

  // Trailer
  pushString(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const mergedBuffer = new ArrayBuffer(currentOffset);
  const mergedView = new Uint8Array(mergedBuffer);
  let writePos = 0;
  for (const chunk of chunks) {
    mergedView.set(chunk, writePos);
    writePos += chunk.length;
  }

  return new Blob([mergedBuffer], { type: 'application/pdf' });
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
 * MODAL PRINT QR CODE MASSAL (OPSI 2 HINGGA 8 QR PER PAGE + UNDUH 1 FILE PDF MULTI-HALAMAN)
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
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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
        type: 'SETUP',
        badge: 'WAJIB SEBELUM MULAI',
        title: 'SETUP QR CODE',
        subtitle: `Course: ${course.name}${durationNote}`,
        payload: course.setupQrCode,
      },
      {
        id: 'start',
        type: 'START',
        badge: 'GARIS START',
        title: 'START QR CODE',
        subtitle: `Course: ${course.name}${durationNote}`,
        payload: course.startQrCode,
      },
      ...course.checkpoints.map((cp) => ({
        id: cp.id,
        type: 'CP' as const,
        badge: `CHECKPOINT #${cp.orderIndex}`,
        title: cp.name ? `${cp.code} — ${cp.name}` : cp.code,
        subtitle: `Radius GPS: ${cp.radiusMeters}m • Poin: ${cp.points}`,
        payload: cp.qrSecret,
      })),
      {
        id: 'finish',
        type: 'FINISH',
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
            width: 360,
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

  async function renderPageToCanvas(
    pageItems: PrintableQrItem[],
    pageIndex: number
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header Lembar A4
    ctx.textAlign = 'left';
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(
      `BARAKA ADVENTURE — LEMBAR QR RESMI (HALAMAN ${pageIndex + 1} DARI ${pages.length})`,
      50,
      52
    );

    ctx.fillStyle = '#090d16';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(
      `${course.name} • ${course.locationName} (${course.date})`,
      50,
      86
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`Opsi: ${qrPerPage} QR / Halaman`, canvas.width - 50, 86);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 104);
    ctx.lineTo(canvas.width - 50, 104);
    ctx.stroke();

    const cols = qrPerPage === 2 ? 1 : 2;
    const rows = Math.ceil(qrPerPage / cols);
    const gridTop = 120;
    const gridWidth = canvas.width - 100;
    const gridHeight = canvas.height - 165;
    const cellW = gridWidth / cols;
    const cellH = gridHeight / rows;

    for (let idx = 0; idx < pageItems.length; idx++) {
      const item = pageItems[idx];
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = 50 + col * cellW;
      const y = gridTop + row * cellH;
      const centerX = x + cellW / 2;

      // Peroleh warna tema berdasarkan jenis QR Code
      const badgeColor =
        item.type === 'SETUP'
          ? '#d97706' // Amber/Ungu Emas
          : item.type === 'START'
          ? '#059669' // Emerald Green
          : item.type === 'FINISH'
          ? '#dc2626' // Crimson Red
          : '#0284c7'; // Sky/Teal Blue untuk Checkpoint

      const strokeColor =
        item.type === 'SETUP'
          ? '#f59e0b'
          : item.type === 'START'
          ? '#10b981'
          : item.type === 'FINISH'
          ? '#ef4444'
          : '#0369a1';

      // Kotak garis potong putus-putus
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x + 8, y + 8, cellW - 16, cellH - 16);
      ctx.setLineDash([]);

      ctx.textAlign = 'center';

      // Badge kategori
      ctx.fillStyle = badgeColor;
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(item.badge, centerX, y + 38);

      // Judul Pos / QR
      ctx.fillStyle = '#090d16';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(item.title.slice(0, 38), centerX, y + 66);

      // Subjudul
      ctx.fillStyle = '#475569';
      ctx.font = '15px sans-serif';
      ctx.fillText(item.subtitle.slice(0, 54), centerX, y + 90);

      let qrDataUrl = qrImages[item.id];
      if (!qrDataUrl) {
        try {
          qrDataUrl = await QRCode.toDataURL(item.payload, {
            width: 360,
            margin: 2,
            color: { dark: '#090d16', light: '#ffffff' },
          });
        } catch {
          qrDataUrl = '';
        }
      }

      if (qrDataUrl) {
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = qrDataUrl;
        });
        const availableH = Math.max(140, cellH - 120);
        const qrSize = Math.min(cellW - 70, availableH, 380);
        const qrX = x + (cellW - qrSize) / 2;
        const qrY = y + 98 + Math.max(0, (availableH - qrSize) / 2);
        ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
      }
    }

    ctx.textAlign = 'left';
    return canvas;
  }

  async function handleDownloadAllPdf() {
    if (pages.length === 0) return;
    setIsGeneratingPdf(true);
    try {
      const renderedCanvases: HTMLCanvasElement[] = [];
      for (let i = 0; i < pages.length; i++) {
        const canvas = await renderPageToCanvas(pages[i], i);
        renderedCanvases.push(canvas);
      }
      const pdfBlob = buildMultiPagePdfFromCanvases(renderedCanvases);
      const url = URL.createObjectURL(pdfBlob);
      const safeCourseName = course.name
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR-Massal-${safeCourseName || course.id}-${pages.length}Hal-(${qrPerPage}perPage).pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function handleDownloadPagePng(
    pageItems: PrintableQrItem[],
    pageIndex: number
  ) {
    setIsGeneratingSheet(true);
    try {
      const canvas = await renderPageToCanvas(pageItems, pageIndex);
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
              Print &amp; Unduh PDF QR Code Massal (2 s/d 8 QR per Halaman)
            </span>
            <h3 className="text-lg font-bold text-white">{course.name}</h3>
            <p className="text-xs text-slate-400">
              Total {allItems.length} QR Code (Setup + Start + {course.checkpoints.length} Checkpoint + Finish) terbagi menjadi{' '}
              <strong className="text-emerald-300">{pages.length} halaman A4</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs">
              <span className="text-slate-300 font-medium">Jumlah QR per Page:</span>
              <select
                value={qrPerPage}
                onChange={(e) => setQrPerPage(Number(e.target.value))}
                className="rounded bg-slate-800 px-2 py-1 font-bold text-emerald-300 focus:outline-none cursor-pointer"
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
              disabled={isGeneratingPdf || isGeneratingSheet}
              onClick={handleDownloadAllPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950/60 hover:bg-emerald-500 disabled:opacity-50 cursor-pointer transition"
            >
              {isGeneratingPdf ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Menyusun {pages.length} Hal PDF...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Unduh Semua ({pages.length} Hal • 1 File PDF)
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer transition"
            >
              <Printer className="h-4 w-4 text-emerald-400" />
              Print Langsung
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
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
                  disabled={isGeneratingSheet || isGeneratingPdf}
                  onClick={() => handleDownloadPagePng(pageItems, pageIndex)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh Halaman {pageIndex + 1} (PNG)
                </button>
              </div>

              <div
                className={`grid gap-4 ${
                  qrPerPage <= 4
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-4'
                }`}
              >
                {pageItems.map((item) => {
                  const borderClass =
                    item.type === 'SETUP'
                      ? 'border-amber-400 bg-amber-50/20'
                      : item.type === 'START'
                      ? 'border-emerald-500 bg-emerald-50/20'
                      : item.type === 'FINISH'
                      ? 'border-rose-500 bg-rose-50/20'
                      : 'border-sky-500 bg-sky-50/20';

                  const badgeClass =
                    item.type === 'SETUP'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : item.type === 'START'
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : item.type === 'FINISH'
                      ? 'bg-rose-100 text-rose-900 border border-rose-300'
                      : 'bg-sky-100 text-sky-900 border border-sky-300';

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col items-center justify-between rounded-xl border-2 border-dashed p-4 text-center ${borderClass}`}
                    >
                      <div className="w-full">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}
                        >
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
                              ? 'h-56 w-56'
                              : qrPerPage <= 4
                              ? 'h-44 w-44'
                              : 'h-32 w-32'
                          }`}
                        />
                      ) : (
                        <div className="my-4 text-xs text-slate-400">Memuat QR...</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * MODAL LEMBAR INFO COURSE (SPESIFIKASI COURSE + TABEL DAFTAR POS CHECKPOINT)
 */
export function CourseInfoSheetModal({
  course,
  onClose,
}: {
  course: Course;
  onClose: () => void;
}) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingPng, setIsGeneratingPng] = useState(false);

  const sortedCheckpoints = useMemo(() => {
    return [...course.checkpoints].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [course.checkpoints]);

  const totalPoints = useMemo(() => {
    return sortedCheckpoints.reduce((sum, cp) => sum + (Number(cp.points) || 0), 0);
  }, [sortedCheckpoints]);

  // Format informasi spesifikasi course
  const orderText =
    course.enforceOrder !== false
      ? 'Wajib Berurutan (CP1 → CP2 → dst.)'
      : 'Bebas / Acak (Score-O)';

  const durationText =
    course.durationMinutes && course.durationMinutes > 0
      ? `${course.durationMinutes} Menit`
      : 'Tanpa Batas Waktu';

  const validationText = (() => {
    switch (course.validationMethod) {
      case ValidationMethod.QR_ONLY:
        return 'QR Code Saja (QR_ONLY)';
      case ValidationMethod.GPS_AUTO:
        return 'GPS Otomatis (GPS_AUTO)';
      case ValidationMethod.QR_AND_GPS:
        return 'Wajib QR + GPS (QR_AND_GPS)';
      case ValidationMethod.QR_OR_GPS:
        return 'QR atau GPS (QR_OR_GPS)';
      default:
        return String(course.validationMethod);
    }
  })();

  const penaltyText =
    course.durationMinutes &&
    course.durationMinutes > 0 &&
    course.overtimePenaltyEnabled &&
    course.overtimePenaltyPointsPerMinute &&
    course.overtimePenaltyPointsPerMinute > 0
      ? `-${course.overtimePenaltyPointsPerMinute} Poin / Menit Keterlambatan`
      : 'Tidak Ada Penalti Waktu';

  const gpsRadiusText =
    course.validationMethod === ValidationMethod.QR_ONLY
      ? 'Tanpa Radius GPS'
      : `${course.defaultGpsRadiusMeters} Meter`;

  // Paginasi tabel jika jumlah CP sangat banyak (Halaman 1 maks 20 baris karena ada kotak spesifikasi di atas, halaman berikutnya 28 baris)
  const pages = useMemo(() => {
    if (sortedCheckpoints.length === 0) {
      return [[]];
    }
    const result: typeof sortedCheckpoints[] = [];
    const firstPageMax = 20;
    const nextPageMax = 28;

    result.push(sortedCheckpoints.slice(0, firstPageMax));
    let offset = firstPageMax;
    while (offset < sortedCheckpoints.length) {
      result.push(sortedCheckpoints.slice(offset, offset + nextPageMax));
      offset += nextPageMax;
    }
    return result;
  }, [sortedCheckpoints]);

  async function renderInfoPageToCanvas(
    pageCheckpoints: typeof sortedCheckpoints,
    pageIndex: number
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Latar belakang putih A4
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const marginX = 60;
    const contentW = canvas.width - marginX * 2;
    let cursorY = 60;

    // Header Dokumen
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(
      `LEMBAR INFORMASI COURSE & DAFTAR POS CHECKPOINT${
        pages.length > 1 ? ` (HALAMAN ${pageIndex + 1} DARI ${pages.length})` : ''
      }`,
      marginX,
      cursorY
    );

    cursorY += 36;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(course.name, marginX, cursorY);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 18px sans-serif';
    const locDateStr = course.locationName
      ? `${course.locationName} • ${course.date}`
      : course.date;
    ctx.fillText(locDateStr, canvas.width - marginX, cursorY);

    cursorY += 18;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginX, cursorY);
    ctx.lineTo(canvas.width - marginX, cursorY);
    ctx.stroke();

    cursorY += 24;

    // Kotak Spesifikasi Course (Ditampilkan penuh di Halaman 1, atau ringkas di halaman lanjutan)
    if (pageIndex === 0) {
      const boxH = 220;
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.fillRect(marginX, cursorY, contentW, boxH);
      ctx.strokeRect(marginX, cursorY, contentW, boxH);

      const specs = [
        {
          label: 'NAMA KEGIATAN / COURSE',
          value: `${course.name}${course.locationName ? ` (${course.locationName})` : ''}`,
        },
        {
          label: 'ATURAN URUTAN POS',
          value: orderText,
        },
        {
          label: 'DURASI LOMBA',
          value: durationText,
        },
        {
          label: 'METODE VALIDASI POS',
          value: validationText,
        },
        {
          label: 'INFO PENALTI POINT',
          value: penaltyText,
        },
        {
          label: 'RADIUS GPS',
          value: gpsRadiusText,
        },
      ];

      const colW = contentW / 2;
      const rowH = boxH / 3;

      specs.forEach((spec, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cellX = marginX + col * colW;
        const cellY = cursorY + row * rowH;

        // Garis pemisah grid dalam kotak
        if (row > 0) {
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cellX, cellY);
          ctx.lineTo(cellX + colW, cellY);
          ctx.stroke();
        }
        if (col === 1) {
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cellX, cellY);
          ctx.lineTo(cellX, cellY + rowH);
          ctx.stroke();
        }

        ctx.textAlign = 'left';
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(spec.label, cellX + 18, cellY + 26);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(spec.value.slice(0, 48), cellX + 18, cellY + 52);
      });

      cursorY += boxH + 32;
    }

    // Judul Tabel
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(
      `DAFTAR POS CHECKPOINT (${sortedCheckpoints.length} Pos • Total ${totalPoints} Poin)`,
      marginX,
      cursorY
    );

    cursorY += 16;

    // Konfigurasi Kolom Tabel: No. Urut | CP | Point CP | Keterangan
    const colWidths = [
      120, // Nomor Urut
      190, // CP
      180, // Point CP
      contentW - 120 - 190 - 180, // Keterangan
    ];
    const colX = [
      marginX,
      marginX + colWidths[0],
      marginX + colWidths[0] + colWidths[1],
      marginX + colWidths[0] + colWidths[1] + colWidths[2],
    ];

    const headerH = 44;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(marginX, cursorY, contentW, headerH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NO. URUT', colX[0] + colWidths[0] / 2, cursorY + 28);
    ctx.fillText('CP', colX[1] + colWidths[1] / 2, cursorY + 28);
    ctx.fillText('POINT CP', colX[2] + colWidths[2] / 2, cursorY + 28);
    ctx.textAlign = 'left';
    ctx.fillText('KETERANGAN / DESKRIPSI POS', colX[3] + 18, cursorY + 28);

    cursorY += headerH;

    const rowHeight = 44;

    if (pageCheckpoints.length === 0) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(marginX, cursorY, contentW, rowHeight * 2);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(marginX, cursorY, contentW, rowHeight * 2);
      ctx.fillStyle = '#64748b';
      ctx.font = 'italic 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Belum ada pos checkpoint yang ditambahkan pada course ini.',
        marginX + contentW / 2,
        cursorY + rowHeight + 6
      );
      cursorY += rowHeight * 2;
    } else {
      pageCheckpoints.forEach((cp, idx) => {
        // Zebra striping
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(marginX, cursorY, contentW, rowHeight);

        // Border baris dan kolom
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginX, cursorY, contentW, rowHeight);

        for (let c = 1; c < colX.length; c++) {
          ctx.beginPath();
          ctx.moveTo(colX[c], cursorY);
          ctx.lineTo(colX[c], cursorY + rowHeight);
          ctx.stroke();
        }

        const textY = cursorY + 28;

        // Kolom 1: Nomor Urut
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(cp.orderIndex), colX[0] + colWidths[0] / 2, textY);

        // Kolom 2: Kode CP
        ctx.fillStyle = '#0284c7';
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(cp.code, colX[1] + colWidths[1] / 2, textY);

        // Kolom 3: Point CP
        ctx.fillStyle = '#059669';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${cp.points} Poin`, colX[2] + colWidths[2] / 2, textY);

        // Kolom 4: Keterangan
        ctx.fillStyle = '#0f172a';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'left';
        const desc = cp.name && cp.name.trim() ? cp.name.trim() : '-';
        ctx.fillText(desc.slice(0, 58), colX[3] + 18, textY);

        cursorY += rowHeight;
      });
    }

    // Baris Total di halaman terakhir
    if (pageIndex === pages.length - 1 && sortedCheckpoints.length > 0) {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(marginX, cursorY, contentW, rowHeight);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(marginX, cursorY, contentW, rowHeight);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `TOTAL: ${sortedCheckpoints.length} POS`,
        colX[0] + (colWidths[0] + colWidths[1]) / 2,
        cursorY + 28
      );

      ctx.fillStyle = '#059669';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(
        `${totalPoints} Poin`,
        colX[2] + colWidths[2] / 2,
        cursorY + 28
      );

      ctx.fillStyle = '#475569';
      ctx.font = 'italic 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        course.enforceOrder !== false
          ? 'Pos wajib diambil secara berurutan sesuai nomor urut'
          : 'Pos dapat diambil secara acak / bebas (Score-O)',
        colX[3] + 18,
        cursorY + 28
      );
    }

    // Footer halaman
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText(
      `Dicetak dari Sistem Manajemen Orienteering • ${course.name} • Halaman ${
        pageIndex + 1
      } dari ${pages.length}`,
      canvas.width / 2,
      canvas.height - 32
    );

    ctx.textAlign = 'left';
    return canvas;
  }

  async function handleDownloadPdf() {
    setIsGeneratingPdf(true);
    try {
      const canvases: HTMLCanvasElement[] = [];
      for (let i = 0; i < pages.length; i++) {
        const c = await renderInfoPageToCanvas(pages[i], i);
        canvases.push(c);
      }
      const pdfBlob = buildMultiPagePdfFromCanvases(canvases);
      const url = URL.createObjectURL(pdfBlob);
      const safeName = course.name
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `Lembar-Info-Course-${safeName || course.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function handleDownloadPagePng(
    pageCheckpoints: typeof sortedCheckpoints,
    pageIndex: number
  ) {
    setIsGeneratingPng(true);
    try {
      const canvas = await renderInfoPageToCanvas(pageCheckpoints, pageIndex);
      const url = canvas.toDataURL('image/png');
      const safeName = course.name
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `Lembar-Info-Course-${safeName || course.id}-Hal-${pageIndex + 1}.png`;
      a.click();
    } finally {
      setIsGeneratingPng(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
      <div className="mx-auto max-w-5xl rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-5 shadow-2xl">
        {/* Top Action Bar Modal */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-400">
              Lembar Informasi Course &amp; Daftar Pos Checkpoint
            </span>
            <h3 className="text-lg font-bold text-white">{course.name}</h3>
            <p className="text-xs text-slate-400">
              Dokumen panduan teknis berisi spesifikasi aturan course dan tabel{' '}
              <strong className="text-teal-300">{sortedCheckpoints.length} pos checkpoint</strong>{' '}
              (Total <strong className="text-emerald-300">{totalPoints} Poin</strong>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isGeneratingPdf || isGeneratingPng}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-teal-950/60 hover:bg-teal-500 disabled:opacity-50 cursor-pointer transition"
            >
              {isGeneratingPdf ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Menyusun PDF...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Unduh PDF (A4)
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isGeneratingPdf || isGeneratingPng}
              onClick={() => handleDownloadPagePng(pages[0], 0)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer transition"
            >
              <Download className="h-4 w-4" />
              Unduh Gambar PNG
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer transition"
            >
              <Printer className="h-4 w-4 text-teal-400" />
              Print Langsung
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

        {/* Lembar Pratinjau A4 Putih */}
        <div className="space-y-6">
          {pages.map((pageCheckpoints, pageIndex) => (
            <div
              key={pageIndex}
              className="rounded-xl border border-slate-300 bg-white p-6 sm:p-8 text-slate-900 space-y-6 shadow-xl"
            >
              {/* Header Lembar Info Course */}
              <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-slate-200 pb-4">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-sky-700">
                    LEMBAR INFORMASI COURSE &amp; DAFTAR POS CHECKPOINT
                    {pages.length > 1 ? ` (HALAMAN ${pageIndex + 1} DARI ${pages.length})` : ''}
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 mt-0.5">
                    {course.name}
                  </h2>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-600">
                    {course.locationName ? `${course.locationName} • ${course.date}` : course.date}
                  </div>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      disabled={isGeneratingPng || isGeneratingPdf}
                      onClick={() => handleDownloadPagePng(pageCheckpoints, pageIndex)}
                      className="mt-1 inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <Download className="h-3 w-3" />
                      Unduh Hal {pageIndex + 1} (PNG)
                    </button>
                  )}
                </div>
              </div>

              {/* Bagian Atas: Kotak Spesifikasi Course (6 Poin Utama sesuai permintaan) */}
              {pageIndex === 0 && (
                <div className="rounded-xl border-2 border-slate-300 bg-slate-50 overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                    {/* Kolom Kiri */}
                    <div className="divide-y divide-slate-200">
                      <div className="p-3.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          1. Nama Kegiatan / Course
                        </div>
                        <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {course.name}
                          {course.locationName ? ` — ${course.locationName}` : ''}
                        </div>
                      </div>
                      <div className="p-3.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          2. Harus Berurut atau Tidak
                        </div>
                        <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                              course.enforceOrder !== false
                                ? 'bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}
                          >
                            {orderText}
                          </span>
                        </div>
                      </div>
                      <div className="p-3.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          3. Durasi Lomba
                        </div>
                        <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {durationText}
                        </div>
                      </div>
                    </div>

                    {/* Kolom Kanan */}
                    <div className="divide-y divide-slate-200">
                      <div className="p-3.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          4. Metode Validasi Pos
                        </div>
                        <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {validationText}
                        </div>
                      </div>
                      <div className="p-3.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          5. Info Penalti Point
                        </div>
                        <div
                          className={`text-sm font-extrabold mt-0.5 ${
                            penaltyText.startsWith('-') ? 'text-rose-700' : 'text-slate-900'
                          }`}
                        >
                          {penaltyText}
                        </div>
                      </div>
                      <div className="p-3.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          6. Radius GPS
                        </div>
                        <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {gpsRadiusText}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bagian Bawah: Tabel Daftar Pos Checkpoint */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">
                    Tabel Daftar Pos Checkpoint ({sortedCheckpoints.length} Pos)
                  </h4>
                  <span className="text-xs font-bold text-emerald-700">
                    Total Nilai Maksimal: {totalPoints} Poin
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-300">
                  <table className="w-full border-collapse text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="w-28 border-r border-slate-700 px-3 py-2.5 text-center font-bold uppercase tracking-wider">
                          Nomor Urut
                        </th>
                        <th className="w-36 border-r border-slate-700 px-3 py-2.5 text-center font-bold uppercase tracking-wider">
                          CP
                        </th>
                        <th className="w-36 border-r border-slate-700 px-3 py-2.5 text-center font-bold uppercase tracking-wider">
                          Point CP
                        </th>
                        <th className="px-4 py-2.5 font-bold uppercase tracking-wider">
                          Keterangan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pageCheckpoints.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-8 text-center text-slate-500 italic"
                          >
                            Belum ada pos checkpoint yang ditambahkan pada course ini.
                          </td>
                        </tr>
                      ) : (
                        pageCheckpoints.map((cp, idx) => (
                          <tr
                            key={cp.id}
                            className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                          >
                            <td className="border-r border-slate-200 px-3 py-2.5 text-center font-bold text-slate-700">
                              {cp.orderIndex}
                            </td>
                            <td className="border-r border-slate-200 px-3 py-2.5 text-center font-extrabold text-sky-700">
                              {cp.code}
                            </td>
                            <td className="border-r border-slate-200 px-3 py-2.5 text-center font-bold text-emerald-700">
                              {cp.points} Poin
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-900">
                              {cp.name && cp.name.trim() ? cp.name : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {pageIndex === pages.length - 1 && sortedCheckpoints.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                          <td
                            colSpan={2}
                            className="border-r border-slate-300 px-3 py-2.5 text-center uppercase"
                          >
                            Total ({sortedCheckpoints.length} Pos)
                          </td>
                          <td className="border-r border-slate-300 px-3 py-2.5 text-center text-emerald-700 font-extrabold">
                            {totalPoints} Poin
                          </td>
                          <td className="px-4 py-2.5 text-xs italic text-slate-600 font-medium">
                            {course.enforceOrder !== false
                              ? 'Pos wajib diambil secara berurutan sesuai Nomor Urut.'
                              : 'Pos dapat diambil secara bebas / acak (Score-O).'}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


