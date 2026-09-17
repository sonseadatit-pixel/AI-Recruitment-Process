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
 * Extract plain text from a PDF buffer using pdf-parse (v2 API). When the
 * resulting text is largely unreadable (e.g. a scanned resume or a PDF with an
 * embedded font that has no Unicode mapping), falls back to OCR (render the
 * pages to images with pdf-to-img, then read them with tesseract.js).
 */
export async function extractResumeText(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Expected a Buffer to extract resume text from');
  const parser = new PDFParse({ data: buffer });
  let text = '';
  try {
    const result = await parser.getText();
    text = (result?.text || '').trim();
  } finally {
    await parser.destroy();
  }

  if (text && isReadableText(text)) return text;

  // Text is missing or unreadable — fall back to OCR so scanned / encoded-font
  // PDFs can still be screened.
  return ocrPdf(buffer);
}

/**
 * Heuristic to decide whether extracted text is genuinely readable. Encoded
 * fonts / scanned docs produce control characters or binary noise rather than
 * letters, so the ratio of ASCII letters to the total length is a good signal.
 */
function isReadableText(text) {
  if (!text) return false;
  const len = text.length;
  if (len < 20) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return letters / len >= 0.5;
}

let ocrWorkerPromise = null;

/**
 * Render each PDF page to an image and OCR it with tesseract.js, returning the
 * concatenated text. Returns an empty string if every page is blank.
 */
async function ocrPdf(buffer) {
  // pdf-to-img renders using pdfjs-dist. Pin the worker to the same bundled
  // pdfjs-dist so its internal version check never mismatches.
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'file://' + require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs').replace(/\\/g, '/')
  ).href;

  const { pdf } = await import('pdf-to-img');
  const pages = await pdf(new Uint8Array(buffer), { scale: 3 });
  let allText = '';
  if (!ocrWorkerPromise) {
    const { createWorker } = await import('tesseract.js');
    ocrWorkerPromise = createWorker('eng');
  }
  const worker = await ocrWorkerPromise;
  for await (const image of pages) {
    const { data } = await worker.recognize(image);
    const pageText = String(data?.text || '').trim();
    if (pageText) allText += pageText + '\n';
  }
  return allText.trim();
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

  let content = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    content = (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    try {
      return parseScreeningJson(content);
    } catch (error) {
      // Log the failure alongside a snippet of what Claude actually returned so
      // truncation / empty responses are diagnosable, then retry once.
      const blockTypes = (response.content || []).map((b) => b.type).join(',');
      console.warn(
        `[screenResume] attempt ${attempt + 1} failed (${error.message}). ` +
          `content.length=${content.length} blocks=[${blockTypes}] ` +
          `preview="${String(content).slice(0, 300)}"`
      );
      if (attempt === 1) throw error;
    }
  }

  throw new Error('Claude did not return valid screening JSON');
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
    // The response is likely truncated (Claude hit its output limit mid-JSON).
    // Attempt to repair the partial JSON so screening doesn't fail outright.
    parsed = repairTruncatedJson(cleaned);
    if (parsed == null) {
      throw new Error(`Claude returned invalid JSON for resume screening: ${error.message}`);
    }
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
 * Attempt to repair a JSON response that was truncated by Claude's output limit.
 * Closes any unclosed strings, arrays, and objects, then tries to parse again.
 * Returns the parsed object, or null if it cannot be salvaged.
 */
