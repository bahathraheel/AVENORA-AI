import express from 'express';
import {
  createThemeHandler,
  deleteThemeHandler,
  listThemesHandler
} from '../controllers/themeController.js';

const router = express.Router({ mergeParams: true });

router.get('/', listThemesHandler);
router.post('/', createThemeHandler);
router.delete('/:themeId', deleteThemeHandler);

export default router;
