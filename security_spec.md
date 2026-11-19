# AVENORA AI — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. Every document under `/users/{userId}` and its nested event subcollections MUST belong strictly to `request.auth.uid == userId`.
2. Every subcollection document under `/users/{userId}/events/{eventId}/...` MUST verify that the parent event exists via `exists(/databases/$(database)/documents/users/$(userId)/events/$(eventId))` and that `ownerId == userId` and `eventId == eventId`.
3. `createdAt` and `ownerId` are immutable after document creation; `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
4. All document path IDs (`userId`, `eventId`, `taskId`, `expenseId`, `guestId`, `vendorId`, `timelineId`, `chatId`, `themeId`) must pass `isValidId()`.
5. No shadow/ghost fields are permitted on create (`keys().hasOnly(...)`) or update (`affectedKeys().hasOnly(...)`).
6. Bounded arrays (`palette` in `themes`) must satisfy `.size() <= 8` and validate element type.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Cross-user profile read**: User B attempts `get` on `/users/userA`.
2. **Cross-user event list**: User B attempts `list` on `/users/userA/events`.
3. **Owner spoofing on event create**: User A attempts to create `/users/userA/events/ev1` with `ownerId: "userB"`.
4. **Shadow field injection**: User A sends `isAdmin: true` or `role: "superadmin"` on `/users/userA` create/update.
5. **Orphaned task write**: User A attempts to write `/users/userA/events/nonexistent/tasks/t1`.
6. **ID poisoning**: User A attempts to write a document with a 500-char or slash-containing `eventId`.
7. **Timestamp forgery**: User A sends a backdated `createdAt` instead of `request.time`.
8. **Immutable field mutation**: User A attempts to change `ownerId` or `createdAt` during an `update`.
9. **Oversized string DoW**: User A sends a 100KB `description` string in a task or theme.
10. **Negative budget/cost**: User A sends `budget: -500` or `actualCost: -10`.
11. **Unbounded array injection**: User A sends 50 entries in `themes/{themeId}.palette`.
12. **Unauthenticated read/write**: Unauthenticated client attempts any read or write anywhere in `/databases/{database}/documents`.
