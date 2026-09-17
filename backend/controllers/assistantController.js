import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import {
  supabase,
  extractResumeText,
  chatWithAssistant,
  isClaudeConfigured,
} from '../services/claudeService.js';

const MAX_RESUME_CHARS = 12000;
const MAX_LIST_ITEMS = 30;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || '').trim();
}

async function extractDocText(buffer) {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  return (doc.getBody() || '').trim();
}

/**
 * Classify an uploaded chat attachment and validate it against the supported
 * types (PDF / DOC / DOCX for text extraction, PNG / JPG / JPEG / WEBP / GIF as
 * images). Returns { attachment, error } — exactly one is set.
 */
function resolveAttachment(file) {
  if (!file) return { attachment: null, error: null };
  const fileName = String(file.originalname || '').trim();
  const lower = fileName.toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();

  let kind = null;
  let mimeType = mime;

  if (mime.startsWith('image/')) {
    if (!IMAGE_MIME_TYPES.includes(mime)) {
      return {
        attachment: null,
        error: 'Unsupported image format. Please use PNG, JPG, JPEG, GIF or WEBP.',
      };
    }
    kind = 'image';
  } else if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    kind = 'pdf';
    mimeType = 'application/pdf';
  } else if (lower.endsWith('.docx')) {
    kind = 'docx';
    mimeType = mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (lower.endsWith('.doc')) {
    kind = 'doc';
    mimeType = mime || 'application/msword';
  } else {
    return {
      attachment: null,
      error: 'Unsupported file type. Allowed: PDF, DOC, DOCX, PNG, JPG, JPEG.',
    };
  }

  if (file.buffer && file.buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    return { attachment: null, error: 'File is too large (max 20 MB).' };
  }

  return { attachment: { kind, fileName, mimeType, buffer: file.buffer }, error: null };
}

function truncate(text, max) {
  if (!text) return '';
  const s = String(text).trim();
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n...[resume text truncated to fit the request]';
}

/**
 * Safety net for the plain-text rule: strips any Markdown symbols Claude
 * might still emit (bold, italics, headings, code fences, links, quotes) so
 * the chat always renders as clean plain text.
 */
function sanitizeReply(text) {
  let out = String(text || '');
  out = out.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
  out = out.replace(/^ {0,3}#{1,6}\s+/gm, '');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/_([^_]+)_/g, '$1');
  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  out = out.replace(/^[ \t]*>\s?/gm, '');
  return out.trim();
}

/**
 * Light overall system stats (total jobs / total candidates) sent to Claude as
 * background context only.
 */
export async function fetchOverviewStats() {
  const [jobsRes, candidatesRes] = await Promise.all([
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
    supabase.from('candidates').select('id', { count: 'exact', head: true }),
  ]);
  const jobs = jobsRes.count ?? (Array.isArray(jobsRes.data) ? jobsRes.data.length : 0) ?? 0;
  const candidates =
    candidatesRes.count ?? (Array.isArray(candidatesRes.data) ? candidatesRes.data.length : 0) ?? 0;
  return `Total jobs: ${jobs}. Total candidates: ${candidates}.`;
}

/**
 * Richer jobs context: the actual job titles (with department + status), not
 * just a count. Capped to the most recent MAX_LIST_ITEMS jobs.
 */
export async function buildJobsContext() {
  const { data, error } = await supabase
    .from('jobs')
    .select('title, department, status')
    .order('created_at', { ascending: false })
    .limit(MAX_LIST_ITEMS);
  if (error) return `Jobs: (unavailable: ${error.message})`;

  const rows = data || [];
  if (rows.length === 0) return 'Jobs: (none yet)';

  const list = rows
    .map((j) => `${j.title || '(untitled)'} (${j.department || 'No department'}, ${j.status || 'unknown'})`)
    .join(', ');
  return `Jobs: ${list}`;
}

/**
 * Richer candidates context: name, the job applied to, AI score and status —
 * not just a count. Capped to the most recent MAX_LIST_ITEMS candidates.
 */
export async function buildCandidatesContext() {
  const [candRes, jobRes, scoreRes] = await Promise.all([
    supabase
      .from('candidates')
      .select('id, name, job_id, status, applied_at')
      .order('applied_at', { ascending: false })
      .limit(MAX_LIST_ITEMS),
    supabase.from('jobs').select('id, title'),
    supabase.from('screening_results').select('candidate_id, ai_score'),
  ]);

  const jobTitleById = (jobRes.data || []).reduce((acc, job) => {
    acc[job.id] = job.title;
    return acc;
  }, {});

  // First screening record per candidate (latest submitted runs may repeat a
  // candidate on re-screening, so prefer the first one found).
  const scoreByCandidate = (scoreRes.data || []).reduce((acc, row) => {
    if (row.candidate_id && !(row.candidate_id in acc)) acc[row.candidate_id] = row.ai_score;
    return acc;
  }, {});

  const rows = candRes.data || [];
  if (rows.length === 0) return 'Candidates: (none yet)';

  const list = rows
    .map((c) => {
      const jobTitle = jobTitleById[c.job_id] || '(no role)';
      const score = scoreByCandidate[c.id] != null ? `score ${scoreByCandidate[c.id]}` : 'score N/A';
      return `${c.name || '(unnamed)'} → ${jobTitle}, ${score}, status ${c.status || 'new'}`;
    })
    .join(', ');
  return `Candidates: ${list}`;
}

/**
 * Fetch everything we know about a candidate (resume text, AI screen score,
 * matched/missing skills, AI summary) and format it as labeled context for the
 * assistant. Returns null when the candidate doesn't exist.
 */
export async function buildCandidateContext(candidateId) {
  const { data: candidate, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();
  if (error || !candidate) return null;

  const { data: screeningRows } = await supabase
    .from('screening_results')
    .select('*')
    .eq('candidate_id', candidateId);
  const screening = Array.isArray(screeningRows) ? screeningRows[0] : null;

  let resumeText = '';
  if (candidate.resume_url) {
    try {
      const res = await fetch(candidate.resume_url);
      if (res.ok) {
        resumeText = await extractResumeText(Buffer.from(await res.arrayBuffer()));
      }
    } catch (err) {
      console.warn('[assistant] Failed to extract resume text:', err.message);
    }
  }

  const matched =
    Array.isArray(screening?.matched_skills) && screening.matched_skills.length
      ? [...screening.matched_skills].map(String).join(', ')
      : '(none)';
  const missing =
    Array.isArray(screening?.missing_skills) && screening.missing_skills.length
      ? [...screening.missing_skills].map(String).join(', ')
      : '(none)';

  return [
    `Name: ${candidate.name || '(unknown)'}`,
    `Role applied for: ${candidate.role || '(unknown)'}`,
    `AI screening score: ${screening?.ai_score ?? '(not screened)'}`,
    `Matched skills: ${matched}`,
    `Missing skills: ${missing}`,
    `AI summary: ${screening?.ai_notes || '(none)'}`,
    `Resume text:\n${truncate(resumeText, MAX_RESUME_CHARS) || '(resume text unavailable)'}`,
  ].join('\n');
}

/**
 * GET /api/assistant/conversations
 * Returns the current user's conversations, newest first. The title is a short
 * snippet (first ~40 chars) of the first user message.
 */
export const listConversations = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assistant_conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });
    if (error) return next(error);
    res.json(data || []);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/assistant/conversations
 * Creates an empty conversation row (title is auto-set from the first message
 * the user sends). Returns the created conversation.
 */
