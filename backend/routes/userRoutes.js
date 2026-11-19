import express from 'express';
import {
  exportDataHandler,
  getProfileHandler,
  updateProfileHandler
} from '../controllers/userController.js';

const router = express.Router();

router.get('/me', getProfileHandler);
router.put('/me', updateProfileHandler);
router.get('/export', exportDataHandler);

export default router;
