import { supabase } from './supabaseClient';
import type {
  AiQuestionSet,
  AppSettings,
  Candidate,
  DashboardStats,
  EmailApplication,
  JobPosting,
  NotificationItem,
  PipelineStage,
} from '../types';

const BACKEND_URL = import.meta.env.VITE_API_URL || '/api';

const AI_SHORTLIST_THRESHOLD = 75;

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/*
 * Service layer for the recruitment workflow.
 *
 * IMPORTANT: Most functions are STUBS returning empty data. Replace them with
 * real Supabase queries / Express backend calls as each workflow step is built.
 * Database tables already exist: jobs, candidates, screening_results, interviews, decisions.
 */

export async function fetchJobs(): Promise<JobPosting[]> {
  const res = await fetch(`${BACKEND_URL}/jobs`);
  if (!res.ok) throw new Error(`Failed to load jobs (HTTP ${res.status})`);
  return res.json();
}

export async function fetchJob(id: string): Promise<JobPosting> {
  const res = await fetch(`${BACKEND_URL}/jobs/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load job (HTTP ${res.status})`);
  }
  return res.json();
}

export async function updateJobStatus(
  id: string,
  status: 'open' | 'closed'
): Promise<JobPosting> {
  const res = await fetch(`${BACKEND_URL}/jobs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to update job (HTTP ${res.status})`);
  }
  return res.json();
}

export interface JobPatch {
  title?: string;
  department?: string;
  experience_level?: string;
  location?: string;
  requirements?: string;
  description?: string;
  status?: 'open' | 'closed';
}

export async function updateJob(id: string, patch: JobPatch): Promise<JobPosting> {
  const res = await fetch(`${BACKEND_URL}/jobs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to update job (HTTP ${res.status})`);
  }
  return res.json();
}

export async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to delete job (HTTP ${res.status})`);
  }
}

export async function createJob(input: {
  title: string;
  department: string;
  experience_level: string;
  requirements: string;
  location: string;
}): Promise<JobPosting> {
  const res = await fetch(`${BACKEND_URL}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, status: 'open' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create job (HTTP ${res.status})`);
  }
  return res.json();
}

export async function generateJobDescription(input: {
  title: string;
  department: string;
  experienceLevel: string;
  keyRequirements: string;
  location: string;
}): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/jobs/generate-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to generate description (HTTP ${res.status})`);
  }
  const data = await res.json();
  return String(data.description ?? '');
}

export async function fetchCandidates(jobId?: string): Promise<Candidate[]> {
  const url = jobId
    ? `${BACKEND_URL}/candidates?jobId=${encodeURIComponent(jobId)}`
    : `${BACKEND_URL}/candidates`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load candidates (HTTP ${res.status})`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map(mapCandidate);
}

export async function fetchScreeningResults(
  jobId?: string,
  threshold: number = AI_SHORTLIST_THRESHOLD
): Promise<Candidate[]> {
  const url = jobId
    ? `${BACKEND_URL}/screening/results?job_id=${encodeURIComponent(jobId)}`
    : `${BACKEND_URL}/screening/results`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load screening results (HTTP ${res.status})`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map((row) => mapScreeningResult(row, threshold));
}

export async function runScreening(
  jobId: string
): Promise<{ job_id: string; total: number; succeeded: number; failed: number }> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  const res = await fetch(`${BACKEND_URL}/screening/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ job_id: jobId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Screening failed (HTTP ${res.status})`);
  }
  return res.json();
}

export async function uploadCandidates(
  jobId: string,
  files: File[]
): Promise<{ jobId: string; total: number; candidates: Candidate[] }> {
  const form = new FormData();
  form.append('jobId', jobId);
  files.forEach((f) => form.append('resumes', f));

  const res = await fetch(`${BACKEND_URL}/candidates/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (HTTP ${res.status})`);
  }
  return res.json();
}

