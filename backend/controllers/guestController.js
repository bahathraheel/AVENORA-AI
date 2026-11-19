import {
  createGuest,
  deleteGuest,
  listGuests,
  updateGuest
} from '../services/firebaseService.js';

export async function listGuestsHandler(req, res, next) {
  try {
    const guests = await listGuests(req.user.uid, req.params.eventId);
    return res.json({ guests });
  } catch (err) {
    return next(err);
  }
}

export async function createGuestHandler(req, res, next) {
  try {
    const guest = await createGuest(req.user.uid, req.params.eventId, req.body);
    return res.status(201).json({ guest });
  } catch (err) {
    return next(err);
  }
}

export async function updateGuestHandler(req, res, next) {
  try {
    const guest = await updateGuest(req.user.uid, req.params.eventId, req.params.guestId, req.body);
    return res.json({ guest });
  } catch (err) {
    return next(err);
  }
}

export async function deleteGuestHandler(req, res, next) {
  try {
    const result = await deleteGuest(req.user.uid, req.params.eventId, req.params.guestId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