function repairTruncatedJson(text) {
  if (!text) return null;

  // Collect the prefix up to the first '{' and work on the tail from there.
  const start = text.indexOf('{');
  if (start === -1) return null;
  let s = text.slice(start);

  // Build a normalized string where we can repair truncation char by char.
  let out = '';
  let i = 0;
  let inString = false;
  const stack = [];

  while (i < s.length) {
    const ch = s[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        if (i + 1 < s.length) {
          out += s[i + 1];
          i += 2;
          continue;
        }
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inString = true;
      i++;
      continue;
    }
    if (ch === '{' || ch === '[') {
      out += ch;
      stack.push(ch);
      i++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      out += ch;
      if (stack.length) stack.pop();
      i++;
      continue;
    }
    if (ch === ':' || ch === ',' || ch === ' ') {
      out += ch;
      i++;
      continue;
    }
    if (/[\w.+-]/.test(ch)) {
      out += ch;
      i++;
      continue;
    }
    // Unknown character: skip it.
    i++;
  }

  // Close an unterminated string.
  if (inString) {
    out += '"';
  }

  // Close any unclosed structures in reverse order.
  for (let j = stack.length - 1; j >= 0; j--) {
    out += stack[j] === '{' ? '}' : ']';
  }

  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
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

/**
 * Open-ended assistant chat (POST /api/assistant/chat). Unlike the screening /
 * questions flows this is a general-purpose conversation with Claude: it is NOT
 * restricted to system data. Page/candidate context and overall stats are
 * provided as light background only, never as hard limits on what can be
 * discussed. Returns the full reply as plain text (multi-paragraph supported).
 */
/**
 * Plain-text chat with Claude for the AI Assistant widget. `attachment` is
 * optional and, when present, is either:
 *   { kind: 'image', fileName, mimeType, base64 } — added as a Claude image
 *     block so Claude can read CVs / screenshots visually (no OCR needed), or
 *   { kind: 'text', fileName, text } — prepended to the message as extracted
 *     document text (e.g. PDF / DOCX body copied from a CV).
 * Returns the full reply as plain text (multi-paragraph supported).
 */
export async function chatWithAssistant({ message, conversationHistory, page, candidateContext, stats, jobsList, candidatesList, attachment }) {
  if (!isClaudeConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set. The AI assistant is unavailable.');
  }

  const system = buildAssistantSystemPrompt({ page, candidateContext, stats, jobsList, candidatesList });

  const history = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-30)
    .map((m) => ({ role: m.role, content: String(m.content) }));

  let userContent;
  if (attachment && attachment.kind === 'image') {
    userContent = {
      role: 'user',
      content: [
        { type: 'text', text: String(message || '') },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: attachment.mimeType || 'image/png',
            data: attachment.base64,
          },
        },
      ],
    };
  } else {
    userContent = { role: 'user', content: String(message || '') };
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [...history, userContent],
  });

  return (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

const ASSISTANT_SYSTEM_BASE = `You are an AI assistant embedded in the TalentAI recruitment system, helping HR staff. You can discuss anything they ask — including reviewing any resume or CV text they paste directly into the chat, giving your own independent assessment, answering general HR/recruitment questions, or drafting text. You are not limited to only answering questions about this system's data. When relevant page/candidate context is provided below, use it to inform your answer, but don't restrict your answers to only that context — behave like a normal, capable assistant having an open conversation.

IMPORTANT FORMATTING RULE: Always reply in PLAIN TEXT. Never use Markdown. Do not use *asterisks* for bold or italics, do not use # hashes for headings, do not use code fences (\`\`\`), and do not use table syntax. For emphasis, use plain words like "important" or capital letters sparingly. For lists, use a simple dash (-) followed by a space at the start of each line. Break sections apart with a blank line and a short plain label instead of a heading.`;

function buildAssistantSystemPrompt({ page, candidateContext, stats, jobsList, candidatesList }) {
  const parts = [ASSISTANT_SYSTEM_BASE];
  if (stats) parts.push(`\n=== SYSTEM OVERVIEW ===\n${stats}`);
  if (jobsList) parts.push(`\n=== CURRENT JOBS ===\n${jobsList}`);
  if (candidatesList) parts.push(`\n=== RECENT CANDIDATES ===\n${candidatesList}`);
  if (page) parts.push(`\n=== CURRENT PAGE ===\nThe user is currently on the "${page}" page.`);
  if (candidateContext) {
    parts.push(
      `\n=== CURRENTLY VIEWING CANDIDATE ===\n${candidateContext}\n` +
        `(The candidate details above are background context pulled from the system. Use them where relevant, but you are not restricted to them.)`
    );
  }
  return parts.join('\n');
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
