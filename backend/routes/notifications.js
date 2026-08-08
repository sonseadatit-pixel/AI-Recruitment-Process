import { Router } from 'express';
import { requireUser } from '../middleware/requireUser.js';
import {
  getNotifications,
  markNotificationRead,
} from '../controllers/notificationsController.js';

const router = Router();

router.get('/', requireUser, getNotifications);
router.put('/:id/read', requireUser, markNotificationRead);

export default router;
