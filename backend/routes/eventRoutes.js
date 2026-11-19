import express from 'express';
import {
  createEventHandler,
  deleteEventHandler,
  getEventHandler,
  getEventSummaryHandler,
  listEventsHandler,
  updateBlueprintHandler,
  updateEventHandler
} from '../controllers/eventController.js';

const router = express.Router();

router.get('/', listEventsHandler);
router.post('/', createEventHandler);
router.get('/:eventId', getEventHandler);
router.get('/:eventId/summary', getEventSummaryHandler);
router.put('/:eventId', updateEventHandler);
router.put('/:eventId/blueprint', updateBlueprintHandler);
router.delete('/:eventId', deleteEventHandler);

export default router;
