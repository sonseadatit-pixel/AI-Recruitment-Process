import { Router } from 'express';
import multer from 'multer';
import { requireUser } from '../middleware/requireUser.js';
import {
  getCandidates,
  uploadCandidates,
  deleteCandidate,
  getInterviewQuestions,
  updateInterviewQuestions,
  getSavedInterviewQuestions,
  getInterviewEvaluation,
  updateInterviewEvaluation,
  saveDecision,
  sendOfferEmail,
} from '../controllers/candidatesController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', getCandidates);
router.post('/upload', upload.array('resumes'), uploadCandidates);
router.get('/:id/interview-questions', getSavedInterviewQuestions);
router.post('/:id/interview-questions', getInterviewQuestions);
router.put('/:id/interview-questions', updateInterviewQuestions);
router.post('/:id/interview-evaluation', getInterviewEvaluation);
router.put('/:id/interview-evaluation', updateInterviewEvaluation);
router.put('/:id/decision', saveDecision);
router.post('/:id/send-offer-email', requireUser, sendOfferEmail);
router.delete('/:id', deleteCandidate);

export default router;
