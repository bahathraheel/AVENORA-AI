import { adminAuth, assertFirebaseAdminReady } from '../config/firebaseAdmin.js';

export async function verifyAuthToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Please sign in to continue.'
    });
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken || idToken.length > 8192) {
    return res.status(401).json({
      error: 'Invalid authentication token format.'
    });
  }

  try {
    assertFirebaseAdminReady();
    const decoded = await adminAuth.verifyIdToken(idToken, false);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      displayName: decoded.name || null,
      emailVerified: Boolean(decoded.email_verified),
      provider: decoded.firebase?.sign_in_provider || 'password'
    };
    return next();
  } catch (err) {
    if (err?.statusCode === 503) {
      return res.status(503).json({ error: err.message });
    }
    return res.status(401).json({
      error: 'Your session expired or is invalid. Please sign in again.',
      code: err?.code || 'auth/invalid-token'
    });
  }
}
