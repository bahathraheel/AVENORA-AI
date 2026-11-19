import crypto from 'crypto';
import {
  adminAuth,
  assertFirebaseAdminReady,
  hasAdminCredentials
} from '../config/firebaseAdmin.js';
import { ensureUserProfile } from '../services/firebaseService.js';
import { sanitizeText } from '../utils/sanitize.js';

const PRODUCTION_VERCEL_ORIGIN = 'https://avenoraai3.vercel.app';
const usedOAuthJtis = new Map();

function getWebApiKey() {
  const key = (process.env.FIREBASE_WEB_API_KEY || '').trim();
  if (!key) {
    const err = new Error(
      'Backend Firebase Identity Toolkit key (FIREBASE_WEB_API_KEY) is not configured yet. Add it to Render backend environment variables.'
    );
    err.statusCode = 503;
    throw err;
  }
  return key;
}

function getServerSecretKey() {
  const seed =
    process.env.SESSION_SIGNING_SECRET ||
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.GEMINI_API_KEY ||
    `avenora-ephemeral-${process.pid}`;
  return crypto.createHash('sha256').update(seed).digest();
}

function sealPayload(obj) {
  const key = getServerSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function unsealPayload(token) {
  const buf = Buffer.from(String(token || ''), 'base64url');
  if (buf.length < 29) {
    throw new Error('Malformed OAuth token payload.');
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const key = getServerSecretKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function mapIdentityToolkitError(errCode = '', fallback = 'Authentication failed.') {
  const code = String(errCode).split(':')[0].trim();
  switch (code) {
    case 'OPERATION_NOT_ALLOWED':
      return {
        status: 403,
        message: 'Email/Password sign-in is disabled in Firebase Console (Authentication → Sign-in method → Email/Password).'
      };
    case 'EMAIL_EXISTS':
      return { status: 409, message: 'An account with this email already exists. Try signing in instead.' };
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
    case 'INVALID_LOGIN_CREDENTIALS':
      return { status: 401, message: 'Incorrect email or password. Double-check your credentials or reset your password.' };
    case 'USER_DISABLED':
      return { status: 403, message: 'This user account has been disabled.' };
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return { status: 429, message: 'Too many failed attempts. Please wait briefly before trying again.' };
    case 'INVALID_EMAIL':
      return { status: 400, message: 'Please provide a valid email address.' };
    case 'WEAK_PASSWORD':
      return { status: 400, message: 'Password must be at least 6 characters long.' };
    case 'API_KEY_INVALID':
      return { status: 503, message: 'Backend FIREBASE_WEB_API_KEY is invalid for project avenora-ai.' };
    default:
      return { status: 400, message: fallback };
  }
}

async function callIdentityToolkit(endpoint, body) {
  const apiKey = getWebApiKey();
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mapped = mapIdentityToolkitError(data?.error?.message, data?.error?.message || 'Firebase authentication failed.');
    const err = new Error(mapped.message);
    err.statusCode = mapped.status;
    err.code = data?.error?.message || 'auth/error';
    throw err;
  }
  return data;
}

function resolveAllowedFrontendOrigin(requestedOrigin, req) {
  const configured = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const allowed = Array.from(new Set([PRODUCTION_VERCEL_ORIGIN, ...configured]));
  const cleanRequested = String(requestedOrigin || '').trim().replace(/\/+$/, '');
  const isProd = process.env.NODE_ENV === 'production';

  if (cleanRequested) {
    if (allowed.includes(cleanRequested)) return cleanRequested;
    if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(cleanRequested)) {
      return cleanRequested;
    }
    const reqOrigin = `${req.protocol}://${req.get('host')}`;
    if (cleanRequested === reqOrigin) return cleanRequested;
  }

  return configured[0] || PRODUCTION_VERCEL_ORIGIN;
}

function resolveBackendBaseUrl(req) {
  const envUrl = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) return envUrl;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${String(proto).split(',')[0].trim()}://${req.get('host')}`;
}

