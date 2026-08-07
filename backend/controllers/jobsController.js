import { supabase, generateJobDescription, isClaudeConfigured } from '../services/claudeService.js';

function mapJob(job) {
  return {
    id: job.id,
    title: job.title,
    department: job.department || '',
    experience_level: job.experience_level || '',
    location: job.location || '',
    requirements: job.requirements || '',
    description: job.description || job.requirements || '',
    status: job.status || 'open',
    posted: job.created_at,
    applicants: 0,
  };
}

export const getJobs = async (req, res, next) => {
  try {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return next(error);

    const { data: candidates, error: candError } = await supabase.from('candidates').select('job_id');
    if (candError) return next(candError);

    const counts = (candidates || []).reduce((acc, c) => {
      acc[c.job_id] = (acc[c.job_id] || 0) + 1;
      return acc;
    }, {});

    res.json(
      (jobs || []).map((job) => ({
        ...mapJob(job),
        applicants: counts[job.id] || 0,
      }))
    );
  } catch (error) {
    next(error);
  }
};

export const createJob = async (req, res, next) => {
  try {
    const { title, department, experience_level, requirements, location } = req.body;
    const status = req.body.status || 'open';

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Job title is required' });
    }

    const description = (requirements || '').trim();
    const row = {
      title: title.trim(),
      description,
      requirements: description,
      status,
      department: (department || '').trim(),
      experience_level: (experience_level || '').trim(),
      location: (location || '').trim(),
    };

    const { data, error } = await supabase.from('jobs').insert(row).select().single();

    // The jobs table may not have department / experience_level / location columns yet
    // (see supabase/migration.sql). Fall back to the core columns so the request still works.
    if (error?.code === 'PGRST204') {
      const { data: minimal, error: e2 } = await supabase
        .from('jobs')
        .insert({ title: row.title, description, requirements: description, status })
        .select()
        .single();
      if (e2) return next(e2);
      return res.status(201).json(mapJob(minimal));
    }

    if (error) return next(error);
    res.status(201).json(mapJob(data));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/jobs/:id
 * Returns a single job posting with its applicant count.
 */
export const getJob = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: job, error } = await supabase.from('jobs').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ error: `Job not found: ${error.message}` });

    const { data: candidates, error: candError } = await supabase
      .from('candidates')
      .select('id')
      .eq('job_id', id);
    if (candError) return next(candError);

    res.json({ ...mapJob(job), applicants: (candidates || []).length });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/jobs/:id
 * Updates a job posting (e.g. open/closed status, description, requirements).
 */
export const updateJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const { data: existing, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError) return res.status(404).json({ error: `Job not found: ${fetchError.message}` });

    const status = body.status !== undefined ? body.status : existing.status;
    if (!['open', 'closed', 'Active', 'Closed'].includes(status)) {
      return res.status(400).json({ error: 'status must be "open" or "closed"' });
    }

    const fields = {
      status,
      title: typeof body.title === 'string' ? body.title.trim() : existing.title,
      department: typeof body.department === 'string' ? body.department.trim() : existing.department || '',
      experience_level:
        typeof body.experience_level === 'string' ? body.experience_level.trim() : existing.experience_level || '',
      location: typeof body.location === 'string' ? body.location.trim() : existing.location || '',
    };

    const description =
      typeof body.requirements === 'string'
        ? body.requirements.trim()
        : typeof body.description === 'string'
          ? body.description.trim()
          : existing.description || existing.requirements || '';
    fields.description = description;
    fields.requirements = description;

    const { data: updated, error } = await supabase.from('jobs').update(fields).eq('id', id).select().single();
    if (error) return next(error);

    res.json(mapJob(updated));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/jobs/:id
 * Deletes a job posting. Refuses (409) when candidates are attached to the job,
 * because the jobs → candidates → screening_results foreign keys cascade and
 * would silently wipe screening history.
 */
export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', id)
      .single();
    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { count, error: countError } = await supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', id);
    if (countError) return next(countError);

    if (count > 0) {
      return res
        .status(409)
        .json({ error: `This job still has ${count} candidate${count === 1 ? '' : 's'} attached. Delete its candidates first (Candidates page), then delete the job.` });
    }

    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) return next(error);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/jobs/generate-description
 * Generates a draft job description with Claude for preview. Does NOT save to
 * the database — returns { description } so the HR user can review/edit it
 * before posting.
 */
export const generateDescription = async (req, res, next) => {
  try {
    const { title, department, experienceLevel, keyRequirements, location } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Job title is required' });
    }
    if (!keyRequirements || typeof keyRequirements !== 'string' || !keyRequirements.trim()) {
      return res.status(400).json({ error: 'Key requirements are required' });
    }
    if (!isClaudeConfigured()) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY is not set. Claude job description generation is unavailable.' });
    }

    const description = await generateJobDescription(
      title.trim(),
      (department || '').trim(),
      (experienceLevel || '').trim(),
      keyRequirements.trim(),
      (location || '').trim()
    );

    res.json({ description });
  } catch (error) {
    next(error);
  }
};
