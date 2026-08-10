import {
  supabase,
  extractResumeText,
  generateInterviewQuestions,
  generateInterviewSummary,
  isClaudeConfigured,
} from '../services/claudeService.js';
import { sendMail } from '../services/mailgunService.js';
import { getSettingsForUser } from './settingsController.js';

const RESUMES_BUCKET = 'resumes';

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function nameFromFileName(fileName) {
  return fileName.replace(/\.(pdf|docx?|txt)$/i, '');
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === RESUMES_BUCKET)) return;
  const { error } = await supabase.storage.createBucket(RESUMES_BUCKET, { public: true });
  if (error) throw error;
}

export const getCandidates = async (req, res, next) => {
  try {
    const { jobId } = req.query;

    let query = supabase.from('candidates').select('*').order('applied_at', { ascending: false });
    if (jobId) query = query.eq('job_id', jobId);

    const { data: candidates, error } = await query;
    if (error) return next(error);

    const { data: results, error: resultsError } = await supabase
      .from('screening_results')
      .select('*');
    if (resultsError) return next(resultsError);

    const byCandidate = (results || []).reduce((acc, r) => {
      acc[r.candidate_id] = r;
      return acc;
    }, {});

    const rows = (candidates || []).map((c) => {
      const r = byCandidate[c.id];
      return {
        ...c,
        screened: r != null,
        ai_score: r?.ai_score ?? null,
        matched_skills: r?.matched_skills || [],
        missing_skills: r?.missing_skills || [],
        ai_notes: r?.ai_notes || '',
      };
    });

    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const uploadCandidates = async (req, res, next) => {
  try {
    const { jobId } = req.body;
    const files = req.files || [];

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }
    if (files.length === 0) {
      return res.status(400).json({ error: 'At least one resume must be uploaded' });
    }

    await ensureBucket();

    const created = [];
    for (const file of files) {
      const storagePath = `${jobId}/${Date.now()}_${sanitizeFileName(file.originalname)}`;
      const { error: uploadError } = await supabase.storage
        .from(RESUMES_BUCKET)
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (uploadError) return next(uploadError);

      const { data: urlData } = supabase.storage.from(RESUMES_BUCKET).getPublicUrl(storagePath);

      const row = {
        name: nameFromFileName(file.originalname) || 'Candidate',
        email: '',
        job_id: jobId,
        resume_url: urlData.publicUrl,
        status: 'new',
      };

      const { data, error } = await supabase.from('candidates').insert(row).select().single();

      // candidates table may not have the `status` column yet (see supabase/migration.sql)
      if (error?.code === 'PGRST204') {
        const { name, email, job_id, resume_url } = row;
        const { data: minimal, error: e2 } = await supabase
          .from('candidates')
          .insert({ name, email, job_id, resume_url })
          .select()
          .single();
        if (e2) return next(e2);
        created.push(minimal);
        continue;
      }

      if (error) return next(error);
      created.push(data);
    }

    res.status(201).json({ jobId, total: created.length, candidates: created });
  } catch (error) {
    next(error);
  }
};

export const deleteCandidate = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError) return next(fetchError);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const { error: deleteError } = await supabase.from('candidates').delete().eq('id', id);
    if (deleteError) return next(deleteError);

    const storagePath = storagePathFromUrl(candidate.resume_url);
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from(RESUMES_BUCKET)
        .remove([storagePath]);
      if (storageError) console.warn('Failed to remove resume from storage:', storageError.message);
    }

    res.json({ success: true, id });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/candidates/:id/decision
 * Records a hire/reject decision (or resets one) plus the hire start date,
 * hire notes and the next-steps checklist. Requires the extended columns
 * (hire_start_date / hire_notes / decided_at / next_steps_completed) from
 * supabase/migration.sql; until then it falls back to persisting status only.
 */