export async function register(req, res, next) {
  try {
    assertFirebaseAdminReady();
    const displayName = sanitizeText(req.body?.displayName || '', 120);
    const email = sanitizeText(req.body?.email || '', 180).toLowerCase();
    const password = String(req.body?.password || '');

    if (!displayName || !email || password.length < 6) {
      return res.status(400).json({
        error: 'Display name, valid email, and a password of at least 6 characters are required.'
      });
    }

    const authData = await callIdentityToolkit('accounts:signUp', {
      email,
      password,
      returnSecureToken: true
    });

    let activeIdToken = authData.idToken;
    let activeRefreshToken = authData.refreshToken;
    let activeExpiresIn = Number(authData.expiresIn) || 3600;

    // Update displayName cleanly without requiring a service account private key
    const updatedAccount = await callIdentityToolkit('accounts:update', {
      idToken: activeIdToken,
      displayName,
      returnSecureToken: true
    }).catch(() => null);

    if (updatedAccount?.idToken) {
      activeIdToken = updatedAccount.idToken;
      activeRefreshToken = updatedAccount.refreshToken || activeRefreshToken;
      activeExpiresIn = Number(updatedAccount.expiresIn) || activeExpiresIn;
    } else if (hasAdminCredentials()) {
      await adminAuth.updateUser(authData.localId, { displayName }).catch(() => {});
    }

    const profile = await ensureUserProfile(
      {
        uid: authData.localId,
        email,
        displayName
      },
      activeIdToken
    );

    callIdentityToolkit('accounts:sendOobCode', {
      requestType: 'VERIFY_EMAIL',
      idToken: activeIdToken
    }).catch(() => {});

    return res.status(201).json({
      idToken: activeIdToken,
      refreshToken: activeRefreshToken,
      expiresIn: activeExpiresIn,
      user: {
        uid: authData.localId,
        email,
        displayName,
        emailVerified: false
      },
      profile
    });
  } catch (err) {
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    assertFirebaseAdminReady();
    const email = sanitizeText(req.body?.email || '', 180).toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const authData = await callIdentityToolkit('accounts:signInWithPassword', {
      email,
      password,
      returnSecureToken: true
    });

    // Keyless lookup via user ID token (works even without service account private key)
    const lookupRes = await callIdentityToolkit('accounts:lookup', {
      idToken: authData.idToken
    }).catch(() => null);
    const accountInfo = lookupRes?.users?.[0] || {};

    const resolvedEmail = accountInfo.email || authData.email || email;
    const resolvedName = accountInfo.displayName || authData.displayName || '';
    const emailVerified = Boolean(accountInfo.emailVerified);

    const profile = await ensureUserProfile(
      {
        uid: authData.localId,
        email: resolvedEmail,
        displayName: resolvedName
      },
      authData.idToken
    );

    return res.json({
      idToken: authData.idToken,
      refreshToken: authData.refreshToken,
      expiresIn: Number(authData.expiresIn) || 3600,
      user: {
        uid: authData.localId,
        email: resolvedEmail,
        displayName: resolvedName || profile.displayName,
        emailVerified
      },
      profile
    });
  } catch (err) {
    return next(err);
  }
}

export async function refreshSession(req, res, next) {
  try {
    const refreshToken = sanitizeText(req.body?.refreshToken || '', 4096);
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }

    const apiKey = getWebApiKey();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !data.id_token) {
      return res.status(401).json({ error: 'Session refresh expired. Please sign in again.' });
    }

    return res.json({
      idToken: data.id_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: Number(data.expires_in) || 3600
    });
  } catch (err) {
    return next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const email = sanitizeText(req.body?.email || req.user?.email || '', 180).toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Please provide an email address.' });
    }

    await callIdentityToolkit('accounts:sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email
    });

    return res.json({
      ok: true,
      message: `Password reset instructions sent to ${email}.`
    });
  } catch (err) {
    return next(err);
  }
}

export async function resendVerification(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.slice(7).trim();
    await callIdentityToolkit('accounts:sendOobCode', {
      requestType: 'VERIFY_EMAIL',
      idToken
    });
    return res.json({ ok: true, message: 'Verification email dispatched.' });
  } catch (err) {
    return next(err);
  }
}

export async function googleAuthInit(req, res, next) {
  try {
    assertFirebaseAdminReady();
    getWebApiKey();

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      return res.status(503).json({
        error: 'Google OAuth is not configured on the backend yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Render environment variables.'
      });
    }

    const frontendOrigin = resolveAllowedFrontendOrigin(req.body?.origin, req);
    const redirectPathRaw = String(req.body?.redirectPath || '/dashboard.html');
    const redirectPath = redirectPathRaw.startsWith('/') && !redirectPathRaw.startsWith('//') ? redirectPathRaw : '/dashboard.html';
    const callbackUrl = `${resolveBackendBaseUrl(req)}/api/auth/google/callback`;

    const state = sealPayload({
      origin: frontendOrigin,
      redirectPath,
      nonce: crypto.randomBytes(12).toString('hex'),
      exp: Date.now() + 10 * 60 * 1000
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state
    });

    return res.json({
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    });
  } catch (err) {
    return next(err);
  }
}

