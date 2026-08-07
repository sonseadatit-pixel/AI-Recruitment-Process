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

  return `You are an expert HR recruitment assistant. Your task is to screen a candidate's resume against a job posting and evaluate how well the candidate fits.

Compare the candidate's resume to the job description and requirements below, considering skills, relevant experience, education, certifications, and any red flags or inconsistencies.

Return ONLY valid JSON with no commentary, no markdown, in this exact shape:
{
  "score": <number 0-100>,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3"],
  "summary": "<2-3 sentence summary of fit>"
}

Rules:
- "score" must be an integer between 0 and 100 reflecting overall fit.
- "matched_skills" must be an array of skill names explicitly present in the resume that are relevant to the job.
- "missing_skills" must be an array of skills the job requires that the resume does not demonstrate.
- "summary" must be a concise 2-3 sentence assessment.
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

  const parsed = JSON.parse(cleaned);

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
- Derive responsibilities and qualifications from the given details only. Do NOT invent company facts, benefits, perks, or a company name.
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

  return `You are an expert technical interviewer preparing a question set for an upcoming interview. Your questions must be tailored to this specific candidate and role.

Generate a question set that:
- Probes the candidate's matched skills with scenario and trade-off questions.
- Explores how the candidate would approach or ramp up on their missing skill areas.
- Covers the job's core requirements from the job description.
- Behavioral questions should explore teamwork, communication, ownership, handling conflict, and growth, tied to the candidate's background where possible.

Return ONLY valid JSON with no commentary, no markdown, in this exact shape:
{
  "technical": ["question1", "question2", "question3", "question4"],
  "behavioral": ["question1", "question2", "question3", "question4"]
}

Rules:
- Exactly 4 technical and exactly 4 behavioral questions.
- Each question must be 1-2 concise sentences, focused on ONE clear skill or scenario.
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

  const parsed = JSON.parse(cleaned);

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
  return `You are an expert HR assistant. Condense raw interviewer notes into a clear, professional summary for the candidate's hiring record.

Write a concise summary of 2-4 sentences that highlights the candidate's key strengths, any concerns, and the overall impression. Use professional HR documentation style.

Rules:
- Do NOT invent facts that are not present in the raw interviewer notes.
- Do NOT use markdown headers, bullet lists, or JSON — return plain prose only.
- Mention the interview score and recommendation only in natural, neutral terms tied to the notes.

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
