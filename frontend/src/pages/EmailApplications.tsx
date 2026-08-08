import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import { EyeIcon, MailIcon, UploadIcon, XIcon } from '../components/icons';
import {
  fetchEmailApplications,
  fetchJobs,
  markEmailApplicationRead,
  rejectEmailApplication,
  submitEmailApplicationToScreening,
} from '../services/api';
import { formatDate } from '../utils/formatDate';
import type { EmailApplication, JobPosting } from '../types';

const FOCUS_HIGHLIGHT_MS = 4000;

type FilterKey = 'all' | 'new' | 'read' | 'submitted' | 'rejected';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'read', label: 'Read' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'rejected', label: 'Rejected' },
];

const statusBadge: Record<string, string> = {
  new: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200',
  read: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  submitted: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  rejected: 'bg-red-50 text-red-600 ring-1 ring-red-200',
};

const normStatus = (status: string) => (status === 'new_from_email' ? 'new' : status);

export default function EmailApplications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [applications, setApplications] = useState<EmailApplication[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [detailApp, setDetailApp] = useState<EmailApplication | null>(null);
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

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: applications.length, new: 0, read: 0, submitted: 0, rejected: 0 };
    for (const a of applications) {
      const key = normStatus(a.status);
      if (key === 'new' || key === 'read' || key === 'submitted' || key === 'rejected') c[key] += 1;
    }
    return c;
  }, [applications]);

  const filtered = useMemo(
    () => applications.filter((a) => filter === 'all' || normStatus(a.status) === filter),
    [applications, filter]
  );

  const applyUpdate = (updated: EmailApplication) => {
    setApplications((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
    setDetailApp((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  };

  const openDetail = async (app: EmailApplication) => {
    setDetailApp(app);
    if (normStatus(app.status) !== 'new') return;
    try {
      const updated = await markEmailApplicationRead(app.id);
      applyUpdate(updated);
    } catch (err) {
      console.error('Failed to mark application as read:', err);
    }
  };

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
      applyUpdate(result.application);
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

  const reject = async (app: EmailApplication) => {
    setError('');
    setMessage('');
    setRejectingId(app.id);
    try {
      const updated = await rejectEmailApplication(app.id);
      applyUpdate(updated);
      setMessage(`${updated.sender_name || updated.sender_email} rejected.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject application.');
    } finally {
      setRejectingId(null);
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const JobPicker = ({ app }: { app: EmailApplication }) => (
    <select
      value={jobByApp[app.id] ?? ''}
      onChange={(e) => setJobByApp((prev) => ({ ...prev, [app.id]: e.target.value }))}
      onClick={stop}
      className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400"
    >
      <option value="">Select a job…</option>
      {jobs.map((j) => (
        <option key={j.id} value={j.id}>
          {j.title} — {j.department}
        </option>
      ))}
    </select>
  );

  const SubmitButton = ({ app }: { app: EmailApplication }) => (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        submit(app);
      }}
      disabled={submittingId === app.id || rejectingId === app.id}
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
  );

  const RejectButton = ({ app }: { app: EmailApplication }) => (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        reject(app);
      }}
      disabled={rejectingId === app.id || submittingId === app.id}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition ring-1 ring-red-200 disabled:opacity-60"
    >
      {rejectingId === app.id ? (
        <>
          <span className="w-3 h-3 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
          Rejecting…
        </>
      ) : (
        'Reject'
      )}
    </button>
  );

  const ActionCell = ({ app }: { app: EmailApplication }) => {
    const status = normStatus(app.status);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            openDetail(app);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1E3A5F] rounded-lg border border-gray-200 hover:bg-gray-50 transition"
        >
          <EyeIcon width={12} height={12} />
          Details
        </button>
        {status === 'submitted' ? (
          <>
            <span className="text-[11px] bg-teal-50 text-teal-700 font-medium px-2 py-0.5 rounded-full">
              Submitted to screening
            </span>
            {app.candidate_id && (
              <Link
                to={`/candidates/${app.candidate_id}`}
                onClick={stop}
                className="text-xs text-[#1E3A5F] hover:underline font-medium"
              >
                View candidate →
              </Link>
            )}
          </>
        ) : status === 'rejected' ? (
          <span className="text-[11px] bg-red-50 text-red-600 font-medium px-2 py-0.5 rounded-full">Rejected</span>
        ) : (
          <>
            <JobPicker app={app} />
            <SubmitButton app={app} />
            <RejectButton app={app} />
          </>
        )}
      </div>
    );
  };

  const renderDetailModal = () => {
    if (!detailApp) return null;
    const app = detailApp;
    const status = normStatus(app.status);
    const name = app.sender_name || app.sender_email || 'Unknown sender';
    return (
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        onClick={() => setDetailApp(null)}
      >
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <MailIcon stroke="#1E3A5F" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                <p className="text-xs text-gray-400 truncate">{app.sender_email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDetailApp(null)}
              aria-label="Close"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition shrink-0"
            >
              <XIcon />
            </button>
          </div>

          <div className="px-6 py-4 space-y-3 overflow-y-auto">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Subject</p>
              <p className="text-sm font-medium text-gray-800">{app.subject || '(no subject)'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Received</p>
              <p className="text-xs text-gray-600">{formatDate(app.received_at) || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Message</p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed max-h-56 overflow-y-auto">
                {app.body?.trim() || 'No message body.'}
              </p>
            </div>
            <div>
              <a
                href={app.resume_url}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs font-medium text-teal-600 hover:text-teal-700"
              >
                View Resume →
              </a>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDetailApp(null)}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            >
              Close
            </button>
            <div className="flex-1" />
            {status === 'submitted' ? (
              app.candidate_id && (
                <Link
                  to={`/candidates/${app.candidate_id}`}
                  onClick={() => setDetailApp(null)}
                  className="text-xs text-[#1E3A5F] hover:underline font-medium"
                >
                  View candidate →
                </Link>
              )
            ) : status === 'rejected' ? (
              <span className="text-[11px] bg-red-50 text-red-600 font-medium px-2 py-0.5 rounded-full">Rejected</span>
            ) : (
              <>
                <RejectButton app={app} />
                <JobPicker app={app} />
                <SubmitButton app={app} />
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition ${filter === f.key ? 'bg-[#1E3A5F] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {f.label}
            <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === f.key ? 'bg-white/20' : 'bg-gray-100'}`}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <div className="px-6 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            Email Applications <span className="ml-1 text-xs font-normal text-gray-400">({filtered.length})</span>
          </h3>
          {loading && <span className="text-xs text-teal-600 font-medium animate-pulse">Loading…</span>}
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Sender</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Received</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">Loading email applications…</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                  {filter !== 'all'
                    ? `No ${filter} email applications.`
                    : 'No email applications yet. CVs sent to your Mailgun inbound address will appear here.'}
                </td>
              </tr>
            )}
            {filtered.map((app) => {
              const name = app.sender_name || app.sender_email || 'Unknown sender';
              const status = normStatus(app.status);
              return (
                <tr
                  key={app.id}
                  id={`app-${app.id}`}
                  onClick={() => openDetail(app)}
                  className={`cursor-pointer hover:bg-gray-50/60 transition ${focusId === app.id ? 'bg-teal-50/60' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <MailIcon stroke="#1E3A5F" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                        <p className="text-xs text-gray-400 truncate">{app.sender_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-600 truncate max-w-[220px] inline-block align-middle">
                      {app.subject || '(no subject)'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge[status] ?? statusBadge.read}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-xs text-gray-400 whitespace-nowrap">
                    {formatDate(app.received_at)}
                  </td>
                  <td className="px-6 py-4">
                    <ActionCell app={app} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {message && <p className="text-sm text-teal-600 font-medium">{message}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {renderDetailModal()}
    </div>
  );
}
