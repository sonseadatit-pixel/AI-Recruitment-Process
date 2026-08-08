import { Router } from 'express';
import multer from 'multer';
import { handleEmailWebhook } from '../controllers/emailWebhookController.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, fieldSize: 10 * 1024 * 1024 },
});

// Mailgun posts inbound emails as multipart form data; `.any()` catches the
// body fields plus attachments named `attachment-N` regardless of field name.
router.post('/', upload.any(), handleEmailWebhook);

export default router;
