import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { BackIcon, PencilIcon, TrashIcon } from '../components/icons';
import { deleteJob, fetchJob, fetchJobs, updateJobStatus } from '../services/api';
import { formatDate } from '../utils/formatDate';
import type { JobPosting } from '../types';

function isActive(status: JobPosting['status']) {
  return status === 'open' || status === 'Active';
}

function formatPosted(date: string | undefined): string {
  if (!date) return '—';
  return formatDate(date) || '—';
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  const load = async (jobId: string) => {
    setLoading(true);
    setError('');
    try {
      setJob(await fetchJob(jobId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleStatus = async () => {
    if (!job) return;
    const next = isActive(job.status) ? 'closed' : 'open';
    setUpdating(true);
    setError('');
    try {
      await updateJobStatus(job.id, next);
      await load(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!job) return;
    if (!window.confirm(`Delete the job "${job.title}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteJob(job.id);
      navigate('/jobs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job.');
    }
  };

  const openCandidates = async () => {
    if (!job) return;
    try {
      await fetchJobs();
    } catch {
      // ignore — just navigating
    }
    navigate('/candidates');
  };

  if (loading) {
    return (
      <div className="p-8">
        <Card className="p-10 text-center">
          <p className="text-sm text-gray-500 font-medium">Loading job…</p>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-8">
        <Card className="p-10 text-center">
          <p className="text-sm text-gray-500 font-medium">Job not found.</p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <button
            onClick={() => navigate('/jobs')}
            className="mt-4 text-xs px-4 py-2 bg-[#1E3A5F] text-white rounded-lg font-medium hover:opacity-90 transition"
          >
            Back to Jobs
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <button onClick={() => navigate('/jobs')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
        <BackIcon />
        Back to Jobs
      </button>

      {/* Header Card */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{job.title}</h2>
              <StatusBadge status={job.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {[job.department, job.location, job.experience_level].filter(Boolean).join(' · ') || 'General'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Posted {formatPosted(job.posted)}</p>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-[#1E3A5F]">{job.applicants}</p>
                <p className="text-xs text-gray-400">Applicants</p>
              </div>
              <button
                onClick={() => navigate('/candidates')}
                className="text-xs px-4 py-2 bg-[#1E3A5F] text-white rounded-lg font-medium hover:opacity-90 transition"
              >
                View Candidates →
              </button>
              <button
                onClick={() => navigate(`/jobs/${job.id}/edit`)}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-medium ring-1 ring-gray-200 text-gray-600 bg-white hover:bg-gray-100 transition"
              >
                <PencilIcon />
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-medium ring-1 ring-red-200 text-red-600 bg-white hover:bg-red-50 transition"
              >
                <TrashIcon />
                Delete
              </button>
              <button
                onClick={toggleStatus}
                disabled={updating}
                className={`text-xs px-4 py-2 rounded-lg font-medium ring-1 transition disabled:opacity-60 ${isActive(job.status) ? 'bg-gray-50 text-gray-600 ring-gray-200 hover:bg-gray-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'}`}
              >
                {updating ? 'Saving…' : isActive(job.status) ? 'Close Job' : 'Reopen Job'}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 max-w-xs text-right">{error}</p>}
          </div>
        </div>
      </Card>

      {/* Description */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Job Description</h3>
        {(job.description || job.requirements)
          ? (
              <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {job.description || job.requirements}
              </div>
            )
          : <p className="text-sm text-gray-400">No description provided.</p>}
      </Card>
    </div>
  );
}
