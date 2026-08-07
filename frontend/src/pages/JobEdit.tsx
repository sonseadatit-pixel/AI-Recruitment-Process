import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '../components/Card';
import JobForm from '../components/JobForm';
import { BackIcon } from '../components/icons';
import { fetchJob } from '../services/api';
import type { JobPosting } from '../types';

export default function JobEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchJob(id)
      .then(setJob)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load job.'))
      .finally(() => setLoading(false));
  }, [id]);

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
    <div className="p-8">
      <button
        onClick={() => navigate(`/jobs/${job.id}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition"
      >
        <BackIcon />
        Back to Job
      </button>
      <div className="max-w-2xl">
        <JobForm
          initial={job}
          onSaved={(saved) => navigate(`/jobs/${saved.id}`)}
          onCancel={() => navigate(`/jobs/${job.id}`)}
        />
      </div>
    </div>
  );
}
