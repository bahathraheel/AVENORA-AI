import { createTheme, deleteTheme, listThemes } from '../services/firebaseService.js';

export async function listThemesHandler(req, res, next) {
  try {
    const themes = await listThemes(req.user.uid, req.params.eventId);
    return res.json({ themes });
  } catch (err) {
    return next(err);
  }
}

export async function createThemeHandler(req, res, next) {
  try {
    const theme = await createTheme(req.user.uid, req.params.eventId, req.body);
    return res.status(201).json({ theme });
  } catch (err) {
    return next(err);
  }
}

export async function deleteThemeHandler(req, res, next) {
  try {
    const result = await deleteTheme(req.user.uid, req.params.eventId, req.params.themeId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
