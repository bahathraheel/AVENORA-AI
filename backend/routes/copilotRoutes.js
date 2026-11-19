import express from 'express';
import {
  createChatHandler,
  listChatsHandler
} from '../controllers/copilotController.js';

const router = express.Router({ mergeParams: true });

router.get('/', listChatsHandler);
router.post('/', createChatHandler);

export default router;
