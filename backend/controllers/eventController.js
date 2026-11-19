import {
  createEvent,
  deleteEvent,
  getEvent,
  getEventWorkspaceSnapshot,
  listEvents,
  updateEvent,
  updateEventBlueprint
} from '../services/firebaseService.js';

export async function listEventsHandler(req, res, next) {
  try {
    const events = await listEvents(req.user.uid);
    return res.json({ events });
  } catch (err) {
    return next(err);
  }
}

export async function getEventHandler(req, res, next) {
  try {
    const event = await getEvent(req.user.uid, req.params.eventId);
    return res.json({ event });
  } catch (err) {
    return next(err);
  }
}

export async function getEventSummaryHandler(req, res, next) {
  try {
    const snapshot = await getEventWorkspaceSnapshot(req.user.uid, req.params.eventId);
    return res.json(snapshot);
  } catch (err) {
    return next(err);
  }
}

export async function createEventHandler(req, res, next) {
  try {
    const event = await createEvent(req.user.uid, req.body);
    return res.status(201).json({ event });
  } catch (err) {
    return next(err);
  }
}

export async function updateEventHandler(req, res, next) {
  try {
    const event = await updateEvent(req.user.uid, req.params.eventId, req.body);
    return res.json({ event });
  } catch (err) {
    return next(err);
  }
}

export async function updateBlueprintHandler(req, res, next) {
  try {
    const event = await updateEventBlueprint(req.user.uid, req.params.eventId, req.body?.blueprint);
    return res.json({ event });
  } catch (err) {
    return next(err);
  }
}

export async function deleteEventHandler(req, res, next) {
  try {
    const result = await deleteEvent(req.user.uid, req.params.eventId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
