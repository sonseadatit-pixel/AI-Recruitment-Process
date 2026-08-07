import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import { BackIcon, SparkIcon } from '../components/icons';
import { useCurrentCandidate, useRecruitment } from '../context/RecruitmentContext';
import { generateInterviewSummary, saveInterviewEvaluation } from '../services/api';

const RECOMMENDATIONS = ['Strong Yes', 'Yes', 'Maybe', 'No'];

export default function InterviewEvaluation() {
  const navigate = useNavigate();
  const candidate = useCurrentCandidate();
  const { loadCandidates } = useRecruitment();
  const [feedback, setFeedback] = useState(candidate?.interviewFeedback ?? '');
  const [score, setScore] = useState(candidate?.interviewScore?.toString() ?? '');
  const [recommendation, setRecommendation] = useState('Yes');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [summary, setSummary] = useState('');

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
    setFormError('');
    if (!feedback.trim()) {
      setFormError('Please add interviewer feedback before generating an AI summary.');
      return;
    }
    setGenerating(true);
    try {
      const text = await generateInterviewSummary({
        candidateId: candidate.id,
        interviewFeedback: feedback,
        interviewScore: Number(score) || 0,
        recommendation,
      });
      setSummary(text);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to generate summary. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitAndContinue = async () => {
    setFormError('');
    setSaving(true);
    try {
      await saveInterviewEvaluation({
        candidateId: candidate.id,
        interviewFeedback: feedback,
        interviewScore: Number(score) || 0,
        recommendation,
        aiSummary: summary,
      });
      await loadCandidates();
      navigate(`/candidates/${candidate.id}/recommendation`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save evaluation. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(`/candidates/${candidate.id}`)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
          <BackIcon />
          Back
        </button>
        <div className="flex items-center gap-3">
          {formError && <span className="text-xs text-red-500">{formError}</span>}
          <button
            onClick={handleSubmitAndContinue}
            disabled={saving}
            className="text-xs px-4 py-2 bg-[#1E3A5F] text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Submit & Continue →'}
          </button>
        </div>
      </div>

      <Card className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#2A4F7C] flex items-center justify-center text-white text-sm font-bold shrink-0">
          {candidate.name.split(' ').map((n) => n[0]).join('')}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{candidate.name}</p>
          <p className="text-xs text-gray-400">Interview conducted Aug 4, 2026</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Resume AI Score</p>
          <p className="text-lg font-bold text-teal-600">{candidate.score}</p>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          <Card className="p-6">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Interviewer Feedback</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={6}
              placeholder="Summarize the candidate's performance, key strengths, concerns, and overall impression..."
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 leading-relaxed transition placeholder:text-gray-300"
            />
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">AI Summary</label>
              <button
                onClick={handleGenerate}
                disabled={generating || !feedback.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gradient-to-r from-[#1E3A5F] to-[#2A4F7C] text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-70"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <SparkIcon width={11} height={11} />
                    Generate AI Summary
                  </>
                )}
              </button>
            </div>
            {!feedback.trim() && (
              <p className="text-xs text-gray-400 mb-3">Add interviewer feedback above to enable generation.</p>
            )}
            {summary ? (
              <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/50 rounded-lg p-4 border border-teal-100">{summary}</p>
            ) : (
              <div className="h-24 flex items-center justify-center text-xs text-gray-300 border border-dashed border-gray-200 rounded-lg">
                AI summary will appear here after generation
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Interview Score</label>
            <div className="text-center">
              <input
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                min="0"
                max="100"
                placeholder="0"
                className="text-4xl font-bold text-[#1E3A5F] w-full text-center border-0 focus:outline-none bg-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">out of 100</p>
              <div className="mt-4 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-teal-400 rounded-full transition-all" style={{ width: `${Math.min(Number(score) || 0, 100)}%` }}></div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Recommendation</label>
            <div className="space-y-2">
              {RECOMMENDATIONS.map((r) => (
                <label key={r} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    name="rec"
                    checked={recommendation === r}
                    onChange={() => setRecommendation(r)}
                    className="accent-teal-500"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800 transition">{r}</span>
                </label>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
