/**
 * Tipe data utama untuk BARAKA ADVENTURE
 * Digital Orienteering & Amazing Race Platform
 */

export enum UserRole {
  ORGANIZER = 'ORGANIZER',
  PARTICIPANT = 'PARTICIPANT',
}

/**
 * Metode validasi checkpoint pada setiap Course.
 * Untuk QR + GPS, disediakan opsi eksplisit:
 * - QR_AND_GPS: Peserta wajib scan QR DAN berada dalam radius GPS.
 * - QR_OR_GPS: Salah satu terpenuhi sudah sah.
 */
export enum ValidationMethod {
  QR_ONLY = 'QR_ONLY',
  GPS_AUTO = 'GPS_AUTO',
  QR_AND_GPS = 'QR_AND_GPS',
  QR_OR_GPS = 'QR_OR_GPS',
}

export enum SessionStatus {
  NOT_STARTED = 'NOT_STARTED',
  ACTIVE = 'ACTIVE',
  FINISHED = 'FINISHED',
}

export enum SyncStatus {
  SAVED_LOCAL = 'SAVED_LOCAL',
  PENDING_SYNC = 'PENDING_SYNC',
  SENDING = 'SENDING',
  ACCEPTED_SERVER = 'ACCEPTED_SERVER',
  REJECTED_SERVER = 'REJECTED_SERVER',
}

export enum LocationFreshness {
  FRESH = 'FRESH',       // <= 6 menit
  STALE = 'STALE',       // > 6 menit
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface Checkpoint {
  id: string;
  courseId: string;
  code: string;          // Contoh: "CP1", "CP2"
  name: string;
  orderIndex: number;    // Urutan pos (1, 2, 3...)
  qrSecret: string;      // Payload unik untuk QR Checkpoint
  latitude: number;
  longitude: number;
  radiusMeters: number;  // Radius toleransi validasi GPS dalam meter
  points: number;        // Skor pos (jika course menggunakan sistem skor)
}

/**
 * Entitas tunggal Course (Hasil penyatuan Event & Course sesuai kesepakatan diskusi).
 */
export interface Course {
  id: string;
  name: string;
  description: string;
  locationName: string;
  date: string;
  isActive: boolean;
  scoringEnabled: boolean;
  createdAt: string;
  validationMethod: ValidationMethod;
  defaultGpsRadiusMeters: number;
  enforceOrder: boolean;                  // Apakah peserta wajib mengunjungi pos secara berurutan
  allowParticipantMapVisibility: boolean; // Apakah lokasi peserta boleh ditampilkan di peta monitoring
  setupQrCode: string;                    // Payload Setup QR untuk Load Course
  startQrCode: string;                    // Payload Start QR untuk memulai sesi
  finishQrCode: string;                   // Payload Finish QR untuk menyelesaikan sesi
  checkpoints: Checkpoint[];
}

export interface ParticipantPublic {
  id: string;
  name: string;
  teamName: string; // Wajib diisi
  phone?: string;
  bibNumber: string;
  registeredAt: string;
}

export interface LastKnownLocation {
  participantId: string;
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  measuredAt: string;   // Waktu pengukuran asli di HP peserta (ISO string)
  receivedAt: string;   // Waktu diterima oleh server (ISO string)
}

export interface CheckpointReport {
  reportId: string;     // ID unik (idempotency key) untuk mencegah laporan ganda
  courseId: string;
  sessionId: string;
  participantId: string;
  checkpointId: string; // Atau 'START' / 'FINISH' untuk aksi khusus
  reportType: 'START' | 'CHECKPOINT' | 'FINISH';
  validationUsed: 'QR' | 'GPS' | 'QR_AND_GPS';
  qrPayloadScanned?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  measuredAt: string;   // Waktu kejadian asli di HP peserta (tidak boleh ditimpa server)
  receivedAt?: string;  // Waktu diterima server (diisi oleh backend)
  syncStatus: SyncStatus;
  serverVerified: boolean;
  rejectionReason?: string;
  pointsAwarded?: number;
}

export interface ParticipantSession {
  id: string;
  courseId: string;
  participantId: string;
  status: SessionStatus;
  loadedAt: string;
  startedAt?: string;          // Waktu mulai berdasarkan kejadian Start QR
  startedReceivedAt?: string;  // Waktu laporan Start diterima server
  finishedAt?: string;         // Waktu selesai berdasarkan kejadian Finish QR
  finishedReceivedAt?: string; // Waktu laporan Finish diterima server
  validatedCheckpointIds: string[];
  totalScore: number;
  durationSeconds?: number;
  lastLocation?: LastKnownLocation; // Hanya menyimpan 1 posisi terakhir (bukan riwayat rute lengkap)
}
