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

export interface GeoPointLocation {
  latitude: number;
  longitude: number;
  name?: string;
}

export interface Checkpoint {
  id: string;
  courseId: string;
  code: string;          // Contoh: "CP1", "CP2"
  name: string;          // Opsional (boleh string kosong "")
  orderIndex: number;    // Urutan pos (1, 2, 3...)
  qrSecret: string;      // Payload unik untuk QR Checkpoint
  latitude: number;
  longitude: number;
  radiusMeters: number;  // Radius toleransi validasi GPS dalam meter
  points: number;        // Skor pos (jika course menggunakan sistem skor)
}

export interface OrganizerPublic {
  id: string;
  code: string;          // Contoh: "SUPERADMIN", "ORG-01", "ORG-02"
  username: string;      // Contoh: "superadmin", "panitia1"
  name: string;          // Nama tampilan panitia / organizer
  organization?: string; // Nama klub / instansi penyelenggara
  isSuperAdmin: boolean;
  isActive: boolean;
  createdAt: string;
}

/**
 * Entitas tunggal Course (Hasil penyatuan Event & Course sesuai kesepakatan diskusi).
 */
export interface Course {
  id: string;
  name: string;
  description: string;
  locationName: string;                   // Opsional
  date: string;
  isActive: boolean;
  scoringEnabled: boolean;
  createdAt: string;
  createdByOrganizerId?: string;          // ID Organizer pembuat course
  createdByOrganizerName?: string;        // Nama Organizer pembuat course
  validationMethod: ValidationMethod;
  defaultGpsRadiusMeters: number;
  enforceOrder: boolean;                  // Apakah peserta wajib mengunjungi pos secara berurutan
  allowParticipantMapVisibility: boolean; // Apakah lokasi peserta boleh ditampilkan di peta monitoring
  durationMinutes?: number;               // Durasi batas waktu course dalam menit (0 / undefined = tanpa batas)
  overtimePenaltyEnabled?: boolean;       // Opsi apakah penalti keterlambatan aktif
  overtimePenaltyPointsPerMinute?: number;// Pengurangan poin tiap menit keterlambatan
  startLocation?: GeoPointLocation;       // Titik koordinat Start di peta (Segitiga 🔺)
  finishLocation?: GeoPointLocation;      // Titik koordinat Finish di peta (Lingkaran Ganda ◎)
  setupQrCode: string;                    // Payload Setup QR untuk Load Course
  startQrCode: string;                    // Payload Start QR untuk memulai sesi
  finishQrCode: string;                   // Payload Finish QR untuk menyelesaikan sesi
  checkpoints: Checkpoint[];
}

export const ORIENTEERING_GENDER_OPTIONS = [
  { value: 'Male', label: 'Male (Putra)' },
  { value: 'Female', label: 'Female (Putri)' },
  { value: 'Other', label: 'Other (Campuran / Umum)' },
] as const;

export const ORIENTEERING_AGE_GROUPS = [
  'Semua Umur',
  '<10',
  '10-12',
  '13-14',
  '15-16',
  '17-18',
  '19-20',
  '21-24',
  '25-29',
  '30-34',
  '35-39',
  '40-44',
  '45-49',
  '50-54',
  '55-59',
  '60-64',
  '65-69',
  '70-74',
  '75-79',
  '80-84',
  '85+',
] as const;

export interface ParticipantPublic {
  id: string;
  name: string;
  teamName: string; // Wajib diisi (ditampilkan utama di Result menggantikan User name)
  gender?: string;  // Contoh: 'Male' | 'Female' | 'Other'
  ageGroup?: string; // Kelompok umur kompetisi orienteering atau 'Semua Umur'
  phone?: string;
  bibNumber: string;
  registeredAt: string;
  createdByOrganizerId?: string; // Jika didaftarkan langsung oleh seorang Organizer
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
  attemptNumber?: number;      // Percobaan ke-berapa pada Course ini (1 = Utama, 2+ = Re-run)
  status: SessionStatus;
  loadedAt: string;
  startedAt?: string;          // Waktu mulai berdasarkan kejadian Start QR
  startedReceivedAt?: string;  // Waktu laporan Start diterima server
  finishedAt?: string;         // Waktu selesai berdasarkan kejadian Finish QR
  finishedReceivedAt?: string; // Waktu laporan Finish diterima server
  validatedCheckpointIds: string[];
  grossScore?: number;         // Total poin pos sebelum dikurangi penalti keterlambatan
  overtimeMinutes?: number;    // Jumlah menit keterlambatan (pembulatan ke atas)
  penaltyPoints?: number;      // Total potongan poin akibat keterlambatan
  totalScore: number;          // Skor akhir bersih (Net Score = max(0, grossScore - penaltyPoints))
  durationSeconds?: number;
  lastLocation?: LastKnownLocation; // Hanya menyimpan 1 posisi terakhir (bukan riwayat rute lengkap)
}

export interface OrganizerBackupRecord extends OrganizerPublic {
  pinHash: string;
  pinSalt: string;
}

export interface ParticipantBackupRecord extends ParticipantPublic {
  pinHash: string;
  pinSalt: string;
}

export interface OrganizerVaultBackup {
  organizers: OrganizerBackupRecord[];
  deletedOrganizerIds: string[];
  courses: Course[];
  deletedCourseIds: string[];
  participants: ParticipantBackupRecord[];
  sessions: ParticipantSession[];
  reports: CheckpointReport[];
  updatedAt?: string;
}

