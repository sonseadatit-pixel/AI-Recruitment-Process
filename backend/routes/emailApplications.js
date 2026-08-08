import { Router } from 'express';
import { requireUser } from '../middleware/requireUser.js';
import {
  getEmailApplications,
  submitEmailApplicationToScreening,
} from '../controllers/emailApplicationsController.js';

const router = Router();

router.get('/', requireUser, getEmailApplications);
router.post('/:id/submit-to-screening', requireUser, submitEmailApplicationToScreening);

export default router;
