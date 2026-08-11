import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import { SparkIcon, UploadIcon, FileIcon, XIcon } from '../components/icons';
import { fetchJobs, fetchCandidates, uploadCandidates, deleteCandidate, runScreening } from '../services/api';
import { formatDate } from '../utils/formatDate';
import type { Candidate, JobPosting } from '../types';

export default function Candidates() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobId, setJobId] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [screening, setScreening] = useState(false);
  const [screeningMessage, setScreeningMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJobs().then(setJobs).catch(console.error);
    fetchCandidates()
      .then(setCandidates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (jobId) return;
    const firstPending = candidates.find((c) => !c.screened && c.jobId);
    if (firstPending?.jobId) setJobId(firstPending.jobId);
  }, [candidates, jobId]);

  const upload = async (files: File[]) => {
    if (!jobId) {
      setError('Select a job posting before uploading.');
      return;
    }
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      await uploadCandidates(jobId, files);
      const updated = await fetchCandidates();
      setCandidates(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Check that the backend is running.');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    upload(Array.from(e.dataTransfer.files));
  };

  const remove = async (candidate: Candidate) => {
    if (!window.confirm(`Delete "${candidate.name}" and remove their resume?`)) return;
    setError('');
    try {
      await deleteCandidate(candidate.id);
      const updated = await fetchCandidates();
      setCandidates(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const run = async () => {
    if (!jobId) {
      setError('Select a job posting before running screening.');
      return;
    }
    if (pendingCandidates.length === 0) {
      setError('No unscreened candidates for this job. Upload resumes or select the correct job posting.');
      return;
    }
    setError('');
    setScreeningMessage('');
    setScreening(true);
    try {
      const result = await runScreening(jobId);
      setScreeningMessage(
        `Screening complete: ${result.succeeded} of ${result.total} candidate${result.total === 1 ? '' : 's'} analyzed.`
      );
      if (result.failed > 0 && result.failures?.length) {
        const names = result.failures.map((f) => f.name || 'Candidate').join(', ');
        const firstError = result.failures[0]?.error;
        setError(
          `Screening failed for ${result.failed} candidate${result.failed === 1 ? '' : 's'}: ${names}${firstError ? ` — ${firstError}` : ''}`
        );
      }
      fetchCandidates().then(setCandidates).catch(console.error);
      if (result.succeeded > 0) {
        setTimeout(() => navigate('/screening'), 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screening failed.');
    } finally {
      setScreening(false);
    }
  };

  const pendingCandidates = candidates.filter((c) => !c.screened && (!jobId || c.jobId === jobId));
  const screenedCandidates = candidates.filter((c) => c.screened && (!jobId || c.jobId === jobId));

  return (
    <div className="p-8 space-y-5">
      <div className="grid grid-cols-3 gap-5">
        {/* Upload Zone */}
        <div className="col-span-2 space-y-4">
          <Card className={`p-8 border-2 border-dashed transition-all ${dragOver ? 'border-teal-400 bg-teal-50/40' : 'border-gray-200'}`}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className="flex flex-col items-center text-center"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition ${dragOver ? 'bg-teal-100' : 'bg-gray-50'}`}>
                <UploadIcon stroke={dragOver ? '#0D9488' : '#9CA3AF'} />
              </div>
              <p className="text-sm font-medium text-gray-700">Drag &amp; drop resume files here</p>
              <p className="text-xs text-gray-400 mt-1">Supports PDF, DOC, DOCX — up to 10 files at once</p>
              <label className="mt-4 cursor-pointer px-4 py-2 bg-[#1E3A5F] text-white text-xs font-medium rounded-lg hover:opacity-90 transition">
                Browse Files
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    upload(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </Card>

          {/* Job selector */}
          <Card className="p-5">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Upload to job posting</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 bg-white transition"
            >
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title} — {j.department}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1.5">
              Resumes are uploaded to Supabase Storage and listed as new candidates. Click "Run AI Screening" to score them with Claude.
            </p>
          </Card>

          {/* Uploaded candidates (not screened yet) */}
          <Card>
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Uploaded Candidates <span className="ml-1 text-xs font-normal text-gray-400">({pendingCandidates.length})</span>
              </h3>
              {uploading && <span className="text-xs text-teal-600 font-medium animate-pulse">Uploading…</span>}
            </div>
            <div className="divide-y divide-gray-50">
              {loading ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading candidates…</div>
              ) : pendingCandidates.length > 0 ? (
                pendingCandidates.map((c) => (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                      <FileIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {(jobs.find((j) => j.id === c.jobId)?.title ?? c.role) || 'Resume'} · Uploaded {formatDate(c.appliedDate) || '—'}
                      </p>
                    </div>
                    {c.resume_url && (
                      <a
                        href={c.resume_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-teal-600 hover:text-teal-700 font-medium shrink-0"
                      >
                        View →
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      title={`Delete ${c.name}`}
                      aria-label={`Delete ${c.name}`}
                      className="shrink-0 w-7 h-7 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition"
                    >
                      <XIcon width={12} height={12} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  {jobId
                    ? 'No unscreened candidates for the selected job. Drop resume files above or switch the job.'
                    : 'No new CVs uploaded yet. Drop resume files above.'}
                </div>
              )}
            </div>
            <div className="p-5">
              <button
                type="button"
                onClick={run}
                disabled={screening}
                className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition ${screening ? 'bg-[#1E3A5F] text-white cursor-wait' : 'bg-[#1E3A5F] text-white hover:opacity-90'}`}
              >
                {screening ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Analyzing candidates…
                  </>
                ) : (
                  <>
                    <SparkIcon />
                    Run AI Screening
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">
                {screening
                  ? screeningMessage || 'Claude is comparing each resume against the job requirements. This can take a few seconds per candidate.'
                  : 'Uses the Claude API to score each resume and list matched skills.'}
              </p>
              {screeningMessage && !screening && (
                <p className="mt-2 text-xs text-teal-600 text-center font-medium">{screeningMessage}</p>
              )}
              {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
            </div>
          </Card>
        </div>

        {/* Tips */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">AI Screening Analyzes</h3>
            <div className="space-y-2.5">
              {['Skill match vs job requirements', 'Years of relevant experience', 'Education and certifications', 'Career trajectory signals', 'Red flags or inconsistencies'].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span className="text-teal-500 mt-0.5 shrink-0">✓</span>
                  <span className="text-xs text-gray-600">{item}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Quick Stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span className="text-gray-500">Total uploaded</span><span className="font-semibold text-gray-800">{candidates.length}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Already screened</span><span className="font-semibold text-gray-800">{screenedCandidates.length}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Active job postings</span><span className="font-semibold text-gray-800">{jobs.filter((j) => j.status === 'open' || j.status === 'Active').length}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">AI screening</span><span className="font-semibold text-gray-800">{screening ? 'Running…' : 'Ready'}</span></div>
            </div>
          </Card>

          {/* Already screened CVs */}
          <Card>
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Already Screened <span className="ml-1 text-xs font-normal text-gray-400">({screenedCandidates.length})</span>
              </h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {screenedCandidates.length > 0 ? (
                screenedCandidates.map((c) => (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center shrink-0">
                      <FileIcon stroke="#0D9488" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {(jobs.find((j) => j.id === c.jobId)?.title ?? c.role) || 'Resume'} · Score {c.score}
                      </p>
                    </div>
                    {c.resume_url && (
                      <a
                        href={c.resume_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-teal-600 hover:text-teal-700 font-medium shrink-0"
                      >
                        View →
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      title={`Delete ${c.name}`}
                      aria-label={`Delete ${c.name}`}
                      className="shrink-0 w-7 h-7 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition"
                    >
                      <XIcon width={12} height={12} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  No screened CVs yet.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
