import {
  createExpense,
  deleteExpense,
  listExpenses,
  listVendors,
  updateExpense
} from '../services/firebaseService.js';

export async function listExpensesHandler(req, res, next) {
  try {
    const [expenses, vendors] = await Promise.all([
      listExpenses(req.user.uid, req.params.eventId),
      listVendors(req.user.uid, req.params.eventId)
    ]);
    return res.json({ expenses, vendors });
  } catch (err) {
    return next(err);
  }
}

export async function createExpenseHandler(req, res, next) {
  try {
    const expense = await createExpense(req.user.uid, req.params.eventId, req.body);
    return res.status(201).json({ expense });
  } catch (err) {
    return next(err);
  }
}

export async function updateExpenseHandler(req, res, next) {
  try {
    const expense = await updateExpense(req.user.uid, req.params.eventId, req.params.expenseId, req.body);
    return res.json({ expense });
  } catch (err) {
    return next(err);
  }
}

export async function deleteExpenseHandler(req, res, next) {
  try {
    const result = await deleteExpense(req.user.uid, req.params.eventId, req.params.expenseId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
