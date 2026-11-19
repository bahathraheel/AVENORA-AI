import { adminAuth, hasAdminCredentials } from '../config/firebaseAdmin.js';
import { ensureUserProfile, exportAllUserData, updateUserProfile } from '../services/firebaseService.js';
import { sanitizeText } from '../utils/sanitize.js';

export async function getProfileHandler(req, res, next) {
  try {
    const profile = await ensureUserProfile(
      {
        uid: req.user.uid,
        email: req.user.email,
        displayName: req.user.displayName
      },
      req.idToken
    );
    return res.json({ profile });
  } catch (err) {
    return next(err);
  }
}

export async function updateProfileHandler(req, res, next) {
  try {
    const displayName = sanitizeText(req.body?.displayName || '', 120);
    if (!displayName) {
      return res.status(400).json({ error: 'Display name cannot be empty.' });
    }

    if (hasAdminCredentials()) {
      await adminAuth.updateUser(req.user.uid, { displayName }).catch(() => {});
    }

    const profile = await updateUserProfile(req.user.uid, req.body, req.idToken);
    return res.json({ profile });
  } catch (err) {
    return next(err);
  }
}

export async function exportDataHandler(req, res, next) {
  try {
    const archive = await exportAllUserData(req.user.uid, req.idToken);
    return res.json(archive);
  } catch (err) {
    return next(err);
  }
}
