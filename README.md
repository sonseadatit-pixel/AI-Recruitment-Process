# AI Recruitment Process

AI-powered end-to-end recruitment platform. Resumes are uploaded, screened by AI (Claude), shortlisted, moved through interviews with AI-generated questions and evaluation summaries, and end in a final human hiring recommendation.

## Project structure

```
backend/   Express + Supabase + Claude (Anthropic) API server
frontend/  React + Vite + Tailwind CSS single-page app
supabase/  SQL migration for the database schema
```

## Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router, framer-motion
- **Backend:** Express, Supabase (Postgres + Storage), Anthropic Claude SDK, multer (PDF upload), pdf-parse
- **Database:** Supabase (Postgres) — tables: `jobs`, `candidates`, `screening_results`, `interviews`

## Setup

1. Create a Supabase project and run `supabase/migration.sql` to create the schema.
2. Copy `backend/.env.example` to `backend/.env` and fill in:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (Claude), `CLAUDE_MODEL`
3. Copy `frontend/.env.example` to `frontend/.env` and fill in:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Run locally

```bash
# Backend (API on http://localhost:5000)
cd backend
npm install
npm run dev

# Frontend (dev server)
cd frontend
npm install
npm run dev
```

Open the frontend URL printed by Vite (default `http://localhost:5173`).

## Workflow

1. **Jobs** — post job openings with AI-generated descriptions.
2. **Candidates** — upload candidate resumes (PDF).
3. **Screening** — AI screens resumes against the job and scores each candidate; HR confirms shortlists.
4. **Interviews** — AI generates tailored interview questions and summarizes interviewer feedback into an evaluation score.
5. **Recommendations** — overall match (screening + interview), final hire/reject decision, start date and next steps.

> AI scores and recommendations are advisory. Final hiring decisions are made by HR.
