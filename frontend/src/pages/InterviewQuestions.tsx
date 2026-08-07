import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import { BackIcon, PrintIcon, SparkIcon, XIcon } from '../components/icons';
import { useCurrentCandidate } from '../context/RecruitmentContext';
import {
  fetchSavedInterviewQuestions,
  generateInterviewQuestions,
  saveInterviewQuestions,
} from '../services/api';
import type { AiQuestionSet } from '../types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printDocumentHtml(
  candidateName: string,
  candidateRole: string,
  questions: AiQuestionSet
): string {
  const section = (title: string, items: string[]) => {
    const list = items.length
      ? `<ol>${items.map((q) => `<li>${escapeHtml(q.trim() || '(empty question)')}</li>`).join('')}</ol>`
      : '<p class="muted">No questions.</p>';
    return `<h2>${escapeHtml(title)}</h2>${list}`;
  };

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Interview Questions — ${escapeHtml(candidateName)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #1f2937; }
  h1 { font-size: 20px; margin: 0 0 6px; color: #1E3A5F; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 28px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #111827;
       border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 26px 0 10px; }
  ol { margin: 0 0 8px 0; padding-left: 22px; }
  li { font-size: 13px; line-height: 1.7; margin-bottom: 8px; }
  .muted { color: #9ca3af; font-size: 12px; }
</style>
</head>
<body>
  <h1>Interview Question Set</h1>
  <div class="meta">${escapeHtml(candidateName)}${candidateRole ? ` &middot; ${escapeHtml(candidateRole)}` : ''} &middot; ${new Date().toLocaleDateString()}</div>
  ${section('Technical', questions.technical)}
  ${section('Behavioral', questions.behavioral)}
</body>
</html>`;
}

export default function InterviewQuestions() {
  const navigate = useNavigate();
  const candidate = useCurrentCandidate();
  const [questions, setQuestions] = useState<AiQuestionSet>({ technical: [], behavioral: [] });
  const [customInstructions, setCustomInstructions] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!candidate) return;
    (async () => {
      setLoadError('');
      try {
        const saved = await fetchSavedInterviewQuestions(candidate.id);
        if (!cancelled && (saved.technical.length > 0 || saved.behavioral.length > 0)) {
          setQuestions(saved);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load saved questions.');
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  if (!candidate) {
    return (
      <div className="p-8">
        <Card className="p-10 text-center">
          <p className="text-sm text-gray-500 font-medium">No candidate selected.</p>
          <p className="text-xs text-gray-400 mt-1">Select a candidate from the screening results first.</p>
          <button onClick={() => navigate('/screening')} className="mt-4 text-xs px-4 py-2 bg-[#1E3A5F] text-white rounded-lg font-medium hover:opacity-90 transition">
            Go to Screening Results
          </button>
        </Card>
      </div>
    );
  }

  const handleGenerate = async () => {
    setGenerating(true);
    setSaveError('');
    try {
      const data = await generateInterviewQuestions(candidate.id, customInstructions);
      if (data.technical.length > 0 || data.behavioral.length > 0) {
        setQuestions(data);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to generate questions. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAndContinue = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await saveInterviewQuestions(candidate.id, questions);
      navigate(`/candidates/${candidate.id}/interview-evaluation`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save questions. Please try again.');
      setSaving(false);
    }
  };

  const hasQuestions = questions.technical.length > 0 || questions.behavioral.length > 0;

  const handleSaveAndPrint = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await saveInterviewQuestions(candidate.id, questions);
      const win = window.open('', '_blank', 'width=860,height=1000');
      if (!win) {
        setSaveError('Popup blocked. Allow popups for this site to print.');
        setSaving(false);
        return;
      }
      win.document.write(printDocumentHtml(candidate.name, candidate.role, questions));
      win.document.close();
      win.focus();
      win.print();
      setSaving(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save questions. Please try again.');
      setSaving(false);
    }
  };

  const updateQ = (cat: 'technical' | 'behavioral', idx: number, val: string) => {
    setQuestions((prev) => ({
      ...prev,
      [cat]: prev[cat].map((q, i) => (i === idx ? val : q)),
    }));
  };

  const addQuestion = (cat: 'technical' | 'behavioral') => {
    setQuestions((prev) => ({ ...prev, [cat]: [...prev[cat], ''] }));
  };

  const removeQuestion = (cat: 'technical' | 'behavioral', idx: number) => {
    setQuestions((prev) => ({
      ...prev,
      [cat]: prev[cat].filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(`/candidates/${candidate.id}`)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
          <BackIcon />
          Back
        </button>
        <div className="flex items-center gap-3">
          {loadError && <span className="text-xs text-amber-500">{loadError}</span>}
          {saveError && <span className="text-xs text-red-500">{saveError}</span>}
          <button
            onClick={handleSaveAndPrint}
            disabled={saving || !hasQuestions}
            title="Save the accepted questions, then print or save them as a PDF"
            className="flex items-center gap-1.5 text-xs px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition disabled:opacity-60"
          >
            <PrintIcon />
            {saving ? 'Saving…' : 'Print / Save'}
          </button>
          <button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="text-xs px-4 py-2 bg-[#1E3A5F] text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save & Continue'}
          </button>
        </div>
      </div>

      {/* Candidate chip */}
      <Card className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#2A4F7C] flex items-center justify-center text-white text-sm font-bold shrink-0">
          {candidate.name.split(' ').map((n) => n[0]).join('')}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{candidate.name}</p>
          <p className="text-xs text-gray-400">Interview Question Set — {candidate.role}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">AI Score</span>
          <span className="text-lg font-bold text-teal-600">{candidate.score}</span>
        </div>
      </Card>

      <div className="space-y-3">
        <input
          type="text"
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="Optional: add specific instructions for the AI (e.g. 'simpler questions', 'focus on React')"
          className="w-full text-xs px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition"
        />
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs px-3.5 py-2 bg-gradient-to-r from-[#1E3A5F] to-[#2A4F7C] text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-70"
          >
            {generating ? (
              <>
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <SparkIcon width={11} height={11} />
                Generate Questions with AI
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {(['technical', 'behavioral'] as const).map((cat) => (
          <Card key={cat} className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${cat === 'technical' ? 'bg-[#1E3A5F]' : 'bg-violet-500'}`}></div>
                <h3 className="text-sm font-semibold text-gray-800 capitalize">{cat}</h3>
              </div>
              <span className="text-xs text-gray-400">{questions[cat].length} questions</span>
            </div>
            <div className="space-y-3">
              {questions[cat].length > 0 ? (
                questions[cat].map((q, i) => (
                  <div key={i} className="group">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-300 mt-2 shrink-0 w-5">Q{i + 1}</span>
                      <textarea
                        value={q}
                        onChange={(e) => updateQ(cat, i, e.target.value)}
                        rows={2}
                        className="flex-1 text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 leading-relaxed transition"
                      />
                      <button
                        type="button"
                        onClick={() => removeQuestion(cat, i)}
                        title="Remove question"
                        className="mt-2.5 shrink-0 text-gray-300 hover:text-red-500 transition"
                      >
                        <XIcon />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 text-center py-6">
                  {loadingSaved
                    ? 'Loading saved questions…'
                    : 'Click "Generate Questions with AI" to build a question set for this candidate.'}
                </p>
              )}
              <button
                onClick={() => addQuestion(cat)}
                className="w-full mt-1 py-2 border border-dashed border-gray-200 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-300 rounded-lg transition"
              >
                + Add question
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
