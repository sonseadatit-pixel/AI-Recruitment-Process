import { Router } from 'express';
import multer from 'multer';
import { screenResumes, runScreening, getScreeningResults } from '../controllers/screeningController.js';
import { requireUser } from '../middleware/requireUser.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/batch', upload.array('resumes'), screenResumes);
router.post('/run', requireUser, runScreening);
router.get('/results', getScreeningResults);

export default router;