export const saveDecision = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision, hireStartDate, hireNotes, nextSteps } = req.body || {};

    const { data: existing, error: fetchError } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: 'Candidate not found' });

    if (decision !== undefined && !['hire', 'reject', 'reset'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "hire", "reject" or "reset"' });
    }

    if (decision === 'hire' && !hireStartDate) {
      return res.status(400).json({ error: 'Start date is required when hiring' });
    }

    const patch = {};
    if (decision === 'hire') {
      patch.status = 'hired';
      patch.hire_start_date = hireStartDate;
      patch.hire_notes = (hireNotes || '').trim();
      patch.decided_at = new Date().toISOString();
    } else if (decision === 'reject') {
      patch.status = 'rejected';
      patch.hire_start_date = null;
      patch.hire_notes = (hireNotes || '').trim();
      patch.decided_at = new Date().toISOString();
    } else if (decision === 'reset') {
      patch.status = 'new';
      patch.hire_start_date = null;
      patch.hire_notes = null;
      patch.decided_at = null;
      patch.next_steps_completed = [];
      patch.offer_email_sent = false;
      patch.offer_email_sent_at = null;
    }

    if (Array.isArray(nextSteps)) {
      patch.next_steps_completed = nextSteps;
    }

    const { data: updated, error } = await supabase
      .from('candidates')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    // Extended columns not present yet (migration not run) — keep status only
    // so the decision still sticks until the SQL is executed.
    if (error?.code === 'PGRST204' && patch.status !== undefined) {
      const { data: minimal, error: e2 } = await supabase
        .from('candidates')
        .update({ status: patch.status })
        .eq('id', id)
        .select()
        .single();
      if (e2) return next(e2);
      return res.json(minimal);
    }

    if (error) return next(error);

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

function storagePathFromUrl(url) {
  if (!url) return null;
  const marker = '/object/public/resumes/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length);
  return path || null;
}

function fillTemplate(template, values) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = values[key];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

function formatStartDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * POST /api/candidates/:id/send-offer-email
 * Sends a brand-new offer email (Mailgun) to the candidate's address — the one
 * that applied by email (candidates.email, falling back to the linked
 * email_applications.sender_email). The subject/body come from the sender's
 * settings template with {{candidate_name}}, {{job_title}}, {{hr_notes}},
 * {{start_date}} and {{sender_name}} filled in. Only works for hired candidates
 * and refuses to send twice (offer_email_sent).
 */
export const sendOfferEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const { data: candidate, error: fetchError } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) return next(fetchError);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    if (candidate.status !== 'hired') {
      return res.status(400).json({ error: 'Offer email can only be sent to hired candidates.' });
    }
    if (candidate.offer_email_sent) {
      return res.status(409).json({ error: 'Offer email has already been sent for this candidate.' });
    }

    let email = typeof candidate.email === 'string' ? candidate.email.trim() : '';
    if (!email && candidate.id) {
      const { data: app, error: appError } = await supabase
        .from('email_applications')
        .select('sender_email')
        .eq('candidate_id', candidate.id)
        .maybeSingle();
      if (appError) return next(appError);
      if (app?.sender_email) email = String(app.sender_email).trim();
    }
    if (!email) {
      return res
        .status(400)
        .json({ error: 'No email address on file for this candidate (they did not apply by email).' });
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('title')
      .eq('id', candidate.job_id)
      .maybeSingle();
    if (jobError && jobError.code !== 'PGRST116') return next(jobError);

    const settings = await getSettingsForUser(userId);
    const values = {
      candidate_name: candidate.name || 'Candidate',
      job_title: job?.title || candidate.role || '',
      hr_notes: candidate.hire_notes || '',
      start_date: formatStartDate(candidate.hire_start_date),
      sender_name: settings.full_name || 'HR Team',
    };

    const subject = fillTemplate(settings.offer_email_subject || '', values);
    const text = fillTemplate(settings.offer_email_template || '', values);

    const messageId = await sendMail({
      to: email,
      subject,
      text,
      senderName: values.sender_name,
    });

    const sentAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('candidates')
      .update({ offer_email_sent: true, offer_email_sent_at: sentAt })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.warn('[send-offer-email] Email sent but failed to mark candidate:', updateError.message);
    }

    res.json({
      success: true,
      message_id: messageId,
      to: email,
      sent_at: sentAt,
      candidate: updated ?? { ...candidate, offer_email_sent: true, offer_email_sent_at: sentAt },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/candidates/:id/interview-questions
 * Generates a tailored interview question set with Claude using the candidate's
 * resume, job details, and screening results, saves it to the `interviews`
 * table, and returns it.
 */
export const getInterviewQuestions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customInstructions =
      typeof req.body?.customInstructions === 'string' ? req.body.customInstructions.trim() : '';

    const { data: candidate, error: candError } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', id)
      .single();
    if (candError) return next(candError);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('title, description, requirements')
      .eq('id', candidate.job_id)
      .single();
    if (jobError && jobError.code !== 'PGRST116') return next(jobError);

    const jobTitle = job?.title || candidate.role || '';
    const jobRequirements = job?.requirements || job?.description || '';

    const { data: screeningRows, error: screeningError } = await supabase
      .from('screening_results')
      .select('*')
      .eq('candidate_id', id);
    if (screeningError) return next(screeningError);

    const screening = Array.isArray(screeningRows) ? screeningRows[0] : null;

    let resumeText = '';
    if (candidate.resume_url) {
      try {
        const res = await fetch(candidate.resume_url);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          resumeText = await extractResumeText(buffer);
        }
      } catch (error) {
        console.warn('[interview-questions] Failed to extract resume text:', error.message);
      }
    }

    if (!isClaudeConfigured()) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY is not set. Claude interview question generation is unavailable.' });
    }

    const questions = await generateInterviewQuestions(
      candidate.name || 'Candidate',
      resumeText,
      jobTitle,
      jobRequirements,
      screening?.matched_skills || [],
      screening?.missing_skills || [],
      customInstructions
    );

    await saveInterviewQuestions(id, questions);

    res.json({ questions });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/candidates/:id/interview-questions
 * Persists the HR user's edited question set back to the `interviews` table.
 */
