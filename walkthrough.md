# Security Summary

This review covers the AVENORA AI web frontend (`frontend/`), Node.js/Express backend (`backend/`), and Firebase configuration (`avenora-ai`). All three deployment layers keep strict separation between browser presentation, server-side AI and authorization logic, and per-user Firestore persistence.

## Threat Model & Trust Boundaries

- **Browser to Backend API (`frontend/` -> `backend/`)**: Every mutating and user-scoped endpoint under `/api/auth/me`, `/api/users`, `/api/events`, and `/api/ai` requires a valid Firebase ID token in the `Authorization: Bearer <token>` header, verified server-side via Firebase Admin or Google's token verification endpoint against project `avenora-ai`. CORS restricts browser access to `https://avenoraai3.vercel.app` and configured `FRONTEND_URL` origins in production.
- **User Input & AI Payloads (`backend/utils/sanitize.js`, `backend/controllers/aiController.js`)**: All client-supplied event fields, dates, subcollection records, theme palettes, Co-Pilot fallback context, and 16-section blueprint updates pass through server-side type checks, key allowlists, recursive unsafe-key removal, hex color checks, and calendar date validation before reaching Gemini or Firestore.
- **Database & Rules Boundary (`backend/services/`, `firestore.rules`)**: Firestore document paths and segment identifiers are validated against path traversal, query delimiters, and empty segments before calling the Firestore REST API. Security rules in `firestore.rules` lock all `users/{userId}` documents and nested event subcollections to `request.auth != null && request.auth.uid == userId`.
- **Secret Isolation**: `GEMINI_API_KEY` and Firebase Admin credentials stay exclusively in backend environment variables. Verified scans confirm no private keys or backend secrets appear in any `frontend/` file. Authenticated `/api` responses send `Cache-Control: no-store`, and Express disables `x-powered-by`.

## Dependency Security Audit

- Executed `bun audit` against `bun.lock`: 2 transitive advisories were reported inside `@grpc/grpc-js@1.9.16` (pulled transitively by `firebase > @firebase/firestore-compat > @firebase/firestore`, alongside `@grpc/grpc-js@1.14.7`). AVENORA AI uses the modular Web SDK and Express REST/Admin paths without exposing or running a gRPC server, so this transitive dependency is not reachable in the application runtime.

## PoC Verification

Each fix was verified with executable tests (`npm test`) and source verification after completion:

1. **Blueprint Key Allowlisting, Recursive Property Filtering & Payload Size Bounds** (`backend/utils/sanitize.js:84-126`, `backend/services/firebaseService.js`)
   - *Verification*: Passed unknown keys (`unexpectedKey`) and nested unsafe object keys (`__proto__`, `constructor`, `prototype`) to `sanitizeBlueprint` and `stripPrototypeKeys`, confirming disallowed keys are stripped, `Object.prototype` remains unpolluted, and non-object or oversized (>150 KB) blueprint payloads reject with HTTP `400`.
2. **Strict Calendar Date Validation** (`backend/utils/sanitize.js:57-76`, `backend/controllers/aiController.js:82-90`)
   - *Verification*: Sent an impossible calendar date (`2026-02-30`) to `POST /api/ai/create-event-plan` against a live test server instance in `tests/integration/api.test.js`, confirming HTTP `400` rejection while leap-year `2024-02-29` is accepted.
3. **Firestore REST Path & Segment Safety** (`backend/services/firestoreRestClient.js:105-132`)
   - *Verification*: Executed `assertSafeFirestorePath` against `../users/admin`, `users/../secrets`, `users/uid_1?fields=all`, `users/uid_1#fragment`, `users//events`, and `users/bad$id/events`, confirming every malformed path throws an HTTP `400` validation error.
4. **Authentication Enforcement, Rate Limiting & Cache Headers** (`backend/server.js:33-100`, `backend/routes/authRoutes.js`)
   - *Verification*: Sent unauthenticated requests across all 11 protected route groups (`/api/auth/me`, `/api/users/me`, `/api/events`, event subcollections, and `/api/ai/chat`), confirming HTTP `401`, `Cache-Control: no-store`, absence of `x-powered-by`, and `403` CORS rejection for unauthorized browser origins.
5. **Palette Color Style Safety & Output Escaping** (`frontend/js/utils.js:1-14`, `frontend/js/theme-studio.js:48-212`)
   - *Verification*: Tested `escapeHtml` with `<img src=x onerror=...>` and `sanitizeHexColor` with CSS property injection strings (`#14251C; background:url(...)`), confirming strict neutralization to `#RRGGBB` or safe fallback `#14251C`.
6. **Frontend Secret Isolation & Workspace Ownership Rules** (`tests/security/security.test.js`, `firestore.rules`)
   - *Verification*: Scanned all `.html`, `.js`, and `.mjs` files under `frontend/` confirming zero occurrences of backend secrets, API keys, or private key blocks, and verified Firebase project ID `avenora-ai` across frontend config, backend Admin config, and API health metadata.
