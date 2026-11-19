import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const REQUIRED_FIREBASE_PROJECT_ID = 'avenora-ai';

const configuredProjectId = (process.env.FIREBASE_PROJECT_ID || REQUIRED_FIREBASE_PROJECT_ID).trim();
if (configuredProjectId !== REQUIRED_FIREBASE_PROJECT_ID) {
  console.warn(
    `[Firebase Admin] Overriding FIREBASE_PROJECT_ID ("${configuredProjectId}") to required project "${REQUIRED_FIREBASE_PROJECT_ID}".`
  );
}

export const FIREBASE_PROJECT_ID = REQUIRED_FIREBASE_PROJECT_ID;

function hasKeylessAdcEnvironment() {
  return Boolean(
    (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim() ||
      (process.env.K_SERVICE || '').trim() ||
      (process.env.GAE_ENV || '').trim() ||
      (process.env.GOOGLE_CLOUD_PROJECT || '').trim()
  );
}

function buildCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (parsed?.client_email && parsed?.private_key) {
        return {
          mode: 'service-account',
          credential: cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: parsed.client_email,
            privateKey: String(parsed.private_key).replace(/\\n/g, '\n')
          })
        };
      }
    } catch (err) {
      console.error('[Firebase Admin] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
    }
  }

  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || '';
  if (clientEmail && privateKeyRaw) {
    return {
      mode: 'service-account',
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, '\n')
      })
    };
  }

  // Supported keyless Google Cloud auth (Workload Identity Federation JSON via GOOGLE_APPLICATION_CREDENTIALS or GCP runtime metadata)
  if (hasKeylessAdcEnvironment()) {
    try {
      return {
        mode: 'workload-identity-adc',
        credential: applicationDefault()
      };
    } catch (err) {
      console.warn('[Firebase Admin] Application Default Credentials unavailable:', err.message);
    }
  }

  return {
    mode: 'user-token-rest',
    credential: null
  };
}

let firebaseApp = null;
let adminAuth = null;
let adminDb = null;
let authMode = 'user-token-rest';
let adminCredentialsAvailable = false;
let initError = null;

try {
  const { mode, credential } = buildCredential();
  authMode = mode;
  adminCredentialsAvailable = Boolean(credential);

  if (getApps().length > 0) {
    firebaseApp = getApp();
  } else if (credential) {
    firebaseApp = initializeApp({
      credential,
      projectId: FIREBASE_PROJECT_ID
    });
  } else {
    // Initializes project-scoped ID token verification (uses public Google certificates; no private key needed)
    firebaseApp = initializeApp({
      projectId: FIREBASE_PROJECT_ID
    });
  }

  adminAuth = getAuth(firebaseApp);

  if (adminCredentialsAvailable) {
    const databaseId = getFirebaseDatabaseId();
    adminDb =
      databaseId && databaseId !== '(default)'
        ? getFirestore(firebaseApp, databaseId)
        : getFirestore(firebaseApp);

    try {
      adminDb.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Firestore instance already configured in hot reload/watch mode
    }
  }
} catch (err) {
  initError = err;
  console.error('[Firebase Admin] Initialization failed:', err.message);
}

export function getFirebaseDatabaseId() {
  return (process.env.FIREBASE_DATABASE_ID || '').trim() || '(default)';
}

export function hasAdminCredentials() {
  return adminCredentialsAvailable && Boolean(adminDb);
}

export function getFirebaseHealth() {
  return {
    projectId: FIREBASE_PROJECT_ID,
    authVerifierReady: Boolean(adminAuth),
    firestoreMode: authMode,
    hasAdminCredentials: adminCredentialsAvailable
  };
}

export function assertFirebaseAdminReady() {
  if (!adminAuth || initError) {
    const err = new Error(
      'Firebase authentication verifier is unavailable for project avenora-ai.'
    );
    err.statusCode = 503;
    throw err;
  }
}

export { firebaseApp, adminAuth, adminDb };
