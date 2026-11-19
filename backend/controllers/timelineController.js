import {
  createTimelineBulk,
  createTimelineItem,
  deleteTimelineItem,
  listTimeline,
  reorderTimelineItems,
  updateTimelineItem
} from '../services/firebaseService.js';

export async function listTimelineHandler(req, res, next) {
  try {
    const items = await listTimeline(req.user.uid, req.params.eventId);
    return res.json({ items });
  } catch (err) {
    return next(err);
  }
}

export async function createTimelineHandler(req, res, next) {
  try {
    const item = await createTimelineItem(req.user.uid, req.params.eventId, req.body);
    return res.status(201).json({ item });
  } catch (err) {
    return next(err);
  }
}

export async function createTimelineBulkHandler(req, res, next) {
  try {
    const items = await createTimelineBulk(
      req.user.uid,
      req.params.eventId,
      req.body?.items || [],
      Number(req.body?.baseIndex) || 0
    );
    return res.status(201).json({ items });
  } catch (err) {
    return next(err);
  }
}

export async function updateTimelineHandler(req, res, next) {
  try {
    const item = await updateTimelineItem(req.user.uid, req.params.eventId, req.params.timelineId, req.body);
    return res.json({ item });
  } catch (err) {
    return next(err);
  }
}

export async function reorderTimelineHandler(req, res, next) {
  try {
    const items = await reorderTimelineItems(req.user.uid, req.params.eventId, req.body?.pairs || []);
    return res.json({ items });
  } catch (err) {
    return next(err);
  }
}

export async function deleteTimelineHandler(req, res, next) {
  try {
    const result = await deleteTimelineItem(req.user.uid, req.params.eventId, req.params.timelineId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
