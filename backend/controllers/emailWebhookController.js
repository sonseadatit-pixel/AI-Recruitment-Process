import crypto from 'node:crypto';
import { supabase } from '../services/claudeService.js';

const RESUMES_BUCKET = 'resumes';
const MAX_TIMESTAMP_AGE_SECONDS = 15 * 60;

const RESUME_EXT_RE = /\.(pdf|doc|docx)$/i;
const RESUME_MIME_RE =
  /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;

// PostgREST/Postgres codes raised when a table has not been created yet
// (see supabase/migration.sql).
const TABLE_MISSING_CODES = ['PGRST205', '42P01', 'PGRST204'];

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function nameFromFileName(fileName) {
  return fileName.replace(/\.(pdf|docx?|txt)$/i, '');
}

function isResumeFile(file) {
  if (!file) return false;
  return RESUME_EXT_RE.test(file.originalname || '') || RESUME_MIME_RE.test(file.mimetype || '');
}

/**
 * Parse a Mailgun sender value ("Name <email@example.com>" or just an address)
 * into { name, email }.
 */
function parseSender(sender) {
  const raw = typeof sender === 'string' ? sender.trim() : '';
  if (!raw) return { name: '', email: '' };
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: '', email: raw };
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Verify the request genuinely came from Mailgun. Mailgun signs the webhook
 * with HMAC-SHA256 using the webhook signing key (MAILGUN_WEBHOOK_SIGNING_KEY):
 *   - current scheme: HMAC(timestamp)
 *   - legacy scheme:  HMAC(timestamp + token)
 * The timestamp must also be recent to prevent replay attacks.
 */
function verifyMailgunSignature(body) {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  const { timestamp, token, signature } = body || {};
  if (!key || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > MAX_TIMESTAMP_AGE_SECONDS) return false;

  const current = crypto.createHmac('sha256', key).update(String(timestamp)).digest('hex');
  if (timingSafeEqualHex(signature, current)) return true;

  if (token) {
    const legacy = crypto
      .createHmac('sha256', key)
      .update(`${timestamp}${token}`)
      .digest('hex');
    return timingSafeEqualHex(signature, legacy);
  }
  return false;
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === RESUMES_BUCKET)) return;
  const { error } = await supabase.storage.createBucket(RESUMES_BUCKET, { public: true });
  if (error) throw error;
}

/**
 * POST /api/email-webhook
 * Receives Mailgun inbound email POSTs, verifies the signature, extracts any
 * PDF/DOC/DOCX resume attachments, stores them in Supabase Storage, records
 * an `email_applications` row per resume and a `notifications` row.
 *
 * Always responds 200 OK so Mailgun does not retry. Emails without a valid
 * resume attachment are ignored (no records created).
 */
export const handleEmailWebhook = async (req, res) => {
  try {
    if (!verifyMailgunSignature(req.body)) {
      console.warn('[email-webhook] Dropping request with invalid Mailgun signature');
      return res.status(200).json({ status: 'ok', ignored: true });
    }

    const sender = req.body?.sender || req.body?.From || req.body?.from || '';
    const subject = req.body?.subject || req.body?.Subject || '';
    const files = Array.isArray(req.files) ? req.files.filter(isResumeFile) : [];

    if (files.length === 0) {
      return res.status(200).json({ status: 'ok', ignored: true });
    }

    const { name: senderName, email: senderEmail } = parseSender(sender);
    const receivedAt = new Date().toISOString();

    await ensureBucket();

    const created = [];
    for (const file of files) {
      const storagePath = `email/${Date.now()}_${sanitizeFileName(file.originalname)}`;
      const { error: uploadError } = await supabase.storage
        .from(RESUMES_BUCKET)
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (uploadError) {
        console.error('[email-webhook] Resume upload failed:', uploadError.message);
        continue;
      }

      const { data: urlData } = supabase.storage.from(RESUMES_BUCKET).getPublicUrl(storagePath);

      const row = {
        sender_email: senderEmail,
        sender_name: senderName || nameFromFileName(file.originalname) || null,
        subject: subject || null,
        resume_url: urlData.publicUrl,
        received_at: receivedAt,
        status: 'new_from_email',
      };

      const { data, error: insertError } = await supabase
        .from('email_applications')
        .insert(row)
        .select()
        .single();

      // email_applications table may not exist yet (see supabase/migration.sql)
      if (insertError) {
        if (TABLE_MISSING_CODES.includes(insertError.code)) {
          console.warn('[email-webhook] email_applications table not available yet (run supabase/migration.sql):', insertError.message);
        } else {
          console.error('[email-webhook] Failed to create email application:', insertError.message);
        }
        continue;
      }

      created.push(data);
    }

    if (created.length > 0) {
      await createNotifications(created, senderName, senderEmail, subject);
    }

    return res.status(200).json({ status: 'ok', processed: created.length });
  } catch (error) {
    console.error('[email-webhook] Unexpected error:', error);
    return res.status(200).json({ status: 'ok' });
  }
};

async function createNotifications(applications, senderName, senderEmail, subject) {
  const display = senderName || senderEmail || 'an applicant';
  const baseMessage = `New CV received from ${display}`;
  const message = subject ? `${baseMessage} — ${subject}` : baseMessage;

  const rows = applications.map((app) => ({
    type: 'new_email_cv',
    message,
    candidate_id: app.id,
    is_read: false,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('notifications').insert(rows);
  if (!error) return;

  if (TABLE_MISSING_CODES.includes(error.code)) {
    console.warn('[email-webhook] notifications table not available yet (run supabase/migration.sql):', error.message);
    return;
  }
  console.error('[email-webhook] Failed to create notifications:', error.message);
}
