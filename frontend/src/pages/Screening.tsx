import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { InfoIcon, SparkIcon } from '../components/icons';
import { useRecruitment } from '../context/RecruitmentContext';

const filterOptions = ['all', 'ai-suggested', 'shortlisted', 'pending', 'rejected'];

export default function Screening() {
  const navigate = useNavigate();
  const { candidates, selectCandidate, updateCandidateStatus, loading, loadCandidates, aiThreshold } = useRecruitment();
  const [filter, setFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<'score' | 'name'>('score');
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const jobOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of candidates) {
      if (!c.jobId) continue;
      seen.set(c.jobId, c.jobTitle || c.jobId);
    }
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [candidates]);

  const aiSuggestedCount = useMemo(
    () => candidates.filter((c) => c.status === 'ai-suggested').length,
    [candidates]
  );

  const filtered = useMemo(() => {
    return candidates
      .filter((c) => (filter === 'all' || c.status === filter))
      .filter((c) => (jobFilter === 'all' || c.jobId === jobFilter))
      .sort((a, b) => (sortKey === 'score' ? b.score - a.score : a.name.localeCompare(b.name)));
  }, [candidates, filter, jobFilter, sortKey]);

  const confirm = (id: string) => {
    // TODO: persist status change to Supabase (e.g. screening_results / decisions)
    updateCandidateStatus(id, 'shortlisted');
  };

  return (
    <div className="p-8 space-y-5">
      {/* Human-in-the-loop banner */}
      {aiSuggestedCount > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl">
          <SparkIcon width={15} height={15} stroke="#4F46E5" className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-indigo-800">
              {aiSuggestedCount} candidate{aiSuggestedCount > 1 ? 's' : ''} flagged by AI for shortlisting
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">
              Review each suggestion and click <strong>Confirm</strong> to officially move them to Shortlisted. AI suggestions require HR approval before taking effect.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {filterOptions.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition ${filter === f ? 'bg-[#1E3A5F] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {f === 'ai-suggested' ? 'AI Suggested' : f}
              {f === 'ai-suggested' && aiSuggestedCount > 0 && (
                <span className="ml-1.5 bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{aiSuggestedCount}</span>
              )}
            </button>
          ))}
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition"
          >
            <option value="all">All Jobs</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          Sort by:
          <button onClick={() => setSortKey('score')} className={`px-2.5 py-1.5 rounded-lg border transition ${sortKey === 'score' ? 'border-[#1E3A5F] text-[#1E3A5F] font-medium' : 'border-gray-200 hover:bg-gray-50'}`}>Score</button>
          <button onClick={() => setSortKey('name')} className={`px-2.5 py-1.5 rounded-lg border transition ${sortKey === 'name' ? 'border-[#1E3A5F] text-[#1E3A5F] font-medium' : 'border-gray-200 hover:bg-gray-50'}`}>Name</button>
        </div>
      </div>

      <Card>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Job</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <div className="flex items-center gap-1.5">
                  AI Score
                  <div className="relative">
                    <button
                      onMouseEnter={() => setShowTooltip(true)}
                      onMouseLeave={() => setShowTooltip(false)}
                      className="text-gray-300 hover:text-gray-400 transition"
                    >
                      <InfoIcon />
                    </button>
                    {showTooltip && (
                      <div className="absolute left-5 top-0 z-10 w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed pointer-events-none">
                        AI suggests candidates above score {aiThreshold} — final shortlisting requires HR approval.
                        <div className="absolute left-0 top-2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                      </div>
                    )}
                  </div>
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matched Skills</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Loading screening results…</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                  {jobFilter !== 'all' || filter !== 'all'
                    ? 'No candidates match this filter.'
                    : (
                        <>
                          No screening results yet. Upload resumes on the <span className="font-medium text-gray-600">Candidates</span> page and run AI screening.
                        </>
                      )}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className={`hover:bg-gray-50/60 transition ${c.status === 'ai-suggested' ? 'bg-indigo-50/20' : ''}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#2A4F7C] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {c.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {c.jobTitle ? (
                    <span className="inline-block max-w-[180px] truncate text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md ring-1 ring-gray-200">{c.jobTitle}</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className={`text-base font-bold ${c.score >= 80 ? 'text-teal-600' : c.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{c.score}</span>
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${c.score >= 80 ? 'bg-teal-400' : c.score >= 60 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${c.score}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {c.matchedSkills.slice(0, 3).map((s) => (
                      <span key={s} className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md ring-1 ring-teal-200">{s}</span>
                    ))}
                    {c.matchedSkills.length > 3 && <span className="text-xs text-gray-400">+{c.matchedSkills.length - 3}</span>}
                  </div>
                </td>
                <td className="px-6 py-4"><StatusBadge status={c.status} /></td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        selectCandidate(c);
                        navigate(`/candidates/${c.id}`);
                      }}
                      className="text-xs px-3 py-1.5 bg-[#1E3A5F] text-white rounded-lg hover:opacity-90 transition font-medium"
                    >
                      View
                    </button>
                    {c.status === 'ai-suggested' && (
                      <button
                        onClick={() => confirm(c.id)}
                        className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
                      >
                        Confirm ✓
                      </button>
                    )}
                    {(c.status === 'pending' || c.status === 'rejected') && (
                      <button
                        onClick={() => updateCandidateStatus(c.id, 'shortlisted')}
                        className="text-xs px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition font-medium ring-1 ring-teal-200"
                      >
                        Shortlist
                      </button>
                    )}
                    {c.status === 'shortlisted' && (
                      <button
                        onClick={() => navigate(`/candidates/${c.id}/recommendation`)}
                        className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition font-medium ring-1 ring-indigo-200"
                      >
                        Recommendation
                      </button>
                    )}
                    {(c.status === 'ai-suggested' || c.status === 'pending' || c.status === 'shortlisted') && (
                      <button
                        onClick={() => updateCandidateStatus(c.id, 'rejected')}
                        className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium ring-1 ring-red-200"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {candidates.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-50 flex items-center gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-400"></span>
              AI Suggested — pending HR confirmation
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
              Shortlisted — confirmed by HR
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
