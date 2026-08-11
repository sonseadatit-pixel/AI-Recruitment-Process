import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PDFParse } from 'pdf-parse';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export const isClaudeConfigured = () => Boolean(anthropic);

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

/**
 * Extract plain text from a PDF buffer using pdf-parse (v2 API).
 */
export async function extractResumeText(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Expected a Buffer to extract resume text from');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result?.text || '').trim();
    if (!text) throw new Error('No text could be extracted from the PDF');
    return text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Compare a resume against a job posting using Claude and return a normalized
 * result object:
 *   { score, matched_skills, missing_skills, summary }
 * `weightedSkills` is an optional string of skills the user wants weighted more
 * heavily in the score (from the settings table).
 */
export async function screenResume(resumeText, jobDescription, jobRequirements, weightedSkills = '') {
  if (!isClaudeConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set. Claude resume screening is unavailable.');
  }

  const prompt = buildScreeningPrompt(resumeText, jobDescription, jobRequirements, weightedSkills);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return parseScreeningJson(content);
}

function buildScreeningPrompt(resumeText, jobDescription, jobRequirements, weightedSkills = '') {
  const weighted = weightedSkills && weightedSkills.trim()
    ? `\n=== WEIGHTED SKILLS ===\nThese skills should be weighted more heavily in scoring: ${weightedSkills.trim()}`
    : '';

  return `You are an expert HR recruitment assistant supporting an HR team. Your job is to screen a candidate's resume against a job posting and report the evidence you find. You are a tool that assists HR — you never hire, reject, or shortlist candidates yourself. HR reviews your output and makes the final decision.

Compare the candidate's resume to the job description and requirements below, considering only evidence actually present in the resume: relevant skills, experience, education, certifications, and any red flags or inconsistencies.

Return ONLY valid JSON with no commentary, no markdown, in this exact shape:
{
  "score": <number 0-100>,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3"],
  "summary": "<2-3 sentence summary of fit>"
}

Scoring guidance — score how well the resume demonstrates the job's requirements:
- 90-100: Excellent fit. The resume directly demonstrates almost all key requirements and relevant experience.
- 75-89: Strong fit. The resume demonstrates most key requirements, with a few minor gaps.
- 50-74: Moderate fit. Some key requirements are met, but notable gaps exist.
- 25-49: Weak fit. The resume meets few key requirements.
- 0-24: Poor fit. The resume does not demonstrate the job's key requirements.
Base the score ONLY on job-related evidence in the resume. A shorter or less polished resume should NOT be penalized beyond the actual gaps in the evidence.

Rules:
- "score" must be an integer between 0 and 100 reflecting overall fit based on the evidence.
- "matched_skills" must be an array of skill names explicitly present in the resume that are relevant to the job. Never invent or infer skills that are not stated.
- "missing_skills" must be an array of skills the job requires that the resume does not demonstrate.
- "summary" must be a concise 2-3 sentence assessment of the evidence found. Describe what the resume does and does not demonstrate. Do NOT recommend hiring, shortlisting, or rejection — HR decides.
- NEVER consider, mention, or infer protected characteristics such as age, gender, race, ethnicity, religion, marital status, disability, or national origin. These must never affect the score or the summary.
- If the resume provides no relevant evidence, score honestly low and say so.
${weighted}
=== JOB DESCRIPTION ===
${jobDescription || '(not provided)'}

=== JOB REQUIREMENTS ===
${jobRequirements || '(not provided)'}

=== CANDIDATE RESUME ===
${resumeText}`;
}

function parseScreeningJson(text) {
  let cleaned = String(text || '').trim();

  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();

  const braceStart = cleaned.indexOf('{');
  const braceEnd = cleaned.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    cleaned = cleaned.slice(braceStart, braceEnd + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Claude returned invalid JSON for resume screening: ${error.message}`);
  }

  const score = Number(parsed.score);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    matched_skills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills.map(String) : [],
    missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills.map(String) : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}

/**
 * Generate a complete, professional job description with Claude based on the
 * role's title, department, experience level, key requirements, and location.
 * Returns the description as plain text (a document, not JSON).
 */
export async function generateJobDescription(title, department, experienceLevel, keyRequirements, location) {
  if (!isClaudeConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set. Claude job description generation is unavailable.');
  }

  const prompt = buildJobDescriptionPrompt(title, department, experienceLevel, keyRequirements, location);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return String(content || '').trim();
}

function buildJobDescriptionPrompt(title, department, experienceLevel, keyRequirements, location) {
  return `You are an expert HR content writer who writes clear, engaging, and professional job postings.

Write a complete job description for the role described below. Return it as plain text (a document), NOT JSON. Do not wrap it in markdown code fences.

Structure the output exactly like this:

<Job Title> | <Department> | <Experience Level>
<Location>

Overview
<A short 2-3 sentence summary of the role: what the person will own, why the role matters, and the impact they will have>

What You'll Do
- <responsibility 1>
- <responsibility 2>
- <responsibility 3>
(3-5 bullet points describing day-to-day responsibilities, derived from the title, experience level, and key requirements)

What We're Looking For
- <skill or qualification>
- <skill or qualification>
(bullet points covering every one of the key requirements, plus any related qualifications implied by the experience level)

Rules:
- Tone must be professional but approachable: energetic, inclusive, and human. Avoid corporate jargon and fluff.
- Derive responsibilities and qualifications from the given details only. Never invent company facts, benefits, perks, salaries, company name, culture claims, or specific tools or technologies not listed in the key requirements.
- Cover every key requirement exactly once in the "What We're Looking For" section. Do not repeat requirements in the Overview, "What You'll Do", or across bullets.
- Keep the whole description tight and skimmable.

=== JOB DETAILS ===
Title: ${title || '(not provided)'}
Department: ${department || '(not provided)'}
Experience Level: ${experienceLevel || '(not provided)'}
Location: ${location || '(not provided)'}

=== KEY REQUIREMENTS ===
${keyRequirements || '(not provided)'}`;
}

/**
 * Generate a tailored interview question set with Claude for a specific
 * candidate and role. Returns a normalized object:
 *   { technical: string[], behavioral: string[] }
 * `customInstructions` is optional HR guidance appended to the prompt.
 */
export async function generateInterviewQuestions(candidateName, resumeText, jobTitle, jobRequirements, matchedSkills, missingSkills, customInstructions) {
  if (!isClaudeConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set. Claude interview question generation is unavailable.');
  }

  const prompt = buildInterviewQuestionsPrompt(candidateName, resumeText, jobTitle, jobRequirements, matchedSkills, missingSkills, customInstructions);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return parseInterviewQuestionsJson(content);
}

function buildInterviewQuestionsPrompt(candidateName, resumeText, jobTitle, jobRequirements, matchedSkills, missingSkills, customInstructions) {
  const matched = Array.isArray(matchedSkills) && matchedSkills.length > 0
    ? matchedSkills.map(String).join(', ')
    : '(none provided)';
  const missing = Array.isArray(missingSkills) && missingSkills.length > 0
    ? missingSkills.map(String).join(', ')
    : '(none provided)';

  const guidance = customInstructions
    ? `\n=== ADDITIONAL INSTRUCTIONS FROM HR ===\n${customInstructions}`
    : '';

  return `You are an expert technical interviewer supporting an HR team. Your job is to prepare a question set that helps HR gather additional evidence about a specific candidate during an upcoming interview. You assist HR — you do not decide whether the candidate is hired or rejected.

Generate a question set that:
- Probes the candidate's matched skills with scenario and trade-off questions, to verify the depth of skills already shown on the resume.
- Explores how the candidate would approach or ramp up on their missing skill areas, to gauge aptitude and learning approach.
- Covers the job's core requirements from the job description, phrased so they can be answered by this candidate.
- Behavioral questions should explore teamwork, communication, ownership, handling conflict, and growth, tied to the candidate's background where possible.

Return ONLY valid JSON with no commentary, no markdown, in this exact shape:
{
  "technical": ["question1", "question2", "question3", "question4"],
  "behavioral": ["question1", "question2", "question3", "question4"]
}

Rules:
- Exactly 4 technical and exactly 4 behavioral questions.
- Each question must be 1-2 concise sentences, focused on ONE clear skill or scenario.
- Questions must be evidence-gathering: they help HR confirm or clarify what is already in the resume and explore gaps. Do not ask yes/no questions or questions already answerable from the resume.
- Base every question on the candidate, job, matched skills, and missing skills provided below. Never assume skills, experience, or background that are not present in the provided information.
- Do not ask about protected characteristics (age, gender, race, religion, marital status, disability, national origin) or anything not relevant to job performance.
- Ensure the 8 questions are distinct. Do not duplicate or rephrase the same question.
- Write in plain, standard interview language, like a real HR interviewer would ask. Avoid heavy technical jargon and avoid overly specific references to minor project details from the resume.
- Questions must be open-ended and interview-ready.

=== CANDIDATE ===
Name: ${candidateName || '(not provided)'}

=== CANDIDATE RESUME ===
${resumeText || '(not provided)'}

=== JOB TITLE ===
${jobTitle || '(not provided)'}

=== JOB REQUIREMENTS ===
${jobRequirements || '(not provided)'}

=== MATCHED SKILLS ===
${matched}

=== MISSING SKILLS ===
${missing}${guidance}`;
}

function parseInterviewQuestionsJson(text) {
  let cleaned = String(text || '').trim();

  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();

  const braceStart = cleaned.indexOf('{');
  const braceEnd = cleaned.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    cleaned = cleaned.slice(braceStart, braceEnd + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Claude returned invalid JSON for interview questions: ${error.message}`);
  }

  const cleanList = (value) => (Array.isArray(value) ? value.map(String).filter(Boolean) : []);

  return {
    technical: cleanList(parsed.technical),
    behavioral: cleanList(parsed.behavioral),
  };
}

