import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { AppSettings, Candidate } from '../types';
import { fetchScreeningResults, fetchSettings } from '../services/api';

interface RecruitmentContextValue {
  candidates: Candidate[];
  selectedCandidate: Candidate | null;
  aiSuggestedCount: number;
  loading: boolean;
  settings: AppSettings | null;
  aiThreshold: number;
  loadCandidates: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  selectCandidate: (c: Candidate | null) => void;
  updateCandidateStatus: (id: string, status: Candidate['status']) => void;
}

const RecruitmentContext = createContext<RecruitmentContextValue | undefined>(undefined);

export function RecruitmentProvider({ children }: { children: ReactNode }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const settingsData = await fetchSettings().catch(() => null);
      setSettings(settingsData);
      const threshold = settingsData?.minAiScore ?? 75;
      const data = await fetchScreeningResults(undefined, threshold);
      setCandidates(data);
    } catch (error) {
      console.error('Failed to load candidates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    const settingsData = await fetchSettings().catch(() => null);
    setSettings(settingsData);
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const selectCandidate = useCallback((c: Candidate | null) => {
    setSelectedCandidate(c);
  }, []);

  const updateCandidateStatus = useCallback((id: string, status: Candidate['status']) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    setSelectedCandidate((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
  }, []);

  const aiSuggestedCount = useMemo(
    () => candidates.filter((c) => c.status === 'ai-suggested').length,
    [candidates]
  );

  const aiThreshold = settings?.minAiScore ?? 75;

  return (
    <RecruitmentContext.Provider
      value={{
        candidates,
        selectedCandidate,
        aiSuggestedCount,
        loading,
        settings,
        aiThreshold,
        loadCandidates,
        refreshSettings,
        selectCandidate,
        updateCandidateStatus,
      }}
    >
      {children}
    </RecruitmentContext.Provider>
  );
}

export function useRecruitment(): RecruitmentContextValue {
  const ctx = useContext(RecruitmentContext);
  if (!ctx) throw new Error('useRecruitment must be used within RecruitmentProvider');
  return ctx;
}

export function useCurrentCandidate(): Candidate | null {
  const { id } = useParams<{ id: string }>();
  const { candidates, selectedCandidate } = useRecruitment();
  return useMemo(
    () => candidates.find((c) => c.id === id) ?? selectedCandidate ?? null,
    [candidates, selectedCandidate, id]
  );
}
