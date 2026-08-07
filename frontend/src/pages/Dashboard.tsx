import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { useRecruitment } from '../context/RecruitmentContext';
import { fetchDashboardStats, fetchPipeline, fetchJobs, fetchCandidates } from '../services/api';
import { formatDate } from '../utils/formatDate';
import type { DashboardStats, JobPosting, PipelineStage } from '../types';

const isActive = (s: string) => s === 'open' || s === 'Active';

export default function Dashboard() {
  const navigate = useNavigate();
  const { candidates, selectCandidate } = useRecruitment();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidateCount, setCandidateCount] = useState(0);

  useEffect(() => {
    // TODO: aiScreened / shortlisted stats come from Supabase aggregations
    // (see src/services/api.ts); Total Jobs and Total Candidates are derived
    // from the live GET /api/jobs and GET /api/candidates data.
    fetchDashboardStats().then(setStats).catch(console.error);
    fetchPipeline().then(setPipeline).catch(console.error);
    fetchJobs().then(setJobs).catch(console.error);
    fetchCandidates().then((data) => setCandidateCount(data.length)).catch(console.error);
  }, []);

  const statCards = [
    {
      label: 'Total Jobs',
      value: jobs.length.toString(),
      change: stats?.changes.jobs ?? 'Live from database',
      color: 'text-[#1E3A5F]',
      bg: 'bg-[#1E3A5F]/5',
    },
    {
      label: 'Total Candidates',
      value: candidateCount.toString(),
      change: stats?.changes.candidates ?? 'Live from database',
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    ...(stats
      ? [
          { label: 'AI Screened', value: stats.aiScreened.toString(), change: stats.changes.aiScreened, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Shortlisted', value: stats.shortlisted.toString(), change: stats.changes.shortlisted, color: 'text-teal-600', bg: 'bg-teal-50' },
        ]
      : []),
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.length > 0 ? (
          statCards.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</p>
                  <p className={`text-3xl font-bold mt-2 ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.change}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <div className={`w-3 h-3 rounded-full ${s.color.replace('text-', 'bg-')}`}></div>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="col-span-4 p-5 text-center text-sm text-gray-400">
            No dashboard stats yet. {/* TODO: wire Supabase aggregations in fetchDashboardStats() */}
          </Card>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Recent Candidates */}
        <Card className="col-span-2">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Recent Candidates</h2>
            <button onClick={() => navigate('/candidates')} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              View all →
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {candidates.length > 0 ? (
              candidates.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  className="px-6 py-3.5 flex items-center gap-4 hover:bg-gray-50/70 transition cursor-pointer"
                  onClick={() => {
                    selectCandidate(c);
                    navigate(`/candidates/${c.id}`);
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#2A4F7C] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {c.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.role}</p>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0">{formatDate(c.appliedDate) || '—'}</div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-semibold ${c.score >= 80 ? 'text-teal-600' : c.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{c.score}</span>
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.score >= 80 ? 'bg-teal-400' : c.score >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${c.score}%` }}
                      ></div>s
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                No candidates yet. {/* TODO: load from Supabase candidates table */}
              </div>
            )}
          </div>
        </Card>

        {/* Activity + Pipeline */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Hiring Pipeline</h2>
            {pipeline.length > 0 ? (
              <div className="space-y-3">
                {pipeline.map((row) => (
                  <div key={row.stage} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">{row.stage}</span>
                      <span className="text-xs font-semibold text-gray-800">{row.count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full">
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No pipeline data. {/* TODO: wire fetchPipeline() */}</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Top Active Roles</h2>
            {jobs.some((j) => isActive(j.status)) ? (
              <div className="space-y-2.5">
                {jobs.filter((j) => isActive(j.status)).slice(0, 5).map((j) => (
                  <div key={j.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-800 truncate max-w-[140px]">{j.title}</p>
                      <p className="text-xs text-gray-400">{j.department}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#1E3A5F]">{j.applicants} apps</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No active roles yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