export const updateInterviewQuestions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { technical = [], behavioral = [] } = req.body || {};

    if (!Array.isArray(technical) || !Array.isArray(behavioral)) {
      return res.status(400).json({ error: 'technical and behavioral must be arrays of questions' });
    }

    const questions = {
      technical: technical.map(String),
      behavioral: behavioral.map(String),
    };

    await saveInterviewQuestions(id, questions);

    res.json({ success: true, questions });
  } catch (error) {
    next(error);
  }
};

async function saveInterviewQuestions(candidateId, questions) {
  const { error: deleteError } = await supabase
    .from('interviews')
    .delete()
    .eq('candidate_id', candidateId);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from('interviews').insert({
    candidate_id: candidateId,
    questions_generated: [JSON.stringify(questions)],
  });
  if (insertError) throw insertError;
}

/**
 * GET /api/candidates/:id/interview-questions
 * Returns the question set previously saved for this candidate, so HR can see
 * on the candidate's profile/CV that interview questions already exist.
 */
export const getSavedInterviewQuestions = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: candidate, error: candError } = await supabase
      .from('candidates')
      .select('id')
      .eq('id', id)
      .single();
    if (candError && candError.code !== 'PGRST116') return next(candError);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const { data: interviewRows, error: interviewError } = await supabase
      .from('interviews')
      .select('questions_generated')
      .eq('candidate_id', id);
    if (interviewError) return next(interviewError);

    const stored = Array.isArray(interviewRows) && interviewRows.length > 0
      ? interviewRows[0].questions_generated
      : null;

    res.json({ questions: parseStoredQuestions(stored) });
  } catch (error) {
    next(error);
  }
};

// `questions_generated` is a text[] column that stores a single JSON string
// containing { technical: string[], behavioral: string[] }.
function parseStoredQuestions(stored) {
  const empty = { technical: [], behavioral: [] };
  if (!Array.isArray(stored)) return empty;

  const json = stored.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
  if (!json) return empty;

  try {
    const parsed = JSON.parse(json);
    return {
      technical: Array.isArray(parsed.technical)
        ? parsed.technical.map(String).filter((q) => q.trim().length > 0)
        : [],
      behavioral: Array.isArray(parsed.behavioral)
        ? parsed.behavioral.map(String).filter((q) => q.trim().length > 0)
        : [],
    };
  } catch (error) {
    console.warn('[interview-questions] Failed to parse stored questions:', error.message);
    return empty;
  }
}

