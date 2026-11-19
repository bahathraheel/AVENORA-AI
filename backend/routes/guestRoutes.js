import express from 'express';
import {
  createGuestHandler,
  deleteGuestHandler,
  listGuestsHandler,
  updateGuestHandler
} from '../controllers/guestController.js';

const router = express.Router({ mergeParams: true });

router.get('/', listGuestsHandler);
router.post('/', createGuestHandler);
router.put('/:guestId', updateGuestHandler);
router.delete('/:guestId', deleteGuestHandler);

export default router;
