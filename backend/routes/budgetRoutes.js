import express from 'express';
import {
  createExpenseHandler,
  deleteExpenseHandler,
  listExpensesHandler,
  updateExpenseHandler
} from '../controllers/budgetController.js';

const router = express.Router({ mergeParams: true });

router.get('/', listExpensesHandler);
router.post('/', createExpenseHandler);
router.put('/:expenseId', updateExpenseHandler);
router.delete('/:expenseId', deleteExpenseHandler);

export default router;
