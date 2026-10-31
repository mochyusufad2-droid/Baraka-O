# BARAKA ADVENTURE — Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched (`/courses/{courseId}` and `/courses/{courseId}/sessions/{sessionId}`) are unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity & Admin Gate**: All authenticated writes require `request.auth != null && request.auth.token.email_verified == true`. Bootstrapped admin (`mochyusuf.ad1@gmail.com`) must also have `request.auth.token.email_verified == true` or exist in `/admins/{uid}`.
3. **Path Variable Hardening (`isValidId`)**: Every document ID (`{courseId}`, `{sessionId}`) must be a string with `size() >= 1 && size() <= 128` matching `^[a-zA-Z0-9_\-]+$`.
4. **Master Gate Relational Integrity**: A session document `/courses/{courseId}/sessions/{sessionId}` cannot be created unless the parent `/courses/{courseId}` exists (`exists(/databases/$(database)/documents/courses/$(courseId))`), and its `courseId` field matches the path `{courseId}`.
5. **Strict Schema & Immortal Fields**: `id`, `ownerId`, `courseId`, and `createdAt` are immutable on update. Timestamps `createdAt` and `updatedAt` must equal `request.time`.
6. **Terminal State Locking**: Once a session reaches `status == 'FINISHED'`, non-admin users cannot mutate it further.
7. **Secure List Queries**: `allow list` on `/courses/{courseId}` and `/courses/{courseId}/sessions/{sessionId}` enforces `resource.data.ownerId == request.auth.uid || isAdmin()` so no blanket reads occur.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/courses/crs-1`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', email: 'mochyusuf.ad1@gmail.com', email_verified: false }` attempting admin write.
3. **ID Poisoning**: `{courseId}` containing 200 characters or invalid characters (`crs/../hack`).
4. **Identity Spoofing on Create**: `auth.uid = 'u1'` creating a course with `ownerId: 'u2'`.
5. **Shadow / Ghost Field Injection**: Creating or updating a course with an undeclared field `isVerified: true`.
6. **Value Poisoning**: Updating `name` with a number (`12345`) or a string exceeding `maxLength` (120 chars).
7. **Client Timestamp Forgery**: Setting `createdAt` or `updatedAt` to a past timestamp instead of `request.time`.
8. **Immortal Field Mutation**: Updating `ownerId` or `createdAt` on an existing course or session.
9. **Orphaned Session Creation**: Creating `/courses/non-existent-course/sessions/ses-1` where parent course does not exist.
10. **Terminal State Re-opening**: Non-admin participant attempting to update a session whose `existing().status == 'FINISHED'`.
11. **Unrestricted Blanket List Query**: Authenticated user querying `/courses` without filtering by `ownerId == request.auth.uid`.
12. **Cross-Course Session Mismatch**: Creating `/courses/crs-1/sessions/ses-1` with payload `courseId: 'crs-2'`.

## 3. Red Team Audit & Conflict Report
- **Identity Spoofing**: Blocked (`incoming().ownerId == request.auth.uid` on create; `incoming().ownerId == existing().ownerId` on update).
- **State Shortcutting / Terminal State**: Blocked (`existing().status != 'FINISHED' || isAdmin()`).
- **Resource Poisoning**: Blocked (`isValidId()` and strict `.size()` bounds on every string field).
- **Value Poisoning**: Blocked (`isValidCourse(incoming())` and `isValidSession(incoming())` wrap the entire `allow update` block).
