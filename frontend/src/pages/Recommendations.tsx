import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import { StarIcon } from '../components/icons';
import { useRecruitment } from '../context/RecruitmentContext';
import { formatDate } from '../utils/formatDate';

type Decision = 'hired' | 'rejected' | 'pending';

const decisionBadge: Record<Decision, string> = {
  hired: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rejected: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  pending: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
};

export default function Recommendations() {
  const navigate = useNavigate();
  const { candidates, selectCandidate, loading } = useRecruitment();

  const recommendationStage = useMemo(
    () =>
      // Candidates that reached the interview stage (final recommendation list)
      candidates.filter((c) => c.interviewScore !== undefined),
    [candidates]
  );

  const overallMatch = (c: { score: number; interviewScore?: number }) =>
    Math.round((c.score * 0.4 + (c.interviewScore ?? 0) * 0.6));

  return (
    <div className="p-8 space-y-5">
      <Card>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Job</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Screening Score</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Interview Score</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Overall Match</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Start Date</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">Loading recommendations…</td>
              </tr>
            )}
            {!loading && recommendationStage.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">
                  No recommendations yet. Review interviews and move candidates to the final recommendation stage.
                </td>
              </tr>
            )}
            {recommendationStage.map((c) => {
              const match = overallMatch(c);
              const decision: Decision = c.status === 'hired' ? 'hired' : c.status === 'rejected' ? 'rejected' : 'pending';
              return (
                <tr
                  key={c.id}
                  onClick={() => {
                    selectCandidate(c);
                    navigate(`/candidates/${c.id}/recommendation`);
                  }}
                  className="cursor-pointer hover:bg-gray-50/60 transition"
                >
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
                  <div className="flex items-center gap-2">
                    <StarIcon width={13} height={13} stroke="#6B7280" />
                      <span className="text-sm text-gray-700">{c.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-base font-bold ${c.score >= 80 ? 'text-teal-600' : c.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{c.score}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-base font-bold ${(c.interviewScore ?? 0) >= 80 ? 'text-teal-600' : (c.interviewScore ?? 0) >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                      {c.interviewScore ?? '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-base font-bold ${match >= 80 ? 'text-teal-600' : match >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{match}</span>
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${match >= 80 ? 'bg-teal-400' : match >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${match}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-left">
                    {decision === 'hired' && c.hireStartDate ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full ring-1 ring-emerald-200 font-medium">
                        Starts {formatDate(c.hireStartDate)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${decisionBadge[decision]}`}>
                      {decision}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
