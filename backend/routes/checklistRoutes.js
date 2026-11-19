import express from 'express';
import {
  createTaskHandler,
  createTasksBulkHandler,
  deleteTaskHandler,
  listTasksHandler,
  updateTaskHandler
} from '../controllers/checklistController.js';

const router = express.Router({ mergeParams: true });

router.get('/', listTasksHandler);
router.post('/', createTaskHandler);
router.post('/bulk', createTasksBulkHandler);
router.put('/:taskId', updateTaskHandler);
router.delete('/:taskId', deleteTaskHandler);

export default router;