export async function deleteCandidate(id: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/candidates/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Delete failed (HTTP ${res.status})`);
  }
}

function mapCandidate(row: Record<string, unknown>): Candidate {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? 'Candidate'),
    email: String(row.email ?? ''),
    role: String(row.role ?? ''),
    score: Number(row.ai_score ?? 0),
    status: (row.status as Candidate['status']) ?? 'new',
    appliedDate: String(row.applied_at ?? ''),
    matchedSkills: Array.isArray(row.matched_skills) ? (row.matched_skills as string[]) : [],
    missingSkills: Array.isArray(row.missing_skills) ? (row.missing_skills as string[]) : [],
    summary: String(row.ai_notes ?? ''),
    resume_url: typeof row.resume_url === 'string' ? row.resume_url : undefined,
    jobId: typeof row.job_id === 'string' ? row.job_id : undefined,
    jobTitle: typeof row.job_title === 'string' && row.job_title ? row.job_title : undefined,
    hireStartDate: typeof row.hire_start_date === 'string' && row.hire_start_date ? row.hire_start_date : undefined,
    hireNotes: typeof row.hire_notes === 'string' && row.hire_notes ? row.hire_notes : undefined,
    decidedAt: typeof row.decided_at === 'string' ? row.decided_at : undefined,
    nextSteps: Array.isArray(row.next_steps_completed) ? (row.next_steps_completed as string[]) : [],
    screened: Boolean(row.screened ?? (row.ai_score != null)),
    interviewScore: row.interview_score != null ? Number(row.interview_score) : undefined,
    interviewFeedback:
      typeof row.interview_feedback === 'string' && row.interview_feedback
        ? row.interview_feedback
        : undefined,
  };
}

function mapScreeningResult(row: Record<string, unknown>, threshold: number = AI_SHORTLIST_THRESHOLD): Candidate {
  const score = Number(row.ai_score ?? 0);
  const rawStatus = String(row.status ?? 'pending');
  let status: Candidate['status'];
  if (
    rawStatus === 'shortlisted' ||
    rawStatus === 'rejected' ||
    rawStatus === 'ai-suggested' ||
    rawStatus === 'hired'
  ) {
    status = rawStatus as Candidate['status'];
  } else {
    // Every row here has a screening result, so a candidate that is not yet
    // shortlisted/rejected is pending HR approval — high scores are AI-suggested.
    status = score >= threshold ? 'ai-suggested' : 'pending';
  }
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? 'Candidate'),
    email: String(row.email ?? ''),
    role: String(row.role ?? ''),
    score,
    status,
    appliedDate: String(row.applied_at ?? ''),
    matchedSkills: Array.isArray(row.matched_skills) ? (row.matched_skills as string[]) : [],
    missingSkills: Array.isArray(row.missing_skills) ? (row.missing_skills as string[]) : [],
    summary: String(row.ai_notes ?? ''),
    resume_url: typeof row.resume_url === 'string' ? row.resume_url : undefined,
    jobId: typeof row.job_id === 'string' ? row.job_id : undefined,
    jobTitle: typeof row.job_title === 'string' && row.job_title ? row.job_title : undefined,
    hireStartDate: typeof row.hire_start_date === 'string' && row.hire_start_date ? row.hire_start_date : undefined,
    hireNotes: typeof row.hire_notes === 'string' && row.hire_notes ? row.hire_notes : undefined,
    decidedAt: typeof row.decided_at === 'string' ? row.decided_at : undefined,
    nextSteps: Array.isArray(row.next_steps_completed) ? (row.next_steps_completed as string[]) : [],
    screened: true,
    interviewScore: row.interview_score != null ? Number(row.interview_score) : undefined,
    interviewFeedback:
      typeof row.interview_feedback === 'string' && row.interview_feedback
        ? row.interview_feedback
        : undefined,
  };
}

function mapSettingsRow(row: Record<string, unknown>): AppSettings {
  return {
    userId: typeof row.user_id === 'string' ? row.user_id : undefined,
    minAiScore: Number(row.min_ai_score ?? 75),
    weightedSkills: typeof row.weighted_skills === 'string' ? row.weighted_skills : '',
    emailNewApplication: row.email_new_application !== false,
    emailScreeningComplete: row.email_screening_complete !== false,
    fullName: typeof row.full_name === 'string' ? row.full_name : '',
    email: typeof row.email === 'string' ? row.email : undefined,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  };
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${BACKEND_URL}/settings`, { headers: await authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load settings (HTTP ${res.status})`);
  }
  return mapSettingsRow(await res.json());
}

export async function saveSettings(input: {
  minAiScore: number;
  weightedSkills: string;
  emailNewApplication: boolean;
  emailScreeningComplete: boolean;
  fullName: string;
}): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      min_ai_score: input.minAiScore,
      weighted_skills: input.weightedSkills,
      email_new_application: input.emailNewApplication,
      email_screening_complete: input.emailScreeningComplete,
      full_name: input.fullName,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to save settings (HTTP ${res.status})`);
  }
}

