import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import ScoreRing from '../components/ScoreRing';
import SkillTag from '../components/SkillTag';
import { BackIcon, ChatIcon, ChevronRightIcon, InfoIcon, SparkIcon, StarIcon } from '../components/icons';
import { useCurrentCandidate } from '../context/RecruitmentContext';
import { fetchSavedInterviewQuestions } from '../services/api';
import { formatDate } from '../utils/formatDate';
import type { AiQuestionSet } from '../types';

export default function CandidateProfile() {
  const navigate = useNavigate();
  const candidate = useCurrentCandidate();
  const [savedQuestions, setSavedQuestions] = useState<AiQuestionSet>({ technical: [], behavioral: [] });
  const [questionsLoading, setQuestionsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!candidate) return;
    (async () => {
      setQuestionsLoading(true);
      try {
        const saved = await fetchSavedInterviewQuestions(candidate.id);
        if (!cancelled) setSavedQuestions(saved);
      } catch (err) {
        if (!cancelled) setSavedQuestions({ technical: [], behavioral: [] });
      } finally {
        if (!cancelled) setQuestionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  const hasQuestions = savedQuestions.technical.length > 0 || savedQuestions.behavioral.length > 0;
  const totalQuestions = savedQuestions.technical.length + savedQuestions.behavioral.length;

  if (!candidate) {
    return (
      <div className="p-8">
        <Card className="p-10 text-center">
          <p className="text-sm text-gray-500 font-medium">No candidate selected.</p>
          <p className="text-xs text-gray-400 mt-1">
            Select a candidate from the screening results to view their profile.
            {/* TODO: fetch candidate by :id from Supabase when data is wired */}
          </p>
          <button onClick={() => navigate('/screening')} className="mt-4 text-xs px-4 py-2 bg-[#1E3A5F] text-white rounded-lg font-medium hover:opacity-90 transition">
            Go to Screening Results
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <button onClick={() => navigate('/screening')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
        <BackIcon />
        Back to Results
      </button>

      {/* Header Card */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#2A4F7C] flex items-center justify-center text-white text-lg font-bold shrink-0">
              {candidate.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{candidate.name}</h2>
              <p className="text-sm text-gray-500">{candidate.email}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-400">Applied {formatDate(candidate.appliedDate) || '—'}</span>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs text-gray-400">{candidate.role}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={candidate.status} />
            <div className="flex flex-col items-center">
              <ScoreRing score={candidate.score} size={80} />
              <span className="text-xs text-gray-400 mt-1">AI Score</span>
            </div>
          </div>
        </div>
        {candidate.status === 'hired' && candidate.hireStartDate && (
          <div className="mt-4 pt-4 border-t border-emerald-100 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Hired — Start Date: {formatDate(candidate.hireStartDate)}</p>
              {candidate.hireNotes && (
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{candidate.hireNotes}</p>
              )}
            </div>
            {candidate.decidedAt && (
              <p className="text-xs text-gray-400 shrink-0">Decided {formatDate(candidate.decidedAt)}</p>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-5">
        {/* Skills */}
        <Card className="col-span-2 p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Skill Analysis</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-teal-600 uppercase tracking-wide mb-2.5">Matched Skills</p>
              <div className="flex flex-wrap gap-2">
                {candidate.matchedSkills.map((s) => <SkillTag key={s} label={s} variant="matched" />)}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-red-500 uppercase tracking-wide mb-2.5">Missing Skills</p>
              <div className="flex flex-wrap gap-2">
                {candidate.missingSkills.length > 0
                  ? candidate.missingSkills.map((s) => <SkillTag key={s} label={s} variant="missing" />)
                  : <span className="text-xs text-gray-400">No significant gaps identified</span>}
              </div>
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-gray-50">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2.5">AI Summary</p>
            <p className="text-sm text-gray-600 leading-relaxed">{candidate.summary}</p>
            {/* TODO: summary comes from screening_results.ai_notes */}
          </div>
        </Card>

        {/* Actions */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Actions</h3>
            <div className="space-y-2.5">
              <button
                onClick={() => navigate(`/candidates/${candidate.id}/interview-questions`)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#1E3A5F] text-left shadow-sm transition group hover:opacity-90 hover:shadow cursor-pointer"
              >
                <span className="w-9 h-9 shrink-0 rounded-lg bg-white/15 text-white flex items-center justify-center transition group-hover:bg-white/25">
                  <SparkIcon />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">
                    {questionsLoading
                      ? 'Interview Questions…'
                      : hasQuestions
                        ? `Interview Questions (${totalQuestions}) — saved`
                        : 'Generate Interview Questions'}
                  </span>
                  <span className="block text-xs text-white/70 mt-0.5">
                    {hasQuestions ? 'View or edit the saved AI question set' : 'AI-generated questions tailored to this CV'}
                  </span>
                </span>
                <ChevronRightIcon className="shrink-0 text-white/50 transition group-hover:translate-x-0.5 group-hover:text-white" />
              </button>

              <button
                onClick={() => navigate(`/candidates/${candidate.id}/interview-evaluation`)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-indigo-600 text-left shadow-sm transition group hover:bg-indigo-700 hover:shadow cursor-pointer"
              >
                <span className="w-9 h-9 shrink-0 rounded-lg bg-white/15 text-white flex items-center justify-center transition group-hover:bg-white/25">
                  <ChatIcon />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">Record Evaluation</span>
                  <span className="block text-xs text-indigo-100 mt-0.5">Record interview feedback and generate an AI summary</span>
                </span>
                <ChevronRightIcon className="shrink-0 text-white/50 transition group-hover:translate-x-0.5 group-hover:text-white" />
              </button>

              <button
                onClick={() => navigate(`/candidates/${candidate.id}/recommendation`)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-amber-500 text-left shadow-sm transition group hover:bg-amber-600 hover:shadow cursor-pointer"
              >
                <span className="w-9 h-9 shrink-0 rounded-lg bg-white/20 text-white flex items-center justify-center transition group-hover:bg-white/30">
                  <StarIcon />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">View Recommendation</span>
                  <span className="block text-xs text-amber-50 mt-0.5">Review the final AI-informed hiring recommendation</span>
                </span>
                <ChevronRightIcon className="shrink-0 text-white/60 transition group-hover:translate-x-0.5 group-hover:text-white" />
              </button>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Quick Decision</h3>
            <div className="space-y-2">
              <button className="w-full py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition">
                Approve
              </button>
              <button className="w-full py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition">
                Reject
              </button>
            </div>
          </Card>
          <Card className="p-5 bg-amber-50 border-amber-100">
            <div className="flex items-start gap-2">
              <InfoIcon width={14} height={14} stroke="#D97706" className="shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">AI scores are advisory. Final decisions remain with the hiring team.</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Interview Questions */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Interview Questions</h3>
          <button onClick={() => navigate(`/candidates/${candidate.id}/interview-questions`)} className="text-xs font-medium text-[#1E3A5F] hover:underline">
            {hasQuestions ? 'View / Edit' : 'Create'}
          </button>
        </div>
        {questionsLoading ? (
          <p className="text-xs text-gray-400">Loading saved questions…</p>
        ) : hasQuestions ? (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2.5">Technical</p>
              <ol className="space-y-2">
                {savedQuestions.technical.map((q, i) => (
                  <li key={i} className="text-xs text-gray-600 leading-relaxed pl-4 relative">
                    <span className="absolute left-0 top-0 font-bold text-gray-300">{i + 1}.</span>
                    {q}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2.5">Behavioral</p>
              <ol className="space-y-2">
                {savedQuestions.behavioral.map((q, i) => (
                  <li key={i} className="text-xs text-gray-600 leading-relaxed pl-4 relative">
                    <span className="absolute left-0 top-0 font-bold text-gray-300">{i + 1}.</span>
                    {q}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            No interview questions generated yet for this CV. Open the interview question set to generate and save them.
          </p>
        )}
      </Card>
    </div>
  );
}