export async function googleAuthCallback(req, res) {
  let targetOrigin = resolveAllowedFrontendOrigin('', req);
  try {
    const rawState = String(req.query?.state || '');
    const state = unsealPayload(rawState);
    if (!state?.origin || !state?.exp || Date.now() > state.exp) {
      throw new Error('Google sign-in state expired. Please try again.');
    }
    targetOrigin = resolveAllowedFrontendOrigin(state.origin, req);

    if (req.query?.error) {
      const reason = req.query.error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in error: ${req.query.error}`;
      return res.redirect(`${targetOrigin}/login.html#oauth_error=${encodeURIComponent(reason)}`);
    }

    const code = String(req.query?.code || '');
    if (!code) {
      throw new Error('Missing authorization code from Google.');
    }

    assertFirebaseAdminReady();
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const callbackUrl = `${resolveBackendBaseUrl(req)}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code'
      }).toString()
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || (!tokenData.id_token && !tokenData.access_token)) {
      throw new Error(tokenData.error_description || 'Failed to exchange Google authorization code.');
    }

    // Keyless Firebase sign-in via Identity Toolkit signInWithIdp (requires zero service account private key)
    const idpPostBody = tokenData.id_token
      ? `id_token=${encodeURIComponent(tokenData.id_token)}&providerId=google.com`
      : `access_token=${encodeURIComponent(tokenData.access_token)}&providerId=google.com`;

    const session = await callIdentityToolkit('accounts:signInWithIdp', {
      postBody: idpPostBody,
      requestUri: targetOrigin,
      returnIdpCredential: true,
      returnSecureToken: true
    });

    const uid = session.localId;
    const email = String(session.email || '').toLowerCase();
    const displayName = sanitizeText(session.displayName || session.fullName || email.split('@')[0] || 'Event Planner', 120);

    const profile = await ensureUserProfile(
      {
        uid,
        email,
        displayName
      },
      session.idToken
    );

    const jti = crypto.randomBytes(16).toString('hex');
    const ticket = sealPayload({
      jti,
      exp: Date.now() + 90 * 1000,
      redirectPath: state.redirectPath || '/dashboard.html',
      payload: {
        idToken: session.idToken,
        refreshToken: session.refreshToken,
        expiresIn: Number(session.expiresIn) || 3600,
        user: {
          uid,
          email,
          displayName: displayName || profile.displayName,
          emailVerified: Boolean(session.emailVerified)
        },
        profile
      }
    });

    return res.redirect(`${targetOrigin}/login.html#oauth_ticket=${encodeURIComponent(ticket)}`);
  } catch (err) {
    console.error('[Google OAuth Callback Error]', err.message);
    return res.redirect(`${targetOrigin}/login.html#oauth_error=${encodeURIComponent(err.message || 'Google authentication failed.')}`);
  }
}

export async function googleAuthComplete(req, res, next) {
  try {
    const ticket = String(req.body?.ticket || '');
    if (!ticket) {
      return res.status(400).json({ error: 'Missing OAuth ticket.' });
    }

    const decoded = unsealPayload(ticket);
    if (!decoded?.exp || Date.now() > decoded.exp) {
      return res.status(401).json({ error: 'Google sign-in ticket expired. Please sign in again.' });
    }

    const now = Date.now();
    for (const [k, exp] of usedOAuthJtis.entries()) {
      if (exp < now) usedOAuthJtis.delete(k);
    }
    if (usedOAuthJtis.has(decoded.jti)) {
      return res.status(401).json({ error: 'This sign-in link has already been redeemed.' });
    }
    usedOAuthJtis.set(decoded.jti, decoded.exp);

    return res.json({
      ...decoded.payload,
      redirectPath: decoded.redirectPath || '/dashboard.html'
    });
  } catch (err) {
    return next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const profile = await ensureUserProfile(
      {
        uid: req.user.uid,
        email: req.user.email,
        displayName: req.user.displayName
      },
      req.idToken
    );

    let userRecord = null;
    if (hasAdminCredentials()) {
      try {
        userRecord = await adminAuth.getUser(req.user.uid);
      } catch {
        userRecord = null;
      }
    }

    return res.json({
      user: {
        uid: req.user.uid,
        email: userRecord?.email || req.user.email || '',
        displayName: userRecord?.displayName || profile.displayName || '',
        emailVerified: Boolean(userRecord?.emailVerified ?? req.user.emailVerified)
      },
      profile
    });
  } catch (err) {
    return next(err);
  }
}
