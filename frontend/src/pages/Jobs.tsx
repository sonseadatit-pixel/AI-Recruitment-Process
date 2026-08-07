import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import JobForm from '../components/JobForm';
import { BackIcon, PencilIcon, TrashIcon } from '../components/icons';
import { deleteJob, fetchJobs, updateJobStatus } from '../services/api';
import { formatDate } from '../utils/formatDate';
import type { JobPosting } from '../types';

type JobFilter = 'all' | 'active' | 'closed';

const isActive = (s: string) => s === 'open' || s === 'Active';
const isClosed = (s: string) => s === 'closed' || s === 'Closed';

function formatPosted(value: string): string {
  return formatDate(value) || '—';
}

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<JobFilter>('all');

  useEffect(() => {
    fetchJobs()
      .then(setJobs)
      .catch((err) => setListError(err instanceof Error ? err.message : 'Failed to load jobs.'))
      .finally(() => setLoading(false));
  }, []);

  const visibleJobs = jobs.filter((j) =>
    filter === 'all' ? true : filter === 'active' ? isActive(j.status) : isClosed(j.status)
  );

  const toggleStatus = async (job: JobPosting) => {
    const next = isActive(job.status) ? 'closed' : 'open';
    setListError('');
    try {
      await updateJobStatus(job.id, next);
      const updated = await fetchJobs();
      setJobs(updated);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to update job status.');
    }
  };

  const handleDelete = async (job: JobPosting) => {
    if (!window.confirm(`Delete the job "${job.title}"? This cannot be undone.`)) return;
    setListError('');
    try {
      await deleteJob(job.id);
      const updated = await fetchJobs();
      setJobs(updated);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to delete job.');
    }
  };

  if (showForm) {
    return (
      <div className="p-8">
        <button onClick={() => setShowForm(false)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition">
          <BackIcon />
          Back to Jobs
        </button>
        <div className="max-w-2xl">
          <JobForm
            onSaved={() => {
              setShowForm(false);
              fetchJobs()
                .then(setJobs)
                .catch((err) => setListError(err instanceof Error ? err.message : 'Failed to load jobs.'));
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          {(['all', 'active', 'closed'] as JobFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition ${filter === f ? 'bg-[#1E3A5F] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg hover:opacity-90 transition">
          <span>+</span> Post New Job
        </button>
      </div>

      {listError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          Failed to load jobs: {listError}
        </div>
      )}

      <Card>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              {['Job Title', 'Department', 'Posted', 'Applicants', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Loading jobs…</td>
              </tr>
            )}
            {!loading && visibleJobs.length > 0 && (
              visibleJobs.map((j) => (
                <tr key={j.id} className="hover:bg-gray-50/60 transition cursor-pointer" onClick={() => navigate(`/jobs/${j.id}`)}>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{j.title}</p>
                    {j.location && <p className="text-xs text-gray-400 mt-0.5">{j.location}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{j.department}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatPosted(j.posted)}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-[#1E3A5F]">{j.applicants}</td>
                  <td className="px-6 py-4"><StatusBadge status={j.status} /></td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/jobs/${j.id}`)}
                        className="text-xs px-3 py-1.5 bg-[#1E3A5F] text-white rounded-lg hover:opacity-90 transition font-medium"
                      >
                        View →
                      </button>
                      <button
                        onClick={() => toggleStatus(j)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium ring-1 transition ${isActive(j.status) ? 'bg-gray-50 text-gray-600 ring-gray-200 hover:bg-gray-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'}`}
                      >
                        {isActive(j.status) ? 'Close' : 'Reopen'}
                      </button>
                      <button
                        onClick={() => navigate(`/jobs/${j.id}/edit`)}
                        title="Edit job"
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium ring-1 ring-gray-200 text-gray-600 bg-white hover:bg-gray-100 transition"
                      >
                        <PencilIcon />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(j)}
                        title="Delete job"
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium ring-1 ring-red-200 text-red-600 bg-white hover:bg-red-50 transition"
                      >
                        <TrashIcon />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
            {!loading && visibleJobs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                  {jobs.length === 0
                    ? 'No job postings yet. Click Post New Job to create your first one.'
                    : 'No jobs match this filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
