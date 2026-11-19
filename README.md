<div align="center">

# AVENORA AI

### *Plan moments. Create memories.*

An editorial, earthy-luxury **AI Event Planning Platform** engineered in a clean, production-ready **three-layer architecture**:
**Netlify Static Frontend** (`frontend/`) · **Render Node.js + Express REST API** (`backend/`) · **Firebase Auth & Cloud Firestore** (`avenora-ai`)

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-14251C?style=for-the-badge&logo=node.js&logoColor=A3B59A)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-REST_API-1F3A2D?style=for-the-badge&logo=express&logoColor=F5F3ED)](https://expressjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase-avenora--ai-14251C?style=for-the-badge&logo=firebase&logoColor=C7A98A)](https://firebase.google.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-Server--Side_AI-0B0D0C?style=for-the-badge&logo=googlegemini&logoColor=A3B59A)](https://ai.google.dev/)
[![Netlify](https://img.shields.io/badge/Frontend-Netlify-1F3A2D?style=for-the-badge&logo=netlify&logoColor=F5F3ED)](https://www.netlify.com/)
[![Render](https://img.shields.io/badge/Backend-Render-14251C?style=for-the-badge&logo=render&logoColor=A3B59A)](https://render.com/)

</div>

---

## Three-Layer Architecture

| Layer | Directory / Service | Responsibility | Hosting |
| :--- | :--- | :--- | :--- |
| **1. Frontend** | `frontend/` | HTML5, CSS3, Vanilla ES Modules, Chart.js, Lucide Icons, static imagery. Contains **zero API keys**, zero React/Next.js, and zero Firebase client credentials. | **Netlify** |
| **2. Backend** | `backend/` | Node.js + Express REST API (`/api/auth/*`, `/api/users/*`, `/api/events/*`, `/api/ai/*`), Helmet, CORS allowlisting, IPv6-safe rate limiting, Firebase Admin SDK token verification, and server-side `@google/genai`. | **Render** |
| **3. Database & Auth** | Firebase Project `avenora-ai` | Firebase Authentication + Cloud Firestore accessed exclusively through authenticated backend endpoints via `firebase-admin`. Preserves `users/{uid}/events/{eventId}` and all subcollections. | **Firebase** |

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

- **Zero Exposed Secrets in Frontend**: Neither `GEMINI_API_KEY`, Firebase service account keys, `GOOGLE_CLIENT_SECRET`, nor `FIREBASE_WEB_API_KEY` appear anywhere inside `frontend/`.
- **Backend-Mediated Authentication (`avenora-ai`)**:
  - **Email & Password**: `POST /api/auth/register` and `/api/auth/login` verify passwords via Google Identity Toolkit REST on the backend using server-only `FIREBASE_WEB_API_KEY` and manage user profiles with `firebase-admin`.
  - **Google Sign-In (Redirect Flow)**: `POST /api/auth/google/init` → Google OAuth 2.0 consent → `GET /api/auth/google/callback` → `firebase-admin` custom token (`avenora-ai`) exchanged server-side → sealed one-time ticket → `POST /api/auth/google/complete`. Eliminates popup blockers and cross-origin iframe hangs.
- **Per-User Firestore Isolation**: Every API endpoint validates `Authorization: Bearer <Firebase ID Token>` with `adminAuth.verifyIdToken()` and scopes reads/writes strictly to `users/{req.user.uid}/events/{eventId}/...`.
- **Server-Side Gemini Proxy**: All 8 Gemini AI tools execute on `backend/services/geminiService.js` with strict rate limiting (`express-rate-limit` with `ipKeyGenerator`), payload sanitization, and schema validation.

---

## Project Structure

```text
AVENORA-AI/
├── frontend/                         # Netlify Static Site (HTML5, CSS3, Vanilla JS)
│   ├── index.html, login.html, signup.html, dashboard.html, event.html,
│   │   budget.html, checklist.html, guests.html, vendors.html, timeline.html,
│   │   theme-studio.html, copilot.html, settings.html
│   ├── config/
│   │   └── apiConfig.js              # Centralized backend API_BASE_URL configuration
│   ├── css/                          # Design tokens, components, dashboard & responsive styles
│   ├── js/                           # Modular Vanilla JS controllers (zero Firebase SDK imports)
│   ├── assets/images/                # Editorial visual assets
│   ├── netlify.toml                  # Netlify build & header rules
│   ├── vite.config.mjs               # Multi-page asset bundler
│   ├── package.json
│   └── .env.example
├── backend/                          # Render Node.js + Express REST API
│   ├── server.js                     # Express entrypoint (PORT=5000 default)
│   ├── config/
│   │   ├── loadEnv.js                # Loads backend/.env before module init
│   │   └── firebaseAdmin.js          # Firebase Admin SDK locked to project avenora-ai
│   ├── middleware/
│   │   ├── authMiddleware.js         # Bearer ID token verification
│   │   └── errorMiddleware.js        # CORS allowlist, Helmet, IPv6-safe rate limiters, errors
│   ├── services/
│   │   ├── firebaseService.js        # Scoped Firestore Admin CRUD
│   │   └── geminiService.js          # Server-side @google/genai tools
│   ├── controllers/                  # REST controllers (auth, user, events, budget, checklist, guests, vendors, timeline, theme, copilot, ai)
│   ├── routes/                       # Express routers mapped to /api/*
│   ├── utils/
│   │   └── sanitize.js               # Input sanitization & Firestore timestamp serialization
│   ├── package.json
│   └── .env.example
├── firestore.rules                   # Cloud Firestore security rules for avenora-ai
├── firebase-blueprint.json           # Firestore schema blueprint
├── eslint.config.mjs                 # JS & Firestore rules linter configuration
└── package.json                      # Unified workspace scripts for local preview
```

---

## Local Development

### Prerequisites
- Node.js 20+
- Existing Firebase Project: **`avenora-ai`**
- Service account credentials + Web API key for `avenora-ai`, plus `GEMINI_API_KEY`

### 1. Configure Backend Environment
```bash
cp backend/.env.example backend/.env
```
Fill in `GEMINI_API_KEY`, `FIREBASE_PROJECT_ID=avenora-ai`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_WEB_API_KEY`, and (for Google Sign-In) `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`.

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

### Backend → Render (Web Service)
- **Root Directory**: `backend`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment Variables**:
  - `PORT=5000` (or Render's injected `PORT`)
  - `NODE_ENV=production`
  - `GEMINI_API_KEY=...`
  - `FIREBASE_PROJECT_ID=avenora-ai`
  - `FIREBASE_CLIENT_EMAIL=...`
  - `FIREBASE_PRIVATE_KEY=...`
  - `FIREBASE_WEB_API_KEY=...`
  - `GOOGLE_CLIENT_ID=...`
  - `GOOGLE_CLIENT_SECRET=...`
  - `FRONTEND_URL=https://<your-site>.netlify.app`
  - `BACKEND_URL=https://<your-render-service>.onrender.com`
- **Google OAuth Redirect URI**: Add `https://<your-render-service>.onrender.com/api/auth/google/callback` to Google Cloud Console → Credentials → Authorized redirect URIs.

### Frontend → Netlify (Static Site)
- **Base Directory**: `frontend`
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
- **Environment Variable**:
  - `VITE_API_BASE_URL=https://<your-render-service>.onrender.com`

---

<div align="center">

Crafted with quiet precision for unforgettable gatherings — **AVENORA AI**

</div>
