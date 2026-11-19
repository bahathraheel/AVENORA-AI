import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile
} from 'firebase/auth';
import {
  assertFirebaseConfigured,
  auth,
  googleProvider,
  isFirebaseConfigReady,
  mapFirebaseAuthError,
  waitForAuthReady
} from '../config/firebaseConfig.js';
import { apiRequest } from './api.js';
import { renderIcons, setButtonLoading, showToast } from './main.js';

function getPostAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return '/dashboard.html';
}

async function finalizeAuthenticatedSession(firebaseUser) {
  await firebaseUser.getIdToken(true);
  await apiRequest('/api/auth/me');
  window.location.href = getPostAuthRedirect();
}

async function initAuthPages() {
  renderIcons();

  const statusBanner = document.getElementById('auth-status-banner');
  const showAuthMessage = (msg, isError = true) => {
    if (!statusBanner) return;
    statusBanner.style.display = 'block';
    statusBanner.textContent = msg;
    statusBanner.className = isError ? 'auth-alert auth-alert-error' : 'auth-alert auth-alert-success';
  };

  if (!isFirebaseConfigReady()) {
    showAuthMessage(
      'Firebase Authentication is not configured in this build yet. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID for project avenora-ai in Vercel.',
      true
    );
  } else {
    try {
      const redirectResult = await getRedirectResult(auth);
      if (redirectResult?.user) {
        showAuthMessage('Completing Google sign-in...', false);
        await finalizeAuthenticatedSession(redirectResult.user);
        return;
      }
    } catch (err) {
      showAuthMessage(mapFirebaseAuthError(err, 'Google sign-in could not be completed.'), true);
    }

    const existingUser = await waitForAuthReady();
    if (existingUser) {
      try {
        await existingUser.getIdToken();
        await apiRequest('/api/auth/me');
        window.location.href = getPostAuthRedirect();
        return;
      } catch {
        // Backend verification failed or expired; stay on auth page cleanly
      }
    }
  }

  const googleBtn = document.getElementById('google-auth-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      setButtonLoading(googleBtn, true, 'Signing in with Google...');
      try {
        assertFirebaseConfigured();
        const credential = await signInWithPopup(auth, googleProvider);
        showAuthMessage('Google account verified. Opening workspace...', false);
        await finalizeAuthenticatedSession(credential.user);
      } catch (err) {
        if (err?.code === 'auth/popup-blocked') {
          showAuthMessage(mapFirebaseAuthError(err), false);
          try {
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch (redirectErr) {
            showAuthMessage(mapFirebaseAuthError(redirectErr, 'Unable to start Google Sign-In.'), true);
          }
        } else {
          showAuthMessage(mapFirebaseAuthError(err, 'Unable to complete Google Sign-In.'), true);
        }
        setButtonLoading(googleBtn, false);
      }
    });
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = document.getElementById('login-submit-btn');

      if (!email || !password) {
        showAuthMessage('Please enter both your email and password.');
        return;
      }

      setButtonLoading(submitBtn, true, 'Signing in...');
      try {
        assertFirebaseConfigured();
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await finalizeAuthenticatedSession(credential.user);
      } catch (err) {
        showAuthMessage(mapFirebaseAuthError(err, 'Sign in failed. Please try again.'), true);
        setButtonLoading(submitBtn, false);
      }
    });

    const resetBtn = document.getElementById('reset-password-btn');
    resetBtn?.addEventListener('click', async () => {
      const email = document.getElementById('login-email').value.trim();
      if (!email) {
        showAuthMessage('Enter your email address above first, then click Reset Password.');
        return;
      }
      resetBtn.disabled = true;
      try {
        assertFirebaseConfigured();
        await sendPasswordResetEmail(auth, email);
        showAuthMessage(`Password reset instructions sent to ${email}.`, false);
        showToast('Password reset email dispatched.', 'success');
      } catch (err) {
        showAuthMessage(mapFirebaseAuthError(err, 'Unable to send reset email.'), true);
      } finally {
        resetBtn.disabled = false;
      }
    });
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const confirm = document.getElementById('signup-confirm').value;
      const submitBtn = document.getElementById('signup-submit-btn');

      if (!displayName || !email || password.length < 6) {
        showAuthMessage('Please enter your name, a valid email, and a password of at least 6 characters.');
        return;
      }
      if (password !== confirm) {
        showAuthMessage('Passwords do not match.');
        return;
      }

      setButtonLoading(submitBtn, true, 'Creating account...');
      try {
        assertFirebaseConfigured();
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName });
        sendEmailVerification(credential.user).catch(() => {});
        await finalizeAuthenticatedSession(credential.user);
      } catch (err) {
        showAuthMessage(mapFirebaseAuthError(err, 'Account creation failed. Please try again.'), true);
        setButtonLoading(submitBtn, false);
      }
    });
  }
}

initAuthPages();
