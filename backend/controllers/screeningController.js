import {
  screenResumesWithClaude,
  screenResume,
  extractResumeText,
  isClaudeConfigured,
  supabase,
} from '../services/claudeService.js';
import { getSettingsForUser } from './settingsController.js';

export const screenResumes = async (req, res, next) => {
  try {
    const { jobId } = req.body;
    const files = req.files || [];

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }
    if (files.length === 0) {
      return res.status(400).json({ error: 'At least one resume (PDF) must be uploaded' });
    }

    const results = await screenResumesWithClaude({ jobId, resumes: files });

    res.json({ jobId, total: results.length, results });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/screening/run
 * Screens every unscreened candidate for a job against that job's requirements
 * using Claude, then persists results into screening_results and marks each
 * candidate as 'screened'. Candidates are processed in sequence to avoid rate
 * limits.
 */
export const runScreening = async (req, res, next) => {
  try {
    const jobId = req.body?.job_id || req.body?.jobId;
    if (!jobId) {
      return res.status(400).json({ error: 'job_id is required' });
    }
    if (!isClaudeConfigured()) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY is not set. Claude resume screening is unavailable.' });
    }

    // Pull the current user's screening preferences so the prompt can weight
    // specific skills more heavily. Falls back to defaults gracefully.
    const settings = await getSettingsForUser(req.user?.id);
    const weightedSkills = settings?.weighted_skills || '';

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, title, description, requirements')
      .eq('id', jobId)
      .single();
    if (jobError) return res.status(404).json({ error: `Job not found: ${jobError.message}` });

    const jobDescription = job.description || job.requirements || '';
    const jobRequirements = job.requirements || job.description || '';

    const { data: candidates, error: candError } = await supabase
      .from('candidates')
      .select('*')
      .eq('job_id', jobId);
    if (candError) return next(candError);

    const pending = (candidates || []).filter((c) => c.status !== 'screened');

    let succeeded = 0;
    const failures = [];

    for (const candidate of pending) {
      try {
        if (!candidate.resume_url) throw new Error('Candidate has no resume_url');

        const buffer = await downloadFile(candidate.resume_url);
        const resumeText = await extractResumeText(buffer);
        const result = await screenResume(resumeText, jobDescription, jobRequirements, weightedSkills);

        await saveScreeningResult(candidate.id, result);

        const { error: statusError } = await supabase
          .from('candidates')
          .update({ status: 'screened' })
          .eq('id', candidate.id);
        if (statusError?.code !== 'PGRST204' && statusError) throw statusError;

        succeeded++;
      } catch (error) {
        failures.push({
          candidateId: candidate.id,
          name: candidate.name || 'Candidate',
          error: error.message,
        });
      }
    }

    res.json({
      job_id: jobId,
      total: pending.length,
      succeeded,
      failed: failures.length,
      failures,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/screening/results
 * Returns candidates that have a screening result, joined with that result.
 */
export const getScreeningResults = async (req, res, next) => {
  try {
    const { job_id } = req.query;

    let query = supabase.from('candidates').select('*');
    if (job_id) query = query.eq('job_id', job_id);

    const { data: candidates, error: candError } = await query;
    if (candError) return next(candError);

    const { data: jobs, error: jobsError } = await supabase.from('jobs').select('id, title');
    if (jobsError) return next(jobsError);
    const jobsById = (jobs || []).reduce((acc, j) => {
      acc[j.id] = j;
      return acc;
    }, {});

    const { data: results, error: resultsError } = await supabase
      .from('screening_results')
      .select('*');
    if (resultsError) return next(resultsError);

    let interviewsByCandidate = {};
    const { data: interviewRows, error: interviewError } = await supabase
      .from('interviews')
      .select('candidate_id, interviewer_feedback, evaluation_score, ai_summary, recommendation');
    if (interviewError && interviewError.code !== '42703' && interviewError.code !== 'PGRST204') {
      return next(interviewError);
    }
    if (interviewError) {
      // ai_summary / recommendation columns not added yet (see migration.sql)
      const { data: core, error: coreError } = await supabase
        .from('interviews')
        .select('candidate_id, interviewer_feedback, evaluation_score');
      if (coreError) return next(coreError);
      interviewsByCandidate = (core || []).reduce((acc, iv) => {
        acc[iv.candidate_id] = iv;
        return acc;
      }, {});
    } else {
      interviewsByCandidate = (interviewRows || []).reduce((acc, iv) => {
        acc[iv.candidate_id] = iv;
        return acc;
      }, {});
    }

    const byCandidate = (results || []).reduce((acc, r) => {
      acc[r.candidate_id] = r;
      return acc;
    }, {});

    const rows = (candidates || [])
      .filter((c) => byCandidate[c.id])
      .map((c) => {
        const r = byCandidate[c.id];
        const iv = interviewsByCandidate[c.id] || {};
        return {
          id: c.id,
          name: c.name,
          email: c.email || '',
          role: c.role || '',
          job_id: c.job_id,
          job_title: jobsById[c.job_id]?.title || '',
          resume_url: c.resume_url,
          applied_at: c.applied_at,
          status: c.status,
          ai_score: r.ai_score ?? 0,
          matched_skills: r.matched_skills || [],
          missing_skills: r.missing_skills || [],
          ai_notes: r.ai_notes || '',
          interview_score: iv.evaluation_score ?? null,
          interview_feedback: iv.interviewer_feedback || '',
          ai_summary: iv.ai_summary || '',
          recommendation: iv.recommendation || '',
          hire_start_date: c.hire_start_date || null,
          hire_notes: c.hire_notes || '',
          decided_at: c.decided_at || null,
          next_steps_completed: c.next_steps_completed || [],
        };
      });

    res.json(rows);
  } catch (error) {
    next(error);
  }
};

async function saveScreeningResult(candidateId, result) {
  const { error: deleteError } = await supabase
    .from('screening_results')
    .delete()
    .eq('candidate_id', candidateId);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from('screening_results').insert({
    candidate_id: candidateId,
    ai_score: result.score,
    matched_skills: result.matched_skills,
    missing_skills: result.missing_skills,
    ai_notes: result.summary,
  });
  if (insertError) throw insertError;
}

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download resume (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
