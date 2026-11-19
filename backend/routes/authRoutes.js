import express from 'express';
import {
  getMe,
  googleAuthCallback,
  googleAuthComplete,
  googleAuthInit,
  login,
  refreshSession,
  register,
  resendVerification,
  resetPassword
} from '../controllers/authController.js';
import { verifyAuthToken } from '../middleware/authMiddleware.js';
import { authRateLimiter } from '../middleware/errorMiddleware.js';

const router = express.Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', authRateLimiter, refreshSession);
router.post('/reset-password', authRateLimiter, resetPassword);
router.post('/resend-verification', authRateLimiter, verifyAuthToken, resendVerification);
router.post('/google/init', authRateLimiter, googleAuthInit);
router.get('/google/callback', googleAuthCallback);
router.post('/google/complete', authRateLimiter, googleAuthComplete);
router.get('/me', verifyAuthToken, getMe);

export default router;
