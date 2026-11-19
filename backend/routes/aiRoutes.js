import express from 'express';
import {
  budgetAdvisorHandler,
  chatHandler,
  createEventPlanHandler,
  generateInvitationHandler,
  generateTasksHandler,
  generateThemeHandler,
  generateTimelineHandler,
  generateVendorEmailHandler
} from '../controllers/aiController.js';

const router = express.Router();

router.post('/create-event-plan', createEventPlanHandler);
router.post('/chat', chatHandler);
router.post('/budget-advisor', budgetAdvisorHandler);
router.post('/generate-tasks', generateTasksHandler);
router.post('/generate-theme', generateThemeHandler);
router.post('/generate-invitation', generateInvitationHandler);
router.post('/generate-vendor-email', generateVendorEmailHandler);
router.post('/generate-timeline', generateTimelineHandler);

export default router;
