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
  updatedAt?: string;    // Timestamp pembaruan terakhir pos agar edit koordinat/detail tidak tertimpa data lama
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
  maxCourses?: number | null; // Jatah maksimal course (angka atau null/undefined = Unlimited)
  expiresAt?: string | null;  // Masa aktif akun (ISO string atau null = Lifetime)
}

export enum CourseRaceMode {
  REGULAR = 'REGULAR',
  RELAY = 'RELAY',
}

export enum RelayDnfScoringMode {
  ZERO = 'ZERO',
  PARTIAL_WITH_PENALTY = 'PARTIAL_WITH_PENALTY',
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
  updatedAt?: string;                     // Timestamp pembaruan terakhir course
  createdByOrganizerId?: string;          // ID Organizer pembuat course
  createdByOrganizerName?: string;        // Nama Organizer pembuat course
  validationMethod: ValidationMethod;
  defaultGpsRadiusMeters: number;
  enforceOrder: boolean;                  // Apakah peserta wajib mengunjungi pos secara berurutan
  allowParticipantMapVisibility: boolean; // Apakah lokasi peserta boleh ditampilkan di peta monitoring
  durationMinutes?: number;               // Durasi batas waktu course dalam menit (0 / undefined = tanpa batas)
  overtimePenaltyEnabled?: boolean;       // Opsi apakah penalti keterlambatan aktif
  overtimePenaltyPointsPerMinute?: number;// Pengurangan poin tiap menit keterlambatan
  raceMode?: CourseRaceMode;              // Mode lomba: REGULAR (biasa) atau RELAY (estafet sub-team)
  relaySubTeamCount?: number;             // Jumlah sub-team per tim induk saat mode RELAY (default 3)
  relayEnforceSequential?: boolean;       // Kunci urutan estafet: Sub-Team k menunggu k-1 Finish/DNF (default true)
  relayDnfScoringMode?: RelayDnfScoringMode; // Aturan skor sub-team yang DNF di mode RELAY
  relayDnfPenaltyPoints?: number;         // Penalti poin tambahan per sub-team DNF (untuk mode PARTIAL_WITH_PENALTY)
  relayAllowDuplicateCheckpoints?: boolean; // True = tiap sub-team boleh ambil CP yang sama & poin dijumlahkan penuh; False = CP yang sama hanya dihitung 1x untuk Tim Induk (default true)
  startLocation?: GeoPointLocation;       // Titik koordinat Start di peta (Segitiga 🔺)
  finishLocation?: GeoPointLocation;      // Titik koordinat Finish di peta (Lingkaran Ganda ◎)
  setupQrCode: string;                    // Payload Setup QR untuk Load Course
  startQrCode: string;                    // Payload Start QR untuk memulai sesi
  finishQrCode: string;                   // Payload Finish QR untuk menyelesaikan sesi
  checkpoints: Checkpoint[];
  deletedCheckpointIds?: string[];        // Tombstone ID pos yang telah dihapus agar tidak muncul lagi saat merge
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
  penaltyPoints?: number;      // Total potongan poin akibat keterlambatan / DNF Relay
  totalScore: number;          // Skor akhir bersih (Net Score = max(0, grossScore - penaltyPoints))
  durationSeconds?: number;
  lastLocation?: LastKnownLocation; // Hanya menyimpan 1 posisi terakhir (bukan riwayat rute lengkap)
  isDnf?: boolean;                  // True jika sesi dihentikan / dinyatakan Tidak Menyelesaikan Course
  dnfReason?: string;               // Alasan DNF (misal: Peserta menekan Keluar saat lomba berjalan)
  relayParentTeamName?: string;     // Nama Tim Induk pada Course mode RELAY
  relayParentTeamKey?: string;      // Kunci normalisasi Nama Tim Induk (uppercase + spasi tunggal)
  relayLegIndex?: number;           // Urutan Sub-Team pada mode RELAY (1, 2, 3...)
  relayMemberNames?: string;        // Catatan nama anggota pelari di Sub-Team ini (opsional)
  relayOverrideUnlocked?: boolean;  // True jika dibuka manual lewat tombol Override Panitia
  relayOverrideReason?: string;     // Alasan Override oleh Panitia
  relayOverrideAt?: string;         // Timestamp Override oleh Panitia
}

export interface OrganizerBackupRecord extends OrganizerPublic {
  pinHash: string;
  pinSalt: string;
}

export interface ParticipantBackupRecord extends ParticipantPublic {
  pinHash: string;
  pinSalt: string;
}

export interface AllTimeLocationEntry {
  locationName: string;
  coursesCount: number;
  lastUsedDate?: string;
}

export interface AllTimeOrganizerEntry {
  id: string;
  name: string;
  organization?: string;
  isActive: boolean;
}

export interface AllTimePlatformStats {
  totalOrganizersEver: number;
  totalCoursesEver: number;
  totalParticipantsEver: number;
  totalSessionsEver: number;
  totalLocationsEver: number;
  locations: AllTimeLocationEntry[];
  organizers: AllTimeOrganizerEntry[];
}

export interface OrganizerVaultBackup {
  organizers: OrganizerBackupRecord[];
  deletedOrganizerIds: string[];
  courses: Course[];
  deletedCourseIds: string[];
  participants: ParticipantBackupRecord[];
  deletedParticipantIds?: string[];
  sessions: ParticipantSession[];
  deletedSessionIds?: string[];
  reports: CheckpointReport[];
  updatedAt?: string;
}



