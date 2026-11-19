import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged
} from 'firebase/auth';

export const FIREBASE_PROJECT_ID = 'avenora-ai';

function getRuntimeFirebaseConfig() {
  const runtime =
    typeof window !== 'undefined' && window.__AVENORA_FIREBASE_CONFIG__
      ? window.__AVENORA_FIREBASE_CONFIG__
      : {};
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

  const configuredProjectId = String(
    runtime.projectId || env.VITE_FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID
  ).trim();

  if (configuredProjectId && configuredProjectId !== FIREBASE_PROJECT_ID) {
    console.warn(
      `[AVENORA Auth] Enforcing mandatory Firebase project "${FIREBASE_PROJECT_ID}" instead of "${configuredProjectId}".`
    );
  }

  return {
    apiKey: String(runtime.apiKey || env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: String(
      runtime.authDomain || env.VITE_FIREBASE_AUTH_DOMAIN || `${FIREBASE_PROJECT_ID}.firebaseapp.com`
    ).trim(),
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: String(
      runtime.storageBucket || env.VITE_FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.firebasestorage.app`
    ).trim(),
    messagingSenderId: String(
      runtime.messagingSenderId || env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''
    ).trim(),
    appId: String(runtime.appId || env.VITE_FIREBASE_APP_ID || '').trim(),
    ...(runtime.measurementId || env.VITE_FIREBASE_MEASUREMENT_ID
      ? { measurementId: String(runtime.measurementId || env.VITE_FIREBASE_MEASUREMENT_ID).trim() }
      : {})
  };
}

const firebaseConfig = getRuntimeFirebaseConfig();
const configReady = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

let app = null;
let auth = null;
let googleProvider = null;

if (configReady) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
}

export { app, auth, googleProvider };

export function isFirebaseConfigReady() {
  return configReady && Boolean(auth);
}

export function assertFirebaseConfigured() {
  if (!isFirebaseConfigReady()) {
    throw new Error(
      'Firebase Web SDK configuration is missing for project "avenora-ai". Set VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID in your Vercel environment variables.'
    );
  }
}

export async function waitForAuthReady() {
  if (!auth) return null;
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
    return auth.currentUser;
  }
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

export async function getFirebaseIdToken(forceRefresh = false) {
  const user = (auth && auth.currentUser) || (await waitForAuthReady());
  if (!user) return '';
  return user.getIdToken(forceRefresh);
}

export function mapFirebaseAuthError(err, fallback = 'Authentication failed. Please try again.') {
  const code = err?.code || '';
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before finishing. Please try again.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in popup is already open. Please complete or close it first.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Redirecting you to Google Sign-In...';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication. Add your Vercel domain under Firebase Console → Authentication → Settings → Authorized domains for project avenora-ai.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is disabled in Firebase Console (Authentication → Sign-in method) for project avenora-ai.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Double-check your credentials or reset your password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This user account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many attempts detected. Please wait briefly before trying again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase Authentication. Check your connection and try again.';
    case 'auth/invalid-api-key':
      return 'Firebase Web API key is invalid for project avenora-ai. Check VITE_FIREBASE_API_KEY in Vercel.';
    default:
      return err?.message || fallback;
  }
}