/**
 * Condense raw interviewer notes into a clear, professional 2-4 sentence
 * summary with Claude. Returns the summary as plain text (not JSON).
 */
export async function generateInterviewSummary(candidateName, jobTitle, resumeScore, interviewFeedback, interviewScore, recommendation) {
  if (!isClaudeConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set. Claude interview summary generation is unavailable.');
  }

  const prompt = buildInterviewSummaryPrompt(candidateName, jobTitle, resumeScore, interviewFeedback, interviewScore, recommendation);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return String(content || '').trim();
}

function buildInterviewSummaryPrompt(candidateName, jobTitle, resumeScore, interviewFeedback, interviewScore, recommendation) {
  return `You are an expert HR assistant supporting an HR team. Condense raw interviewer notes into a clear, professional summary for the candidate's hiring record. You summarize evidence and assist HR — you never make or create a hiring decision or recommendation yourself.

Write a concise summary of 2-4 sentences that highlights the candidate's key strengths, any concerns, and the overall impression, based only on the raw interviewer notes.

Rules:
- Do NOT invent facts that are not present in the raw interviewer notes.
- Do NOT create, change, or suggest a new recommendation, score, or decision. Only reflect the interview score and recommendation exactly as provided, and only in natural, neutral terms tied to the notes.
- Do NOT use markdown headers, bullet lists, or JSON — return plain prose only.
- If the raw notes are missing or empty, say the notes were unavailable rather than inventing content.

=== CANDIDATE ===
Name: ${candidateName || '(not provided)'}
Job Title: ${jobTitle || '(not provided)'}
Resume Screening Score: ${resumeScore ?? '(not provided)'}

=== INTERVIEW DETAILS ===
Interview Score: ${interviewScore ?? '(not provided)'}
Recommendation: ${recommendation || '(not provided)'}

=== RAW INTERVIEWER FEEDBACK ===
${interviewFeedback || '(not provided)'}`;
}

