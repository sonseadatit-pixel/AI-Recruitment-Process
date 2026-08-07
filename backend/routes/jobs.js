import { Router } from 'express';
import { getJobs, getJob, createJob, updateJob, deleteJob, generateDescription } from '../controllers/jobsController.js';

const router = Router();

router.get('/', getJobs);
router.post('/', createJob);
router.get('/:id', getJob);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);
router.post('/generate-description', generateDescription);

export default router;
