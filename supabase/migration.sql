-- Run this in the Supabase SQL editor to add the extended fields.
-- Until this runs, POST /api/jobs saves only title, requirements (as description) and status,
-- and candidate uploads are saved without a status.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS location text;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';

-- Interview evaluation fields (AI summary + recommendation).
-- Run this before using the Interview Evaluation / Final Recommendation flow, or the
-- backend falls back to the core interview columns.
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS recommendation text;

-- Per-user settings (AI screening thresholds, weighted skills, notification
-- preferences, display name). Run this before using the Settings page or the
-- backend falls back to defaults (min_ai_score = 75, no weighted skills).
CREATE TABLE IF NOT EXISTS settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  min_ai_score integer NOT NULL DEFAULT 75,
  weighted_skills text,
  email_new_application boolean NOT NULL DEFAULT true,
  email_screening_complete boolean NOT NULL DEFAULT true,
  full_name text,
  updated_at timestamp DEFAULT now()
);

-- Hire decision details. Run this before recording hire/reject decisions on the
-- Final Recommendation page, or the backend falls back to persisting only the
-- candidate status (start date / notes / next-steps checklist won't be stored).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS hire_start_date date,
  ADD COLUMN IF NOT EXISTS hire_notes text,
  ADD COLUMN IF NOT EXISTS decided_at timestamp,
  ADD COLUMN IF NOT EXISTS next_steps_completed jsonb DEFAULT '[]'::jsonb;
