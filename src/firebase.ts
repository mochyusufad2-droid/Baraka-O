import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  setLogLevel,
  doc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { Course, ParticipantPublic, ParticipantSession } from './types';

// Matikan log error internal Firestore di console agar mode offline / gangguan jaringan
// tidak memicu false-positive error overlay pada browser peserta.
setLogLevel('silent');

// Bersihkan cache token lama di IndexedDB jika sebelumnya ada sesi yang gagal refresh
// akibat securetoken.googleapis.com belum aktif di project Cloud.
if (typeof window !== 'undefined' && window.indexedDB) {
  try {
    window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
  } catch {
    // Abaikan jika browser memblokir akses IndexedDB
  }
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Notice: ', JSON.stringify(errInfo));
}

// Validate Connection to Firestore on boot (tanpa memicu console.error saat offline)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore operating in offline/local mode.');
    }
  }
}
void testConnection();

export async function signInWithGoogleFirebase(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.warn('Google Sign-In skipped or unavailable:', error);
    return null;
  }
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // Abaikan jika sudah sign out
  }
}

export { onAuthStateChanged };
export type { User };

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  return VALID_ID_REGEX.test(cleaned) ? cleaned : `id-${Date.now()}`;
}

/**
 * Mencadangkan dokumen Course ke Cloud Firestore sesuai skema firebase-blueprint.json
 */
export async function syncCourseToFirestore(course: Course): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const courseId = sanitizeId(course.id);
  const path = `courses/${courseId}`;
  try {
    await setDoc(doc(db, 'courses', courseId), {
      id: courseId,
      ownerId: currentUser.uid,
      name: course.name.slice(0, 120),
      description: (course.description || '').slice(0, 500),
      locationName: (course.locationName || 'Lokasi Utama').slice(0, 150),
      date: (course.date || '2026-11-15').slice(0, 32),
      validationMethod: course.validationMethod,
      defaultGpsRadiusMeters: Math.min(1000, Math.max(5, Number(course.defaultGpsRadiusMeters) || 35)),
      enforceOrder: Boolean(course.enforceOrder),
      scoringEnabled: Boolean(course.scoringEnabled),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Mencadangkan dokumen Sesi Peserta ke Cloud Firestore sesuai skema firebase-blueprint.json
 */
export async function syncSessionToFirestore(
  session: ParticipantSession,
  participant: ParticipantPublic
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const courseId = sanitizeId(session.courseId);
  const sessionId = sanitizeId(session.id);
  const path = `courses/${courseId}/sessions/${sessionId}`;

  try {
    await setDoc(doc(db, 'courses', courseId, 'sessions', sessionId), {
      id: sessionId,
      courseId,
      ownerId: currentUser.uid,
      bibNumber: participant.bibNumber.slice(0, 32),
      participantName: participant.name.slice(0, 100),
      teamName: participant.teamName.slice(0, 100),
      status: session.status,
      totalScore: Math.min(1000000, Math.max(0, Number(session.totalScore) || 0)),
      checkpointsCompleted: Math.min(500, Math.max(0, session.validatedCheckpointIds.length)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
