import { createChatTurn, listChats } from '../services/firebaseService.js';

export async function listChatsHandler(req, res, next) {
  try {
    const messages = await listChats(req.user.uid, req.params.eventId);
    return res.json({ messages });
  } catch (err) {
    return next(err);
  }
}

export async function createChatHandler(req, res, next) {
  try {
    const turn = await createChatTurn(req.user.uid, req.params.eventId, req.body);
    return res.status(201).json({ turn });
  } catch (err) {
    return next(err);
  }
}
