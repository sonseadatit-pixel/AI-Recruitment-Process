import { Router } from 'express';
import { requireUser } from '../middleware/requireUser.js';
import { getSettings, updateSettings } from '../controllers/settingsController.js';

const router = Router();

router.get('/', requireUser, getSettings);
router.put('/', requireUser, updateSettings);

export default router;