/**
 * POST /api/candidates/:id/interview-evaluation
 * Generates a concise AI summary of the interviewer's feedback with Claude,
 * saves the evaluation to the `interviews` table, and returns the summary.
 */
export const getInterviewEvaluation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { interviewFeedback, interviewScore, recommendation } = req.body || {};

    if (!interviewFeedback || typeof interviewFeedback !== 'string' || !interviewFeedback.trim()) {
      return res.status(400).json({ error: 'Interview feedback is required' });
    }
    const score = Number(interviewScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Interview score must be a number between 0 and 100' });
    }
    const rec = typeof recommendation === 'string' && recommendation.trim() ? recommendation.trim() : '';

    const { data: candidate, error: candError } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', id)
      .single();
    if (candError) return next(candError);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('title')
      .eq('id', candidate.job_id)
      .single();
    if (jobError && jobError.code !== 'PGRST116') return next(jobError);

    const { data: screeningRows, error: screeningError } = await supabase
      .from('screening_results')
      .select('ai_score')
      .eq('candidate_id', id);
    if (screeningError) return next(screeningError);

    const resumeScore = Array.isArray(screeningRows) && screeningRows.length > 0
      ? screeningRows[0].ai_score ?? 0
      : 0;

    if (!isClaudeConfigured()) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY is not set. Claude interview summary generation is unavailable.' });
    }

    const summary = await generateInterviewSummary(
      candidate.name || 'Candidate',
      job?.title || candidate.role || '',
      resumeScore,
      interviewFeedback.trim(),
      score,
      rec
    );

    await upsertInterview(id, {
      interviewer_feedback: interviewFeedback.trim(),
      evaluation_score: score,
      ai_summary: summary,
      recommendation: rec,
    });

    res.json({ summary });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/candidates/:id/interview-evaluation
 * Persists the final evaluation state (feedback, score, recommendation, AI
 * summary) to the `interviews` table without regenerating the summary.
 */
export const updateInterviewEvaluation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { interviewFeedback, interviewScore, recommendation, aiSummary } = req.body || {};

    const score = Number(interviewScore);
    if (interviewScore !== undefined && !Number.isFinite(score)) {
      return res.status(400).json({ error: 'Interview score must be a number' });
    }

    await upsertInterview(id, {
      interviewer_feedback: typeof interviewFeedback === 'string' ? interviewFeedback.trim() : '',
      evaluation_score: Number.isFinite(score) ? score : null,
      ai_summary: typeof aiSummary === 'string' ? aiSummary.trim() : '',
      recommendation: typeof recommendation === 'string' ? recommendation.trim() : '',
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Columns guaranteed to exist on `interviews` (the rest are added via
// supabase/migration.sql; if they are missing, we fall back to these).
const INTERVIEW_CORE_FIELDS = ['candidate_id', 'interviewer_feedback', 'evaluation_score', 'questions_generated'];

/**
 * Insert or update a single interviews row for a candidate without wiping
 * other fields (e.g. questions_generated) that may already be stored.
 */
async function upsertInterview(candidateId, fields) {
  const row = { ...fields, candidate_id: candidateId };

  try {
    await upsertInterviewRow(row);
  } catch (error) {
    // ai_summary / recommendation columns may not exist yet (see migration.sql)
    if (error.code !== '42703' && error.code !== 'PGRST204') throw error;
    const core = {};
    for (const key of INTERVIEW_CORE_FIELDS) {
      if (key in row) core[key] = row[key];
    }
    await upsertInterviewRow(core);
  }
}

async function upsertInterviewRow(row) {
  const { data: existing, error: selError } = await supabase
    .from('interviews')
    .select('candidate_id')
    .eq('candidate_id', row.candidate_id)
    .maybeSingle();
  if (selError) throw selError;

  if (existing) {
    const { error } = await supabase.from('interviews').update(row).eq('candidate_id', row.candidate_id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('interviews').insert(row);
    if (error) throw error;
  }
}
