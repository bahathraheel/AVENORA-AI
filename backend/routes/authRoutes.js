import express from 'express';
import { getMe } from '../controllers/authController.js';
import { verifyAuthToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', verifyAuthToken, getMe);

export default router;
