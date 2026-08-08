import { Router } from 'express';
import { requireUser } from '../middleware/requireUser.js';
import {
  getEmailApplications,
  markEmailApplicationRead,
  rejectEmailApplication,
  submitEmailApplicationToScreening,
} from '../controllers/emailApplicationsController.js';

const router = Router();

router.get('/', requireUser, getEmailApplications);
router.post('/:id/mark-read', requireUser, markEmailApplicationRead);
router.post('/:id/reject', requireUser, rejectEmailApplication);
router.post('/:id/submit-to-screening', requireUser, submitEmailApplicationToScreening);

export default router;
