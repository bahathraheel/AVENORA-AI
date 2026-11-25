import express from 'express';
import { getMe } from '../controllers/authController.js';
import { verifyAuthToken } from '../middleware/authMiddleware.js';
import { apiRateLimiter } from '../middleware/errorMiddleware.js';

const router = express.Router();

router.get('/me', verifyAuthToken, apiRateLimiter, getMe);

export default router;
