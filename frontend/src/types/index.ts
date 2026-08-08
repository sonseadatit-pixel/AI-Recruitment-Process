export type Screen =
  | 'dashboard'
  | 'jobs'
  | 'candidates'
  | 'screening'
  | 'candidate-profile'
  | 'interview-questions'
  | 'interview-evaluation'
  | 'recommendation'
  | 'settings';

export type CandidateStatus = 'shortlisted' | 'ai-suggested' | 'pending' | 'rejected' | 'new' | 'screened' | 'hired';

export type JobStatus = 'open' | 'closed' | 'Active' | 'Closed';

export interface Candidate {
  id: string;
  name: string;
  email: string;
  role: string;
  score: number;
  status: CandidateStatus;
  appliedDate: string;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  interviewScore?: number;
  interviewFeedback?: string;
  resume_url?: string;
  jobId?: string;
  jobTitle?: string;
  screened: boolean;
  hireStartDate?: string;
  hireNotes?: string;
  decidedAt?: string;
  nextSteps?: string[];
}

export interface JobPosting {
  id: string;
  title: string;
  department: string;
  applicants: number;
  status: JobStatus;
  posted: string;
  experience_level?: string;
  location?: string;
  requirements?: string;
  description?: string;
}

export interface DashboardStats {
  totalJobs: number;
  totalCandidates: number;
  aiScreened: number;
  shortlisted: number;
  changes: { jobs: string; candidates: string; aiScreened: string; shortlisted: string };
}

export interface PipelineStage {
  stage: string;
  count: number;
  pct: number;
  color: string;
}

export interface UploadedResume {
  name: string;
  size: string;
  status: 'ready' | 'analyzed';
  file: File;
}

export interface AiQuestionSet {
  technical: string[];
  behavioral: string[];
}

export interface AppSettings {
  userId?: string;
  minAiScore: number;
  weightedSkills: string;
  emailNewApplication: boolean;
  emailScreeningComplete: boolean;
  fullName: string;
  email?: string;
  updatedAt?: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  message: string;
  candidate_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface EmailApplication {
  id: string;
  sender_email: string;
  sender_name?: string;
  subject?: string;
  body?: string | null;
  resume_url: string;
  received_at: string;
  status: string;
  candidate_id?: string;
}

export interface JobDescription {
  title: string;
  meta: string;
  about: string;
  responsibilities: string[];
  requirements: string[];
}

export interface ScreeningBatchResult {
  candidateId: string | null;
  fileName: string;
  aiScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  aiNotes: string;
}

export interface ScreeningBatchResponse {
  jobId: string;
  total: number;
  results: ScreeningBatchResult[];
}
