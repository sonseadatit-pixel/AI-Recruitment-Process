import { supabase } from '../services/claudeService.js';

// PostgREST/Postgres codes raised when a table/column has not been created yet
// (see supabase/migration.sql).
const TABLE_MISSING_CODES = ['PGRST205', '42P01', 'PGRST204'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapApplication(row) {
  return {
    id: row.id,
    sender_email: row.sender_email,
    sender_name: row.sender_name,
    subject: row.subject,
    body: row.body ?? null,
    resume_url: row.resume_url,
    received_at: row.received_at,
    status: row.status,
    candidate_id: row.candidate_id,
  };
}

/**
 * GET /api/email-applications
 * Lists CVs received via email, newest first.
 */
export const getEmailApplications = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('email_applications')
      .select('*')
      .order('received_at', { ascending: false });

    if (error) {
      // email_applications table not created yet (see supabase/migration.sql)
      if (TABLE_MISSING_CODES.includes(error.code)) return res.json([]);
      return next(error);
    }

    res.json((data || []).map(mapApplication));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/email-applications/:id/mark-read
 * Marks a 'new' email application as 'read' (opening its detail view). Already
 * read/submitted/rejected applications are left untouched.
 */
export const markEmailApplicationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Email application not found' });

    const { data: app, error: appError } = await supabase
      .from('email_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (appError) {
      if (TABLE_MISSING_CODES.includes(appError.code)) {
        return res.status(404).json({ error: 'Email application not found' });
      }
      return next(appError);
    }
    if (!app) return res.status(404).json({ error: 'Email application not found' });

    if (app.status === 'submitted' || app.status === 'rejected') {
      return res.json(mapApplication(app));
    }

    const { data: updated, error: updateError } = await supabase
      .from('email_applications')
      .update({ status: 'read' })
      .eq('id', id)
      .select()
      .single();
    if (updateError) return next(updateError);

    res.json(mapApplication(updated || { ...app, status: 'read' }));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/email-applications/:id/reject
 * Marks a 'new'/'read' email application as 'rejected' so it leaves the active
 * list. Applications already submitted to screening cannot be rejected.
 */
export const rejectEmailApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Email application not found' });

    const { data: app, error: appError } = await supabase
      .from('email_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (appError) {
      if (TABLE_MISSING_CODES.includes(appError.code)) {
        return res.status(404).json({ error: 'Email application not found' });
      }
      return next(appError);
    }
    if (!app) return res.status(404).json({ error: 'Email application not found' });

    if (app.status === 'submitted') {
      return res.status(409).json({ error: 'Cannot reject an application already submitted to screening' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('email_applications')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select()
      .single();
    if (updateError) return next(updateError);

    res.json(mapApplication(updated || { ...app, status: 'rejected' }));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/email-applications/:id/submit-to-screening
 * Creates a proper `candidates` row from an emailed CV (linked to the chosen
 * job, status 'new') so it flows into the normal screening pipeline, and marks
 * the email application as submitted.
 */
export const submitEmailApplicationToScreening = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { jobId } = req.body || {};

    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Email application not found' });
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const { data: app, error: appError } = await supabase
      .from('email_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (appError) {
      if (TABLE_MISSING_CODES.includes(appError.code)) {
        return res.status(404).json({ error: 'Email application not found' });
      }
      return next(appError);
    }
    if (!app) return res.status(404).json({ error: 'Email application not found' });

    // Already submitted — don't create a duplicate candidate. When the
    // `candidate_id` column is available (migration run) we rely on it;
    // otherwise match an existing candidate by sender email + resume URL so
    // re-submitting the same application still can't create duplicates.
    if (app.candidate_id) {
      return res.json({
        success: true,
        alreadySubmitted: true,
        candidate: { id: app.candidate_id },
        application: mapApplication(app),
      });
    }

    const { data: existingCandidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('resume_url', app.resume_url)
      .eq('email', app.sender_email || '')
      .maybeSingle();
    if (existingCandidate) {
      await supabase
        .from('email_applications')
        .update({ status: 'submitted', candidate_id: existingCandidate.id })
        .eq('id', id);
      return res.json({
        success: true,
        alreadySubmitted: true,
        candidate: { id: existingCandidate.id },
        application: mapApplication({ ...app, status: 'submitted', candidate_id: existingCandidate.id }),
      });
    }

    const candidateRow = {
      name: app.sender_name || app.sender_email || 'Email Applicant',
      email: app.sender_email || '',
      job_id: jobId.trim(),
      resume_url: app.resume_url,
      status: 'new',
      applied_at: new Date().toISOString(),
    };

    const { data: candidate, error: insertError } = await supabase
      .from('candidates')
      .insert(candidateRow)
      .select()
      .single();
    if (insertError) return next(insertError);

    const { data: updated, error: updateError } = await supabase
      .from('email_applications')
      .update({ status: 'submitted', candidate_id: candidate.id })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      // candidate_id column not present yet (migration not run) — still succeed.
      if (TABLE_MISSING_CODES.includes(updateError.code)) {
        await supabase.from('email_applications').update({ status: 'submitted' }).eq('id', id);
      } else {
        return next(updateError);
      }
    }

    const application = mapApplication(
      updated || { ...app, status: 'submitted', candidate_id: candidate.id }
    );

    res.status(201).json({ success: true, candidate, application });
  } catch (error) {
    next(error);
  }
};
