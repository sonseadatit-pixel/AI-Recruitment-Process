import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import ScoreRing from '../components/ScoreRing';
import { BackIcon, InfoIcon, SparkIcon, XIcon } from '../components/icons';
import { useCurrentCandidate, useRecruitment } from '../context/RecruitmentContext';
import { saveDecision } from '../services/api';
import { formatDate } from '../utils/formatDate';

type Decision = 'hire' | 'reject';

const HIRE_STEPS = [
  { key: 'request-references', label: 'Request 2–3 references' },
  { key: 'prepare-offer-letter', label: 'Prepare offer letter' },
  { key: 'schedule-onboarding', label: 'Schedule onboarding call' },
  { key: 'notify-hiring-manager', label: 'Notify hiring manager' },
];

const REJECT_STEPS = [
  { key: 'send-notification', label: 'Send candidate notification' },
  { key: 'archive-application', label: 'Archive application' },
  { key: 'update-pipeline-report', label: 'Update pipeline report' },
];

export default function FinalRecommendation() {
  const navigate = useNavigate();
  const candidate = useCurrentCandidate();
  const { loadCandidates } = useRecruitment();

  const [decision, setDecision] = useState<Decision | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [hireStartDate, setHireStartDate] = useState('');
  const [hireNotes, setHireNotes] = useState('');
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // Reflect persisted decision whenever the candidate loads/refreshes.
  useEffect(() => {
    if (!candidate) return;
    setNextSteps(candidate.nextSteps || []);
    if (candidate.status === 'hired') {
      setDecision('hire');
      setConfirmed(true);
      setHireStartDate(candidate.hireStartDate || '');
      setHireNotes(candidate.hireNotes || '');
    } else if (candidate.status === 'rejected') {
      setDecision('reject');
      setConfirmed(true);
      setHireNotes(candidate.hireNotes || '');
    } else {
      setDecision(null);
      setConfirmed(false);
      setHireStartDate('');
      setHireNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, candidate?.status]);

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

  // Overall match combines the resume screening score and the interview score
  // (50/50 weighted average). Falls back to the screening score alone when no
  // interview score has been recorded yet.
  const overallScore =
    candidate.interviewScore != null
      ? Math.round(candidate.score * 0.5 + candidate.interviewScore * 0.5)
      : candidate.score;

  const fitLabel = overallScore >= 80 ? 'High Fit' : overallScore >= 65 ? 'Moderate Fit' : 'Low Fit';
  const fitColor = overallScore >= 80 ? 'text-teal-700' : overallScore >= 65 ? 'text-amber-600' : 'text-red-600';
  const skillPct = Math.round(
    (candidate.matchedSkills.length / (candidate.matchedSkills.length + candidate.missingSkills.length)) * 100
  );

  const openModal = (d: Decision) => {
    setDecision(d);
    setSaveError('');
    setModalOpen(true);
  };

  const doConfirm = async () => {
    if (!decision) return;
    if (decision === 'hire' && !hireStartDate) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveDecision(candidate.id, {
        decision,
        hireStartDate: decision === 'hire' ? hireStartDate : undefined,
        hireNotes: hireNotes.trim(),
        nextSteps,
      });
      setConfirmed(true);
      setModalOpen(false);
      await loadCandidates();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save decision.');
    } finally {
      setSaving(false);
    }
  };

  const resetDecision = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await saveDecision(candidate.id, { decision: 'reset' });
      setDecision(null);
      setConfirmed(false);
      setHireStartDate('');
      setHireNotes('');
      setNextSteps([]);
      await loadCandidates();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to undo decision.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStep = async (key: string) => {
    const next = nextSteps.includes(key)
      ? nextSteps.filter((k) => k !== key)
      : [...nextSteps, key];
    setNextSteps(next);
    try {
      await saveDecision(candidate.id, { nextSteps: next });
    } catch {
      // best-effort: the checklist is still usable offline
    }
  };

  const currentSteps = decision === 'reject' ? REJECT_STEPS : HIRE_STEPS;

  return (
    <div className="p-8 space-y-5">
      <button onClick={() => navigate(`/candidates/${candidate.id}`)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
        <BackIcon />
        Back to Profile
      </button>

      {/* ── Candidate Summary Card ── */}
      <Card className="p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#2A4F7C] flex items-center justify-center text-white text-xl font-bold shrink-0">
            {candidate.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-gray-900">{candidate.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{candidate.role}</p>
            <p className="text-xs text-gray-400 mt-0.5">Applied {formatDate(candidate.appliedDate) || '—'} · {candidate.email}</p>
          </div>
          <div className="shrink-0 text-right">
            <ScoreRing score={overallScore} size={84} />
            <p className="text-xs text-center text-gray-400 mt-1">Overall Match</p>
          </div>
        </div>

        {/* Three score metrics */}
        <div className="mt-5 pt-5 border-t border-gray-50 grid grid-cols-3 gap-4">
          {[
            { label: 'AI Screening Score', value: candidate.score, color: 'text-teal-600', bar: 'bg-teal-400' },
            { label: 'Interview Score', value: candidate.interviewScore ?? null, color: 'text-[#1E3A5F]', bar: 'bg-[#1E3A5F]' },
            { label: 'Overall Match', value: overallScore, color: 'text-gray-900', bar: 'bg-gray-600' },
          ].map(({ label, value, color, bar }) => (
            <div key={label} className="text-center px-4 py-3 bg-gray-50/60 rounded-xl">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value ?? '—'}</p>
              {value !== null && (
                <div className="mt-2 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }}></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          {/* Skills Recap */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              Skills Recap <span className="text-xs font-normal text-gray-400 ml-1">{skillPct}% requirement coverage</span>
            </h3>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2.5">Matched Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.matchedSkills.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md ring-1 ring-emerald-200 font-medium">
                      ✓ {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Skill Gaps</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.missingSkills.length > 0
                    ? candidate.missingSkills.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-md ring-1 ring-gray-200 font-medium">
                          — {s}
                        </span>
                      ))
                    : <span className="text-xs text-gray-400 italic">No significant gaps identified</span>}
                </div>
              </div>
            </div>
          </Card>

          {/* Interview Feedback */}
          {candidate.interviewFeedback && (
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Interview Feedback Summary</h3>
              <p className="text-sm text-gray-600 leading-relaxed bg-gray-50/70 rounded-lg px-4 py-3 border border-gray-100">
                {candidate.interviewFeedback}
              </p>
            </Card>
          )}

          {/* AI Recommendation */}
          <Card className="p-6 border-indigo-100" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #ffffff 100%)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 rounded-full">
                <SparkIcon width={11} height={11} stroke="#4F46E5" />
                <span className="text-xs font-semibold text-indigo-700">AI-Generated Recommendation</span>
              </div>
              <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${overallScore >= 80 ? 'bg-teal-100 text-teal-700' : overallScore >= 65 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                {fitLabel}
              </span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              Based on resume screening (<strong>{candidate.score}/100</strong>)
              {candidate.interviewScore ? <> and interview evaluation (<strong>{candidate.interviewScore}/100</strong>)</> : ''},{' '}
              <strong className="text-gray-900">{candidate.name}</strong> is assessed as a{' '}
              <strong className={fitColor}>{fitLabel.toLowerCase()}</strong> candidate for the <em>{candidate.role}</em> role.
              Matched skills cover <strong>{skillPct}%</strong> of stated requirements.{' '}
              {overallScore >= 80
                ? 'All core technical competencies are present. Strong recommendation to proceed to offer stage, subject to reference checks.'
                : overallScore >= 65
                ? 'Core requirements are largely met with some gaps. Recommend assessing growth potential before advancing.'
                : 'Significant skill gaps relative to the role level. Additional evaluation or a different role tier may be more appropriate.'}
            </p>
            <div className="mt-4 pt-3 border-t border-indigo-100 flex items-start gap-2">
              <InfoIcon width={12} height={12} stroke="#6366F1" className="shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-500/80 leading-relaxed">
                This is an AI-generated suggestion. Final hiring decision must be made by HR.
              </p>
            </div>
          </Card>
        </div>

        {/* ── Decision Panel ── */}
        <div className="space-y-4">
          {!confirmed ? (
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Final Decision</h3>
              <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                This is a human decision. The AI recommendation above is advisory only.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => openModal('hire')}
                  className="w-full py-4 rounded-xl text-sm font-semibold bg-emerald-500 border-2 border-emerald-500 text-white shadow-lg shadow-emerald-200/60 transition-all hover:bg-emerald-600 hover:border-emerald-600"
                >
                  <span className="block text-base">✓ Hire</span>
                  <span className="block text-xs font-normal opacity-80 mt-0.5">{candidate.name.split(' ')[0]}</span>
                </button>
                <button
                  onClick={() => openModal('reject')}
                  className="w-full py-4 rounded-xl text-sm font-semibold border-2 border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-all"
                >
                  <span className="block text-base">✗ Reject</span>
                  <span className="block text-xs font-normal opacity-80 mt-0.5">Move to rejected</span>
                </button>
              </div>
            </Card>
          ) : (
            <Card className={`p-6 border-2 ${decision === 'hire' ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/30'}`}>
              <div className="text-center mb-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl ${decision === 'hire' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {decision === 'hire' ? '✓' : '✗'}
                </div>
                <p className={`text-sm font-semibold ${decision === 'hire' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {decision === 'hire' ? 'Candidate Hired' : 'Candidate Rejected'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {decision === 'hire'
                    ? `${candidate.name} hired — starts ${formatDate(hireStartDate) || '…'}`
                    : `${candidate.name} rejected`}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Decided {formatDate(candidate.decidedAt || new Date().toISOString())}
                </p>
              </div>

              {decision === 'hire' && hireStartDate && (
                <div className="bg-white rounded-lg p-3 border border-emerald-100 mb-3">
                  <p className="text-xs font-medium text-emerald-700 mb-0.5">Hired — Start Date: {formatDate(hireStartDate)}</p>
                  {hireNotes && <p className="text-xs text-gray-600 leading-relaxed mt-1">{hireNotes}</p>}
                </div>
              )}
              {decision === 'reject' && hireNotes && (
                <div className="bg-white rounded-lg p-3 border border-gray-100 mb-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Decision Notes</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{hireNotes}</p>
                </div>
              )}

              <button
                onClick={resetDecision}
                disabled={saving}
                className="w-full text-xs text-gray-400 hover:text-gray-600 transition py-1 disabled:opacity-60"
              >
                {saving ? 'Undoing…' : 'Undo decision'}
              </button>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Next Steps</h3>
            <div className="space-y-2.5">
              {currentSteps.map((step) => (
                <div key={step.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={nextSteps.includes(step.key)}
                    onChange={() => toggleStep(step.key)}
                    className="mt-0.5 accent-teal-500 shrink-0"
                  />
                  <span className={`text-xs ${nextSteps.includes(step.key) ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-gray-50/60 border-gray-100">
            <p className="text-xs text-gray-500 font-medium mb-2">Recruitment Summary</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-gray-400">Skill coverage</span><span className="font-medium text-gray-700">{skillPct}%</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-400">Overall score</span><span className="font-medium text-gray-700">{overallScore}/100</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-400">Fit assessment</span><span className={`font-semibold ${fitColor}`}>{fitLabel}</span></div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Hire / Reject Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => !saving && setModalOpen(false)} />
          <Card className="relative w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {decision === 'hire' ? 'Confirm Hire' : 'Confirm Reject'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{candidate.name}</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="text-gray-400 hover:text-gray-600 transition disabled:opacity-60"
                aria-label="Close"
              >
                <XIcon />
              </button>
            </div>

            <div className="space-y-4">
              {decision === 'hire' && (
                <div>
                  <label htmlFor="hire-start-date" className="block text-xs font-medium text-gray-600 mb-1.5">
                    Start Date <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="hire-start-date"
                    type="date"
                    value={hireStartDate}
                    onChange={(e) => setHireStartDate(e.target.value)}
                    className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Record when {candidate.name.split(' ')[0]} is expected to start.</p>
                </div>
              )}

              <div>
                <label htmlFor="hire-notes" className="block text-xs font-medium text-gray-600 mb-1.5">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="hire-notes"
                  value={hireNotes}
                  onChange={(e) => setHireNotes(e.target.value)}
                  rows={3}
                  placeholder={decision === 'hire' ? 'e.g. Salary agreed, waiting on references' : 'Add context for your decision...'}
                  className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition placeholder:text-gray-300 leading-relaxed"
                />
              </div>

              {saveError && <p className="text-xs text-red-500">{saveError}</p>}

              <div className="flex gap-3">
                <button
                  onClick={doConfirm}
                  disabled={saving || (decision === 'hire' && !hireStartDate)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 ${decision === 'hire' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}
                >
                  {saving ? 'Saving…' : decision === 'hire' ? 'Confirm Hire' : 'Confirm Reject'}
                </button>
                <button
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
