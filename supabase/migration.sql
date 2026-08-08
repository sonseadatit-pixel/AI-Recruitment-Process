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

-- Email-to-CV inbound pipeline (Mailgun webhook). Run this before using the
-- POST /api/email-webhook endpoint, or the backend cannot persist email
-- applications / notifications.
CREATE TABLE IF NOT EXISTS email_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email text NOT NULL,
  sender_name text,
  subject text,
  resume_url text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new'
);

-- Email body text captured from the Mailgun `body-plain` field so the detail
-- view can show the full message.
ALTER TABLE email_applications
  ADD COLUMN IF NOT EXISTS body text;

-- Links an email application to the candidate row created when it is submitted
-- to screening (see POST /api/email-applications/:id/submit-to-screening).
ALTER TABLE email_applications
  ADD COLUMN IF NOT EXISTS candidate_id uuid;

-- Status lifecycle: 'new' -> 'read' -> 'submitted' | 'rejected'.
-- Migrate rows created before the status model changed.
UPDATE email_applications SET status = 'new' WHERE status = 'new_from_email';
ALTER TABLE email_applications ALTER COLUMN status SET DEFAULT 'new';

-- Notification bell rows. Emailed CVs create a notification of type
-- 'new_email_cv' pointing at the email_applications row via candidate_id.
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  message text NOT NULL,
  candidate_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
