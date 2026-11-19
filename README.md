<div align="center">

# AVENORA AI

### *Plan moments. Create memories.*

An editorial, earthy-luxury **AI Event Planning Platform** engineered in a clean, production-ready **three-layer architecture**:
**Vercel Static Frontend** (`frontend/` → `https://avenoraai3.vercel.app`) · **Render Node.js + Express REST API** (`backend/` → `https://avenora-ai.onrender.com`) · **Firebase Auth & Cloud Firestore** (`avenora-ai`)

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-14251C?style=for-the-badge&logo=node.js&logoColor=A3B59A)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-REST_API-1F3A2D?style=for-the-badge&logo=express&logoColor=F5F3ED)](https://expressjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase-avenora--ai-14251C?style=for-the-badge&logo=firebase&logoColor=C7A98A)](https://firebase.google.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-Server--Side_AI-0B0D0C?style=for-the-badge&logo=googlegemini&logoColor=A3B59A)](https://ai.google.dev/)
[![Vercel](https://img.shields.io/badge/Frontend-Vercel-1F3A2D?style=for-the-badge&logo=vercel&logoColor=F5F3ED)](https://avenoraai3.vercel.app/)
[![Render](https://img.shields.io/badge/Backend-Render-14251C?style=for-the-badge&logo=render&logoColor=A3B59A)](https://avenora-ai.onrender.com/health)

</div>

---

## Three-Layer Architecture

| Layer | Directory / Service | Responsibility | Hosting |
| :--- | :--- | :--- | :--- |
| **1. Frontend** | `frontend/` | HTML5, CSS3, Vanilla ES Modules, Firebase Web SDK Auth (`avenora-ai`), Chart.js, Lucide Icons, static imagery. Contains **zero Gemini or Admin secrets** and zero React/Next.js. | **Vercel** (`https://avenoraai3.vercel.app`) |
| **2. Backend** | `backend/` | Node.js + Express REST API (`/health`, `/api/auth/me`, `/api/users/*`, `/api/events/*`, `/api/ai/*`), Helmet, strict CORS allowlisting, IPv6-safe rate limiting, Firebase Admin ID token verification, and server-side `@google/genai`. | **Render** (`https://avenora-ai.onrender.com`) |
| **3. Database & Auth** | Firebase Project `avenora-ai` | Native Firebase Authentication (Google Sign-In + Email/Password) + Cloud Firestore accessed through authenticated backend endpoints. Supports keyless Google Cloud ADC/WIF or user-token scoped Firestore REST enforcing `firestore.rules`. | **Firebase** |

---

## Core Modules

| Module | Page | Capabilities |
| :--- | :--- | :--- |
| **Editorial Landing** | `frontend/index.html` | Brand showcase, module overview, event category explorer, and Privacy, Security & AI Transparency FAQ |
| **Workspace Dashboard** | `frontend/dashboard.html` | Multi-event overview, live KPI strip (countdown, budget balance, tasks, RSVPs), and quick actions |
| **9-Step AI Event Creator & Blueprint** | `frontend/event.html` | Guided 9-step intake wizard generating a structured **16-section Event Blueprint** with per-section editing & regeneration |
| **AI Event Co-Pilot** | `frontend/copilot.html` | Context-aware conversational strategist preloaded with your saved event budget, tasks, guests, vendors, timeline, and theme |
| **Budget Planner & Advisor** | `frontend/budget.html` | Expense ledger, Chart.js spending & category breakdown visualizations, variance tracking, and AI cost-saving guidance |
| **Smart Checklist** | `frontend/checklist.html` | Priority and category filters, live completion tracking, and AI milestone task generation aligned to your event date |
| **Guests & Invitation Studio** | `frontend/guests.html` | RSVP & dietary tracker plus an AI studio drafting 7 invitation formats (WhatsApp, Email, Formal, Casual, Traditional, Modern, Custom) |
| **Vendors & Outreach** | `frontend/vendors.html` | Vendor directory with contract status tracking and AI outreach package drafting (email, WhatsApp, short brief, follow-up) |
| **Event Timeline** | `frontend/timeline.html` | Chronological run-of-show manager with overlap/conflict detection and AI schedule generation |
| **AI Theme Studio** | `frontend/theme-studio.html` | Custom 5-color HEX palette builder, copy-to-clipboard swatches, lighting/floral briefs, moodboard composition cards, and side-by-side comparison |
| **Settings & Export** | `frontend/settings.html` | Planner profile, default currency, verification status, and full JSON archive export |

---

## Security & Authentication Architecture

- **Zero Exposed Secrets in Frontend**: Neither `GEMINI_API_KEY` nor Firebase Admin credentials ever appear inside `frontend/`.
- **Native Firebase Authentication (`avenora-ai`)**:
  - **Google Sign-In**: `GoogleAuthProvider` + `signInWithPopup` (with automatic `signInWithRedirect` fallback if popups are blocked). Requires zero custom `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` OAuth backend flows.
  - **Email & Password**: `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `sendPasswordResetEmail`, and `sendEmailVerification` directly via Firebase Web SDK.
- **Per-User Firestore Isolation**: After authentication, the frontend sends `Authorization: Bearer <FIREBASE_ID_TOKEN>` from `currentUser.getIdToken()`. Every backend API endpoint verifies that token via `adminAuth.verifyIdToken()` and scopes Firestore reads/writes strictly to `users/{req.user.uid}/events/{eventId}/...`.
- **Keyless & Admin Dual-Mode Firestore**: Uses `firebase-admin` `applicationDefault()` / service account credentials when available, and automatically runs user-token authenticated Cloud Firestore REST calls enforcing `firestore.rules` when Google Cloud restricts service account key creation.
- **Server-Side Gemini Proxy**: All 8 Gemini AI tools execute on `backend/services/geminiService.js` with strict rate limiting (`express-rate-limit` with `ipKeyGenerator`), payload sanitization, and schema validation.

---

## Project Structure

```text
AVENORA-AI/
├── frontend/                         # Vercel Static Site (HTML5, CSS3, Vanilla JS)
│   ├── index.html, login.html, signup.html, dashboard.html, event.html,
│   │   budget.html, checklist.html, guests.html, vendors.html, timeline.html,
│   │   theme-studio.html, copilot.html, settings.html
│   ├── config/
│   │   ├── apiConfig.js              # Centralized API_BASE_URL (https://avenora-ai.onrender.com)
│   │   └── firebaseConfig.js         # Firebase Web SDK Auth config for project avenora-ai
│   ├── css/                          # Design tokens, components, dashboard & responsive styles
│   ├── js/                           # Modular Vanilla JS controllers (api.js + module scripts)
│   ├── assets/images/                # Editorial visual assets
│   ├── vite.config.mjs               # Multi-page asset bundler
│   ├── package.json
│   └── .env.example
├── backend/                          # Render Node.js + Express REST API
│   ├── server.js                     # Express entrypoint (/health, /api/*, process.env.PORT)
│   ├── config/
│   │   ├── loadEnv.js                # Loads backend/.env before module init
│   │   └── firebaseAdmin.js          # Firebase Admin verifier & ADC/keyless mode for avenora-ai
│   ├── middleware/
│   │   ├── authMiddleware.js         # Bearer ID token verification + async token context
│   │   └── errorMiddleware.js        # Strict CORS allowlist, Helmet, IPv6-safe rate limiters
│   ├── services/
│   │   ├── firebaseService.js        # Dual-mode Admin / keyless Firestore REST CRUD
│   │   ├── firestoreRestClient.js    # User-token scoped Firestore REST engine
│   │   └── geminiService.js          # Server-side @google/genai tools
│   ├── controllers/                  # REST controllers
│   ├── routes/                       # Express routers mapped to /api/*
│   ├── utils/
│   │   ├── authContext.js            # Request-scoped verified ID token store
│   │   └── sanitize.js               # Input sanitization & Firestore timestamp serializer
│   ├── package.json
│   └── .env.example
├── firestore.rules                   # Cloud Firestore security rules for avenora-ai
├── firebase-blueprint.json           # Firestore schema blueprint
├── eslint.config.mjs                 # JS & Firestore rules linter configuration
└── package.json                      # Unified workspace build/lint scripts
```

---

## Local Development

### 1. Configure Environment Files
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
- In `backend/.env`: fill in `GEMINI_API_KEY` and `FIREBASE_PROJECT_ID=avenora-ai`.
- In `frontend/.env`: fill in your public `VITE_FIREBASE_*` Web App keys from Firebase Console (`avenora-ai`).

### 2. Run Backend & Frontend Independently

```bash
# Terminal 1: Pure Node.js + Express REST API Backend (http://localhost:5000)
cd backend && npm install && npm start

# Terminal 2: Static Frontend Dev Server (http://localhost:5173)
cd frontend && npm install
VITE_API_BASE_URL=http://localhost:5000 npm run dev
```

---

## Production Deployment

### Backend → Render (`https://avenora-ai.onrender.com`)
- **Root Directory**: `backend`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment Variables**:
  - `NODE_ENV=production`
  - `GEMINI_API_KEY=...`
  - `FIREBASE_PROJECT_ID=avenora-ai`
  - `FRONTEND_URL=https://avenoraai3.vercel.app`

### Frontend → Vercel (`https://avenoraai3.vercel.app`)
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL=https://avenora-ai.onrender.com`
  - `VITE_FIREBASE_API_KEY=...`
  - `VITE_FIREBASE_AUTH_DOMAIN=avenora-ai.firebaseapp.com`
  - `VITE_FIREBASE_PROJECT_ID=avenora-ai`
  - `VITE_FIREBASE_STORAGE_BUCKET=avenora-ai.firebasestorage.app`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID=...`
  - `VITE_FIREBASE_APP_ID=...`

### Firebase Console (`avenora-ai`) Checklist
- Enable **Google** and **Email/Password** under **Authentication → Sign-in method**.
- Add `avenoraai3.vercel.app` under **Authentication → Settings → Authorized domains**.

---

<div align="center">

Crafted with quiet precision for unforgettable gatherings — **AVENORA AI**

</div>