export const createConversation = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assistant_conversations')
      .insert({ user_id: req.user.id, title: '' })
      .select()
      .single();
    if (error) return next(error);
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/assistant/conversations/:id/messages
 * Returns the full message history of a conversation owned by the user.
 */
export const getConversationMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: conversation, error: convError } = await supabase
      .from('assistant_conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (convError) return next(convError);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const { data: messages, error } = await supabase
      .from('assistant_messages')
      .select('role, content, created_at, attachment_name, attachment_type')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    if (error) return next(error);

    res.json(
      (messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        attachmentName: m.attachment_name || undefined,
        attachmentType: m.attachment_type || undefined,
      }))
    );
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/assistant/conversations/:id
 * Deletes a conversation owned by the user along with all its messages.
 */
export const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: conversation, error: convError } = await supabase
      .from('assistant_conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (convError) return next(convError);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    // Delete messages first for safety even if ON DELETE CASCADE exists.
    await supabase.from('assistant_messages').delete().eq('conversation_id', id);

    const { error } = await supabase.from('assistant_conversations').delete().eq('id', id);
    if (error) return next(error);
    res.json({ success: true, id });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/assistant/chat
 * Accepts JSON (no file) or multipart/form-data (optional `file` field).
 * Body fields (multipart passes the non-file ones as strings):
 *   message, conversationHistory?, conversationId?, context: { page?, candidateId? }
 * Resolves or creates a conversation owned by the user, persists both the
 * user's message and the AI reply, auto-sets the title from the first message,
 * and returns { reply, conversationId }.
 * When a file is attached:
 *   - PDF / DOCX / DOC are text-extracted and prepended to the user message as
 *     CV context for Claude.
 *   - Images (PNG/JPG/...) are sent to Claude as an image content block so it
 *     can read the CV visually.
 */
export const chat = async (req, res, next) => {
  try {
    const body = req.body || {};
    let conversationHistory = body.conversationHistory;
    if (typeof conversationHistory === 'string') {
      try {
        conversationHistory = JSON.parse(conversationHistory);
      } catch {
        conversationHistory = [];
      }
    }
    if (!Array.isArray(conversationHistory)) conversationHistory = [];

    let context = body.context;
    if (typeof context === 'string') {
      try {
        context = JSON.parse(context);
      } catch {
        context = {};
      }
    }
    if (!context || typeof context !== 'object') context = {};

    const userId = req.user?.id;
    const message = typeof body.message === 'string' ? body.message : '';
    const text = message.trim();
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';

    const { attachment, error: attachError } = resolveAttachment(req.file);
    if (attachError) return res.status(400).json({ error: attachError });

    const hasFile = Boolean(req.file);
    if (!text && !hasFile) {
      return res.status(400).json({ error: 'message or a file is required' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const page = typeof context.page === 'string' ? context.page.trim() : '';
    const candidateId = typeof context.candidateId === 'string' ? context.candidateId.trim() : '';

    // Resolve the conversation. If an invalid/foreign id is passed, the caller
    // is told so the frontend can create a fresh thread instead of silently
    // continuing something it doesn't own.
    let threadId = conversationId && conversationId.trim() ? conversationId.trim() : null;
    if (threadId) {
      const { data: conversation, error: findError } = await supabase
        .from('assistant_conversations')
        .select('id')
        .eq('id', threadId)
        .eq('user_id', userId)
        .maybeSingle();
      if (findError) return next(findError);
      if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    } else {
      const { data: created, error: createError } = await supabase
        .from('assistant_conversations')
        .insert({ user_id: userId, title: '' })
        .select()
        .single();
      if (createError) return next(createError);
      threadId = created.id;
    }

    // Persist the user message, then auto-set the title from the first message
    // if the conversation doesn't have one yet.
    const userRow = { conversation_id: threadId, role: 'user', content: text };
    if (attachment) {
      Object.assign(userRow, {
        attachment_name: attachment.fileName,
        attachment_type: attachment.mimeType || attachment.kind,
      });
    }
    const { error: userMsgError } = await supabase.from('assistant_messages').insert(userRow);
    if (userMsgError) {
      // The attachment columns may not exist yet (migration not re-run) — retry
      // without them so a plain-file chat still works.
      if (attachment) {
        const { error: retryError } = await supabase
          .from('assistant_messages')
          .insert({ conversation_id: threadId, role: 'user', content: text });
        if (retryError) return next(retryError);
      } else {
        return next(userMsgError);
      }
    }

    const { data: conversationRow } = await supabase
      .from('assistant_conversations')
      .select('title')
      .eq('id', threadId)
      .maybeSingle();
    const titleSource = text || (attachment ? `[Attachment: ${attachment.fileName}]` : '');
    if (conversationRow && !conversationRow.title && titleSource) {
      await supabase
        .from('assistant_conversations')
        .update({ title: titleSource.slice(0, 40) })
        .eq('id', threadId);
    }

    // Build the attachment payload for Claude.
    let attachmentPayload = null;
    let claudeMessage = text;
    if (attachment) {
      if (attachment.kind === 'image') {
        attachmentPayload = {
          kind: 'image',
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          base64: attachment.buffer.toString('base64'),
        };
        claudeMessage = text || `[Attached image: ${attachment.fileName}] Please review it.`;
      } else {
        let extracted = '';
        try {
          if (attachment.kind === 'pdf') {
            extracted = await extractResumeText(attachment.buffer);
          } else if (attachment.kind === 'docx') {
            extracted = await extractDocxText(attachment.buffer);
          } else if (attachment.kind === 'doc') {
            extracted = await extractDocText(attachment.buffer);
          }
        } catch (err) {
          console.warn('[assistant] attachment text extraction failed:', err.message);
        }
        if (!extracted.trim()) {
          extracted = `(I could not extract readable text from ${attachment.fileName} automatically.)`;
        }
        attachmentPayload = { kind: 'text', fileName: attachment.fileName, text: extracted };
        claudeMessage = `[Attached CV: ${attachment.fileName}]\n\n${extracted}\n\n${text}`.trim();
      }
    }

    const [candidateContext, stats, jobsList, candidatesList] = await Promise.all([
      candidateId ? buildCandidateContext(candidateId) : null,
      fetchOverviewStats(),
      buildJobsContext(),
      buildCandidatesContext(),
    ]);

    if (!isClaudeConfigured()) {
      return res
        .status(400)
        .json({ error: 'ANTHROPIC_API_KEY is not set. The AI assistant is unavailable.' });
    }

    const reply = sanitizeReply(
      await chatWithAssistant({
        message: claudeMessage,
        conversationHistory,
        page,
        candidateContext,
        stats,
        jobsList,
        candidatesList,
        attachment: attachmentPayload,
      })
    );

    // Persist the AI reply and bump the conversation so it sorts newest-first.
    const { error: assistantMsgError } = await supabase
      .from('assistant_messages')
      .insert({ conversation_id: threadId, role: 'assistant', content: reply });
    if (assistantMsgError) return next(assistantMsgError);

    await supabase
      .from('assistant_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', threadId);

    res.json({ reply, conversationId: threadId });
  } catch (error) {
    next(error);
  }
};