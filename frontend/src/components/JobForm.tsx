import { useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import Card from './Card';
import { SparkIcon } from './icons';
import { createJob, generateJobDescription, updateJob } from '../services/api';
import type { JobPosting } from '../types';

interface JobFormProps {
  initial?: JobPosting;
  onSaved: (job: JobPosting) => void;
  onCancel: () => void;
}

export default function JobForm({ initial, onSaved, onCancel }: JobFormProps) {
  const isEdit = Boolean(initial);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [experienceLevel, setExperienceLevel] = useState(initial?.experience_level || 'Senior');
  const [requirements, setRequirements] = useState(initial?.requirements || initial?.description || '');
  const [generating, setGenerating] = useState(false);
  const [aiDescription, setAiDescription] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const form = new FormData(e.currentTarget);
      const payload = {
        title: String(form.get('title') ?? ''),
        department: String(form.get('department') ?? ''),
        experience_level: experienceLevel,
        requirements,
        location: String(form.get('location') ?? ''),
      };
      const saved = initial ? await updateJob(initial.id, payload) : await createJob(payload);
      onSaved(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save job. Please try again.');
      setSubmitting(false);
    }
  };

  const handleGenerate = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setFormError('');

    const title = String(new FormData(e.currentTarget.form!).get('title') ?? '').trim();
    const keyRequirements = requirements.trim();

    if (!title) {
      setFormError('Job Title is required before generating with AI.');
      return;
    }
    if (!keyRequirements) {
      setFormError('Key Requirements are required before generating with AI.');
      return;
    }

    setGenerating(true);
    try {
      const description = await generateJobDescription({
        title,
        department: String(new FormData(e.currentTarget.form!).get('department') ?? ''),
        experienceLevel,
        keyRequirements,
        location: String(new FormData(e.currentTarget.form!).get('location') ?? ''),
      });
      setAiDescription(description);
      setRequirements(description);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to generate description. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-5">{isEdit ? 'Edit Job' : 'Post New Job'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-xs font-medium text-gray-600 mb-1.5">Job Title *</label>
          <input
            id="title"
            name="title"
            required
            defaultValue={initial?.title}
            placeholder="e.g. Senior Frontend Engineer"
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition"
          />
        </div>
        <div>
          <label htmlFor="department" className="block text-xs font-medium text-gray-600 mb-1.5">Department *</label>
          <select
            id="department"
            name="department"
            required
            defaultValue={initial?.department || 'Engineering'}
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 bg-white transition"
          >
            <option>Engineering</option>
            <option>Design</option>
            <option>Product</option>
            <option>Analytics</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Experience Level *</label>
          <div className="flex gap-2">
            {['Junior', 'Mid-level', 'Senior', 'Staff'].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setExperienceLevel(l)}
                className={`flex-1 text-xs py-2 rounded-lg border transition font-medium ${l === experienceLevel ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="requirements" className="block text-xs font-medium text-gray-600 mb-1.5">Key Requirements</label>
          <textarea
            id="requirements"
            name="requirements"
            rows={4}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="React, TypeScript, GraphQL, AWS, 5+ years experience, strong testing background"
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 resize-none transition"
          />
          <p className="text-xs text-gray-400 mt-1">
            Saved directly as the job description. Add a few key requirements and Generate with AI will expand them into a full, professional description you can review and edit before posting.
          </p>
        </div>
        <div>
          <label htmlFor="location" className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
          <input
            id="location"
            name="location"
            defaultValue={initial?.location}
            placeholder="Remote (US)"
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition"
          />
        </div>

        {formError && (
          <p className="text-xs text-red-500">{formError}</p>
        )}

        {aiDescription && (
          <div className="border border-teal-200 bg-teal-50/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <SparkIcon className="text-teal-600" />
              <h3 className="text-sm font-semibold text-gray-800">AI Preview</h3>
            </div>
            <p className="text-xs text-gray-500 whitespace-pre-wrap">{aiDescription}</p>
            <p className="text-xs text-gray-400 mt-3">
              Review the draft above — you can edit it in the Key Requirements field before saving.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2.5 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg hover:opacity-90 transition disabled:opacity-60"
          >
            {submitting ? (isEdit ? 'Saving…' : 'Posting…') : isEdit ? 'Save Changes' : 'Post New Job'}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition disabled:opacity-60 disabled:hover:bg-gray-100"
          >
            {generating ? (
              <>
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <SparkIcon />
                Generate with AI
              </>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 transition font-medium"
        >
          Cancel
        </button>
      </form>
    </Card>
  );
}