/*
 * Legacy batch flow (POST /api/screening/batch). Screens uploaded resume files
 * against a job using the same Claude pipeline.
 */
export async function screenResumesWithClaude({ jobId, resumes }) {
  const job = await fetchJob(jobId);

  if (!isClaudeConfigured()) {
    console.warn('[claudeService] ANTHROPIC_API_KEY not set. Returning placeholder results.');
    return resumes.map((resume, index) => placeholderResult(job, resume, index));
  }

  const jobDescription = job.description || job.requirements || '';
  const jobRequirements = job.requirements || job.description || '';

  const results = [];
  for (const file of resumes) {
    try {
      const resumeText = await extractResumeText(file.buffer);
      const screening = await screenResume(resumeText, jobDescription, jobRequirements);
      results.push({
        candidateId: null,
        fileName: file.originalname,
        aiScore: screening.score,
        matchedSkills: screening.matched_skills,
        missingSkills: screening.missing_skills,
        aiNotes: screening.summary,
      });
    } catch (error) {
      results.push({
        candidateId: null,
        fileName: file.originalname,
        aiScore: 0,
        matchedSkills: [],
        missingSkills: [],
        aiNotes: `[Failed] ${error.message}`,
      });
    }
  }
  return results;
}

async function fetchJob(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('title, description, requirements')
    .eq('id', jobId)
    .single();

  if (error) throw new Error(`Job not found: ${error.message}`);
  return data;
}

function placeholderResult(job, resume, index) {
  return {
    candidateId: null,
    fileName: resume.originalname,
    aiScore: 50 + index * 5,
    matchedSkills: [],
    missingSkills: [],
    aiNotes: `[Placeholder] Scored against "${job.title}" - Claude API not configured.`,
  };
}
