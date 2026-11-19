import express from 'express';
import {
  createTimelineBulkHandler,
  createTimelineHandler,
  deleteTimelineHandler,
  listTimelineHandler,
  reorderTimelineHandler,
  updateTimelineHandler
} from '../controllers/timelineController.js';

const router = express.Router({ mergeParams: true });

router.get('/', listTimelineHandler);
router.post('/', createTimelineHandler);
router.post('/bulk', createTimelineBulkHandler);
router.put('/reorder', reorderTimelineHandler);
router.put('/:timelineId', updateTimelineHandler);
router.delete('/:timelineId', deleteTimelineHandler);

export default router;
