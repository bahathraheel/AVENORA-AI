import {
  createTask,
  createTasksBulk,
  deleteTask,
  listTasks,
  updateTask
} from '../services/firebaseService.js';

export async function listTasksHandler(req, res, next) {
  try {
    const tasks = await listTasks(req.user.uid, req.params.eventId);
    return res.json({ tasks });
  } catch (err) {
    return next(err);
  }
}

export async function createTaskHandler(req, res, next) {
  try {
    const task = await createTask(req.user.uid, req.params.eventId, req.body);
    return res.status(201).json({ task });
  } catch (err) {
    return next(err);
  }
}

export async function createTasksBulkHandler(req, res, next) {
  try {
    const tasks = await createTasksBulk(req.user.uid, req.params.eventId, req.body?.tasks || []);
    return res.status(201).json({ tasks });
  } catch (err) {
    return next(err);
  }
}

export async function updateTaskHandler(req, res, next) {
  try {
    const task = await updateTask(req.user.uid, req.params.eventId, req.params.taskId, req.body);
    return res.json({ task });
  } catch (err) {
    return next(err);
  }
}

export async function deleteTaskHandler(req, res, next) {
  try {
    const result = await deleteTask(req.user.uid, req.params.eventId, req.params.taskId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
