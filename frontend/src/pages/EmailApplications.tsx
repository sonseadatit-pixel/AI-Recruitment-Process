import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import { MailIcon, UploadIcon } from '../components/icons';
import {
  fetchEmailApplications,
  fetchJobs,
  submitEmailApplicationToScreening,
} from '../services/api';
import { formatDate } from '../utils/formatDate';
import type { EmailApplication, JobPosting } from '../types';

const FOCUS_HIGHLIGHT_MS = 4000;

export default function EmailApplications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [applications, setApplications] = useState<EmailApplication[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [jobByApp, setJobByApp] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const focusId = searchParams.get('focus') ?? '';

  const load = async () => {
    try {
      const [apps, jobList] = await Promise.all([fetchEmailApplications(), fetchJobs()]);
      setApplications(apps);
      setJobs(jobList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load email applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!focusId) return;
    const timer = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('focus');
        return next;
      });
    }, FOCUS_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [focusId, setSearchParams]);

  const pending = useMemo(() => applications.filter((a) => a.status !== 'submitted'), [applications]);
  const submitted = useMemo(() => applications.filter((a) => a.status === 'submitted'), [applications]);

  const submit = async (app: EmailApplication) => {
    const jobId = jobByApp[app.id];
    if (!jobId) {
      setError(`Select a job posting for ${app.sender_name || app.sender_email} first.`);
      return;
    }
    setError('');
    setMessage('');
    setSubmittingId(app.id);
    try {
      const result = await submitEmailApplicationToScreening(app.id, jobId);
      setApplications((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, ...result.application } : a))
      );
      const job = jobs.find((j) => j.id === jobId);
      setMessage(
        `${result.application.sender_name || result.application.sender_email} submitted to "${job?.title ?? ''}" and is ready for AI screening.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit to screening.');
    } finally {
      setSubmittingId(null);
    }
  };

  const renderRow = (app: EmailApplication, isSubmitted: boolean) => {
    const name = app.sender_name || app.sender_email || 'Unknown sender';
    return (
      <div
        key={app.id}
        id={`app-${app.id}`}
        className={`px-5 py-4 flex flex-col gap-3 transition-colors ${
          isSubmitted ? 'opacity-70' : ''
        } ${focusId === app.id ? 'bg-teal-50/60' : ''}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <MailIcon stroke="#1E3A5F" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
            <p className="text-xs text-gray-400 truncate">
              {app.sender_email}
              {app.subject ? ` · ${app.subject}` : ''}
            </p>
          </div>
          <span className="text-[11px] text-gray-400 shrink-0">{formatDate(app.received_at)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-12">
          <a
            href={app.resume_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            View Resume →
          </a>

          {isSubmitted ? (
            <>
              <span className="text-[11px] bg-teal-50 text-teal-700 font-medium px-2 py-0.5 rounded-full">
                Submitted to screening
              </span>
              {app.candidate_id && (
                <Link
                  to={`/candidates/${app.candidate_id}`}
                  className="text-xs text-[#1E3A5F] hover:underline font-medium"
                >
                  View candidate →
                </Link>
              )}
            </>
          ) : (
            <>
              <select
                value={jobByApp[app.id] ?? ''}
                onChange={(e) => setJobByApp((prev) => ({ ...prev, [app.id]: e.target.value }))}
                className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400"
              >
                <option value="">Select a job…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} — {j.department}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => submit(app)}
                disabled={submittingId === app.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E3A5F] text-white text-xs font-medium rounded-lg hover:opacity-90 transition disabled:opacity-60"
              >
                {submittingId === app.id ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <UploadIcon width={12} height={12} />
                    Submit to Screening
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-5">
      <Card>
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            New Email Applications <span className="ml-1 text-xs font-normal text-gray-400">({pending.length})</span>
          </h3>
          {loading && <span className="text-xs text-teal-600 font-medium animate-pulse">Loading…</span>}
        </div>
        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Loading email applications…</div>
          ) : pending.length > 0 ? (
            pending.map((a) => renderRow(a, false))
          ) : (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No email applications yet. CVs sent to your Mailgun inbound address will appear here.
            </div>
          )}
        </div>
      </Card>

      {submitted.length > 0 && (
        <Card>
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">
              Submitted to Screening <span className="ml-1 text-xs font-normal text-gray-400">({submitted.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {submitted.map((a) => renderRow(a, true))}
          </div>
        </Card>
      )}

      {message && <p className="text-sm text-teal-600 font-medium">{message}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
