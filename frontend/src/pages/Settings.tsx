import { useEffect, useState } from 'react';
import Card from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { useRecruitment } from '../context/RecruitmentContext';
import { fetchSettings, saveSettings } from '../services/api';
import { supabase } from '../services/supabaseClient';

export default function Settings() {
  const { user } = useAuth();
  const { refreshSettings, loadCandidates } = useRecruitment();

  const [minAiScore, setMinAiScore] = useState('75');
  const [weightedSkills, setWeightedSkills] = useState('');
  const [emailNewApplication, setEmailNewApplication] = useState(true);
  const [emailScreeningComplete, setEmailScreeningComplete] = useState(true);
  const [fullName, setFullName] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError('');
      try {
        const settings = await fetchSettings();
        if (cancelled) return;
        setMinAiScore(String(settings.minAiScore ?? 75));
        setWeightedSkills(settings.weightedSkills ?? '');
        setEmailNewApplication(settings.emailNewApplication);
        setEmailScreeningComplete(settings.emailScreeningComplete);
        setFullName(settings.fullName || (user?.user_metadata?.full_name as string) || '');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const handleSave = async () => {
    const score = Number(minAiScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setError('Minimum AI score must be a number between 0 and 100.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await saveSettings({
        minAiScore: score,
        weightedSkills,
        emailNewApplication,
        emailScreeningComplete,
        fullName,
      });
      await supabase.auth.updateUser({ data: { full_name: fullName } });
      await refreshSettings();
      await loadCandidates();
      setMessage('Settings saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const fieldInput =
    'text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 w-52 transition';

  return (
    <div className="p-8 max-w-2xl space-y-5">
      {message && (
        <div className="px-4 py-3 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-700 font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      {/* AI Screening */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">AI Screening</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-gray-600 flex-1">Minimum AI score to auto-shortlist</label>
            <input
              type="number"
              min={0}
              max={100}
              value={minAiScore}
              onChange={(e) => setMinAiScore(e.target.value)}
              disabled={loading}
              className={fieldInput}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-gray-600 flex-1">Skills to weight heavily (comma-separated)</label>
            <input
              type="text"
              value={weightedSkills}
              onChange={(e) => setWeightedSkills(e.target.value)}
              disabled={loading}
              placeholder="React, TypeScript, AWS"
              className={fieldInput}
            />
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Notifications</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-gray-600 flex-1">Email on new application</label>
            <button
              type="button"
              onClick={() => setEmailNewApplication((prev) => !prev)}
              disabled={loading}
              className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${emailNewApplication ? 'bg-teal-400' : 'bg-gray-200'} flex items-center px-0.5 ${loading ? 'opacity-60' : ''}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${emailNewApplication ? 'translate-x-4' : ''}`}></div>
            </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-gray-600 flex-1">Email on screening complete</label>
            <button
              type="button"
              onClick={() => setEmailScreeningComplete((prev) => !prev)}
              disabled={loading}
              className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${emailScreeningComplete ? 'bg-teal-400' : 'bg-gray-200'} flex items-center px-0.5 ${loading ? 'opacity-60' : ''}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${emailScreeningComplete ? 'translate-x-4' : ''}`}></div>
            </button>
          </div>
        </div>
      </Card>

      {/* Account */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Account</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-gray-600 flex-1">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              placeholder="Your full name"
              className={fieldInput}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-gray-600 flex-1">Email address</label>
            <input type="email" value={user?.email ?? ''} readOnly disabled className={`${fieldInput} bg-gray-50 text-gray-400`} />
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-5 py-2.5 bg-[#1E3A5F] text-white text-sm font-medium rounded-lg hover:opacity-90 transition disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {loading && <span className="text-xs text-gray-400">Loading your settings…</span>}
      </div>
    </div>
  );
}
