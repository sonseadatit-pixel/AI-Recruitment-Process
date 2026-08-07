import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { ChatIcon } from '../components/icons';
import { useRecruitment } from '../context/RecruitmentContext';

export default function Interviews() {
  const navigate = useNavigate();
  const { candidates, selectCandidate, loading } = useRecruitment();

  const interviewStage = useMemo(
    () =>
      // TODO: load candidates in the interview stage from Supabase (e.g. `interviews` table)
      candidates.filter((c) => c.interviewScore !== undefined),
    [candidates]
  );

  return (
    <div className="p-8 space-y-5">
      <Card>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Job</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Interview Score</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">Loading interviews…</td>
              </tr>
            )}
            {!loading && interviewStage.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                  No interviews yet. Move shortlisted candidates forward to the interview stage.
                  {/* TODO: load candidates + interview_results from Supabase via fetchInterviews() */}
                </td>
              </tr>
            )}
            {interviewStage.map((c) => (
              <tr
                key={c.id}
                onClick={() => {
                  selectCandidate(c);
                  navigate(`/candidates/${c.id}/interview-evaluation`);
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
                    <ChatIcon width={13} height={13} stroke="#6B7280" />
                    <span className="text-sm text-gray-700">{c.role}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className={`text-base font-bold ${(c.interviewScore ?? 0) >= 80 ? 'text-teal-600' : (c.interviewScore ?? 0) >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                      {c.interviewScore ?? '—'}
                    </span>
                    {(c.interviewScore ?? 0) > 0 && (
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(c.interviewScore ?? 0) >= 80 ? 'bg-teal-400' : (c.interviewScore ?? 0) >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${c.interviewScore}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4"><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
