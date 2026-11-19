import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
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

function buildCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      return cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: parsed.client_email,
        privateKey: String(parsed.private_key || '').replace(/\\n/g, '\n')
      });
    } catch (err) {
      console.error('[Firebase Admin] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
    }
  }

  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || '';
  if (clientEmail && privateKeyRaw) {
    return cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n')
    });
  }

  return null;
}

let firebaseApp = null;
let adminAuth = null;
let adminDb = null;
let hasServiceAccount = false;
let initError = null;

try {
  const credential = buildCredential();
  hasServiceAccount = Boolean(credential);

  if (getApps().length > 0) {
    firebaseApp = getApp();
  } else if (credential) {
    firebaseApp = initializeApp({
      credential,
      projectId: FIREBASE_PROJECT_ID
    });
  } else {
    firebaseApp = initializeApp({
      projectId: FIREBASE_PROJECT_ID
    });
  }

  adminAuth = getAuth(firebaseApp);
  const databaseId = (process.env.FIREBASE_DATABASE_ID || '').trim();
  adminDb =
    databaseId && databaseId !== '(default)'
      ? getFirestore(firebaseApp, databaseId)
      : getFirestore(firebaseApp);

  try {
    adminDb.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Firestore instance already configured in hot reload/watch mode
  }
} catch (err) {
  initError = err;
  console.error('[Firebase Admin] Initialization failed:', err.message);
}

export function getFirebaseHealth() {
  return {
    projectId: FIREBASE_PROJECT_ID,
    authReady: Boolean(adminAuth),
    firestoreReady: Boolean(adminDb),
    hasServiceAccount,
    hasWebApiKey: Boolean((process.env.FIREBASE_WEB_API_KEY || '').trim()),
    error: initError ? initError.message : null
  };
}

export function assertFirebaseAdminReady() {
  if (!adminAuth || !adminDb) {
    const err = new Error(
      'Firebase Admin SDK is not initialized. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY on the backend.'
    );
    err.statusCode = 503;
    throw err;
  }
}

export { firebaseApp, adminAuth, adminDb };
