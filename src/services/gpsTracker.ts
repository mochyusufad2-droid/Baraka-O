import { LastKnownLocation, LocationFreshness } from '../types';

export const GPS_INTERVAL_MS = 5 * 60 * 1000; // Target operasional: sekitar 5 menit (300.000 ms)
export const STALE_LOCATION_THRESHOLD_MS = 6 * 60 * 1000; // Dianggap terlambat (stale) jika > 6 menit

const LS_PENDING_LAST_LOCATION_KEY = 'baraka_pending_last_location_only_v1';

export enum GpsTrackerState {
  IDLE = 'IDLE',
  ACTIVE_TRACKING = 'ACTIVE_TRACKING',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  GPS_UNAVAILABLE = 'GPS_UNAVAILABLE',
  OFFLINE_SAVED_LAST = 'OFFLINE_SAVED_LAST',
  SYNC_FAILED = 'SYNC_FAILED',
  COURSE_HIDDEN = 'COURSE_HIDDEN',
}

export interface PendingLocationPayload {
  sessionId: string;
  participantId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  measuredAt: string; // Waktu pengukuran asli di HP peserta
}

/**
 * Menyimpan HANYA 1 posisi GPS terakhir di perangkat ketika offline/gagal kirim.
 * Menimpa posisi sebelumnya sehingga TIDAK PERNAH menyimpan riwayat rute (breadcrumb).
 */
export function savePendingLastLocationOnly(payload: PendingLocationPayload | null): void {
  try {
    if (!payload) {
      localStorage.removeItem(LS_PENDING_LAST_LOCATION_KEY);
      return;
    }
    localStorage.setItem(LS_PENDING_LAST_LOCATION_KEY, JSON.stringify(payload));
  } catch {
    // Abaikan jika penyimpanan lokal terbatas
  }
}

export function loadPendingLastLocationOnly(
  sessionId?: string
): PendingLocationPayload | null {
  try {
    const raw = localStorage.getItem(LS_PENDING_LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingLocationPayload;
    if (sessionId && parsed.sessionId !== sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Menentukan apakah posisi GPS terakhir masih baru (FRESH), sudah lama/kedaluwarsa (STALE),
 * atau belum tersedia (UNAVAILABLE).
 */
export function evaluateLocationFreshness(
  location?: LastKnownLocation | null,
  referenceTimeMs: number = Date.now()
): {
  freshness: LocationFreshness;
  ageSeconds: number | null;
  label: string;
} {
  if (!location || !location.measuredAt) {
    return {
      freshness: LocationFreshness.UNAVAILABLE,
      ageSeconds: null,
      label: 'Belum Tersedia',
    };
  }

  const measuredMs = Date.parse(location.measuredAt);
  if (Number.isNaN(measuredMs)) {
    return {
      freshness: LocationFreshness.UNAVAILABLE,
      ageSeconds: null,
      label: 'Tidak Valid',
    };
  }

  const ageMs = Math.max(0, referenceTimeMs - measuredMs);
  const ageSeconds = Math.round(ageMs / 1000);

  if (ageMs <= STALE_LOCATION_THRESHOLD_MS) {
    return {
      freshness: LocationFreshness.FRESH,
      ageSeconds,
      label: 'Terbaru (Fresh)',
    };
  }

  return {
    freshness: LocationFreshness.STALE,
    ageSeconds,
    label: 'Kedaluwarsa / Terlambat (>6 mnt)',
  };
}

/**
 * Memeriksa status izin lokasi browser/Android tanpa memicu pengiriman jika ditolak.
 */
export async function checkGeolocationPermission(): Promise<
  'granted' | 'prompt' | 'denied' | 'unsupported'
> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'unsupported';
  }
  if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    } catch {
      return 'prompt';
    }
  }
  return 'prompt';
}

/**
 * Mengirimkan HANYA posisi terakhir peserta ke server (/api/participant/location).
 * Terpisah sepenuhnya dari antrean laporan checkpoint.
 */
export async function sendLastLocationToServer(params: {
  token: string;
  payload: PendingLocationPayload;
  isOfflineSimulated?: boolean;
}): Promise<{
  ok: boolean;
  state: GpsTrackerState;
  lastLocation?: LastKnownLocation;
  message: string;
}> {
  const { token, payload, isOfflineSimulated } = params;
  const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (browserOffline || isOfflineSimulated) {
    savePendingLastLocationOnly(payload);
    return {
      ok: false,
      state: GpsTrackerState.OFFLINE_SAVED_LAST,
      message:
        'Perangkat sedang offline. Hanya posisi terakhir ini yang disimpan sementara dan akan dikirim saat sinyal kembali.',
    };
  }

  try {
    const res = await fetch('/api/participant/location', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId: payload.sessionId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracyMeters: payload.accuracyMeters,
        measuredAt: payload.measuredAt,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      savePendingLastLocationOnly(payload);
      return {
        ok: false,
        state: GpsTrackerState.SYNC_FAILED,
        message: data.error || `Gagal mengirim lokasi terakhir (HTTP ${res.status}).`,
      };
    }

    // Hapus cache pending karena server sudah menerima posisi terakhir terbaru
    savePendingLastLocationOnly(null);
    return {
      ok: true,
      state: GpsTrackerState.ACTIVE_TRACKING,
      lastLocation: data.lastLocation as LastKnownLocation,
      message: 'Posisi GPS terakhir berhasil diperbarui ke server.',
    };
  } catch {
    savePendingLastLocationOnly(payload);
    return {
      ok: false,
      state: GpsTrackerState.SYNC_FAILED,
      message:
        'Gangguan jaringan saat mengirim posisi GPS. Posisi terakhir disimpan dan akan dikirim ulang otomatis.',
    };
  }
}
