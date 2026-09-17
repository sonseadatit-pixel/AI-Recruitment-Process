import { Router } from 'express';
import multer from 'multer';
import { requireUser } from '../middleware/requireUser.js';
import {
  chat,
  listConversations,
  createConversation,
  getConversationMessages,
  deleteConversation,
} from '../controllers/assistantController.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.get('/conversations', requireUser, listConversations);
router.post('/conversations', requireUser, createConversation);
router.get('/conversations/:id/messages', requireUser, getConversationMessages);
router.delete('/conversations/:id', requireUser, deleteConversation);
router.post(
  '/chat',
  requireUser,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is too large (max 20 MB).' });
      }
      return next(err);
    });
  },
  chat
);

export default router;