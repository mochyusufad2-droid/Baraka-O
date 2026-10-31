/**
 * Phase 0 Security TDD Test Suite for firestore.rules
 * Verifies that all "Dirty Dozen" payloads are rejected with PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write on Course',
    collectionPath: '/courses/crs-1',
    operation: 'create',
    auth: null,
    payload: { id: 'crs-1', name: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Admin Spoof',
    collectionPath: '/courses/crs-1',
    operation: 'delete',
    auth: { uid: 'spoof-uid', email: 'mochyusuf.ad1@gmail.com', email_verified: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'ID Poisoning on Course Path',
    collectionPath: '/courses/invalid$id!with*bad*chars',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { id: 'invalid$id!with*bad*chars' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity Spoofing on Course Create (ownerId != request.auth.uid)',
    collectionPath: '/courses/crs-1',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { id: 'crs-1', ownerId: 'other-user' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow / Ghost Field Injection (isSuperAdmin: true)',
    collectionPath: '/courses/crs-1',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { id: 'crs-1', ownerId: 'u1', isSuperAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Value Poisoning (oversized name > 120 chars)',
    collectionPath: '/courses/crs-1',
    operation: 'update',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { name: 'A'.repeat(200) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Client Timestamp Forgery (createdAt != request.time)',
    collectionPath: '/courses/crs-1',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { id: 'crs-1', ownerId: 'u1', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immortal Field Mutation (changing ownerId on update)',
    collectionPath: '/courses/crs-1',
    operation: 'update',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { ownerId: 'u2' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Orphaned Session Creation (parent course does not exist)',
    collectionPath: '/courses/non-existent/sessions/ses-1',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { id: 'ses-1', courseId: 'non-existent', ownerId: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Terminal State Re-opening (updating session after status == FINISHED)',
    collectionPath: '/courses/crs-1/sessions/ses-1',
    operation: 'update',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { status: 'ACTIVE', totalScore: 9999 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Blanket List Query without ownerId filter',
    collectionPath: '/courses',
    operation: 'list',
    auth: { uid: 'random-user', email: 'random@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Cross-Course Session Mismatch (payload.courseId != path courseId)',
    collectionPath: '/courses/crs-1/sessions/ses-1',
    operation: 'create',
    auth: { uid: 'u1', email: 'u1@example.com', email_verified: true },
    payload: { id: 'ses-1', courseId: 'crs-2', ownerId: 'u1' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