export async function generateInterviewQuestions(
  candidateId: string,
  customInstructions?: string
): Promise<AiQuestionSet> {
  const res = await fetch(
    `${BACKEND_URL}/candidates/${encodeURIComponent(candidateId)}/interview-questions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customInstructions: customInstructions ?? '' }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to generate questions (HTTP ${res.status})`);
  }
  const data = await res.json();
  const q = data.questions ?? {};
  return {
    technical: Array.isArray(q.technical) ? q.technical.map(String) : [],
    behavioral: Array.isArray(q.behavioral) ? q.behavioral.map(String) : [],
  };
}

export async function fetchSavedInterviewQuestions(
  candidateId: string
): Promise<AiQuestionSet> {
  const res = await fetch(
    `${BACKEND_URL}/candidates/${encodeURIComponent(candidateId)}/interview-questions`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load questions (HTTP ${res.status})`);
  }
  const data = await res.json();
  const q = data.questions ?? {};
  return {
    technical: Array.isArray(q.technical) ? q.technical.map(String) : [],
    behavioral: Array.isArray(q.behavioral) ? q.behavioral.map(String) : [],
  };
}

export async function saveInterviewQuestions(
  candidateId: string,
  questions: AiQuestionSet
): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/candidates/${encodeURIComponent(candidateId)}/interview-questions`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(questions),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to save questions (HTTP ${res.status})`);
  }
}

export async function generateInterviewSummary(input: {
  candidateId: string;
  interviewFeedback: string;
  interviewScore: number;
  recommendation: string;
}): Promise<string> {
  const res = await fetch(
    `${BACKEND_URL}/candidates/${encodeURIComponent(input.candidateId)}/interview-evaluation`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interviewFeedback: input.interviewFeedback,
        interviewScore: input.interviewScore,
        recommendation: input.recommendation,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to generate summary (HTTP ${res.status})`);
  }
  const data = await res.json();
  return String(data.summary ?? '');
}

export async function saveInterviewEvaluation(input: {
  candidateId: string;
  interviewFeedback: string;
  interviewScore: number;
  recommendation: string;
  aiSummary: string;
}): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/candidates/${encodeURIComponent(input.candidateId)}/interview-evaluation`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interviewFeedback: input.interviewFeedback,
        interviewScore: input.interviewScore,
        recommendation: input.recommendation,
        aiSummary: input.aiSummary,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to save evaluation (HTTP ${res.status})`);
  }
}

export async function saveDecision(
  candidateId: string,
  payload: {
    decision?: 'hire' | 'reject' | 'reset';
    hireStartDate?: string;
    hireNotes?: string;
    nextSteps?: string[];
  }
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/candidates/${encodeURIComponent(candidateId)}/decision`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to save decision (HTTP ${res.status})`);
  }
}

export async function fetchDashboardStats(): Promise<DashboardStats | null> {
  // TODO: aggregate counts from Supabase (jobs, candidates, screening_results)
  return null;
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/notifications`, { headers });
  if (!res.ok) throw new Error(`Failed to load notifications (HTTP ${res.status})`);
  return res.json();
}

export async function markNotificationRead(id: string): Promise<NotificationItem> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PUT',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to update notification (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchEmailApplications(): Promise<EmailApplication[]> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/email-applications`, { headers });
  if (!res.ok) throw new Error(`Failed to load email applications (HTTP ${res.status})`);
  return res.json();
}

export async function submitEmailApplicationToScreening(
  id: string,
  jobId: string
): Promise<{ candidate: Candidate; application: EmailApplication }> {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
  const res = await fetch(
    `${BACKEND_URL}/email-applications/${encodeURIComponent(id)}/submit-to-screening`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ jobId }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to submit to screening (HTTP ${res.status})`);
  }
  return res.json();
}

export async function markEmailApplicationRead(id: string): Promise<EmailApplication> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/email-applications/${encodeURIComponent(id)}/mark-read`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to mark as read (HTTP ${res.status})`);
  }
  return res.json();
}

export async function rejectEmailApplication(id: string): Promise<EmailApplication> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/email-applications/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to reject (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchPipeline(): Promise<PipelineStage[]> {
  // TODO: aggregate pipeline counts from Supabase
  return [];
}
