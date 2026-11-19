import {
  adminAuth,
  hasAdminCredentials
} from '../config/firebaseAdmin.js';
import { ensureUserProfile } from '../services/firebaseService.js';

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
