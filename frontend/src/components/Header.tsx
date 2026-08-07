import { useLocation } from 'react-router-dom';
import { SearchIcon, BellIcon } from './icons';
import { useAuth } from '../context/AuthContext';

const screenTitles: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: "Welcome back, here's your hiring overview." },
  jobs: { title: 'Job Postings', subtitle: 'Manage open and closed positions' },
  'job-detail': { title: 'Job Detail', subtitle: 'Posting details and status control' },
  'job-edit': { title: 'Edit Job', subtitle: 'Update the posting before it goes live' },
  candidates: { title: 'Candidates', subtitle: 'All applicants across active roles' },
  screening: { title: 'AI Screening', subtitle: 'Automated resume analysis and scoring' },
  interviews: { title: 'Interviews', subtitle: 'Candidates currently in the interview stage' },
  recommendations: { title: 'Final Recommendations', subtitle: 'Candidates ready for the final hire decision' },
  'candidate-profile': { title: 'Candidate Profile', subtitle: 'Detailed applicant view and AI insights' },
  'interview-questions': { title: 'Interview Questions', subtitle: 'AI-generated question bank by category' },
  'interview-evaluation': { title: 'Interview Evaluation', subtitle: 'Record feedback and generate AI summary' },
  recommendation: { title: 'Final Recommendation', subtitle: 'Human decision, AI-informed — review and decide' },
  settings: { title: 'Settings', subtitle: 'Configure your recruitment preferences' },
};

function screenKeyForPath(pathname: string): string {
  if (pathname === '/' || pathname === '/dashboard') return 'dashboard';
  const segments = pathname.split('/').filter(Boolean);
  const base = segments[0];
  if (pathname.includes('interview-questions')) return 'interview-questions';
  if (pathname.includes('interview-evaluation')) return 'interview-evaluation';
  if (pathname.includes('recommendation')) return 'recommendation';
  if (base === 'candidates') {
    return segments.length === 1 ? 'candidates' : 'candidate-profile';
  }
  if (base === 'jobs' && segments.length === 2) return 'job-detail';
  if (base === 'jobs' && segments.length === 3 && segments[2] === 'edit') return 'job-edit';
  return base || 'dashboard';
}

export default function Header() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const key = screenKeyForPath(pathname);
  const { title, subtitle } = screenTitles[key] ?? { title: pathname, subtitle: '' };

  const firstName =
    (user?.user_metadata?.full_name as string)?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const subtitleText = key === 'dashboard' ? `Welcome back, ${firstName}. Here's your hiring overview.` : subtitle;

  return (
    <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-[17px] font-semibold text-gray-900">{title}</h1>
        <p className="text-xs text-gray-400 mt-0.5">{subtitleText}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Search candidates, jobs..."
            className="text-sm pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg w-60 focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 placeholder:text-gray-400 transition"
          />
          <SearchIcon className="absolute left-3 top-2.5 text-gray-400" />
        </div>
        <button className="relative p-2 rounded-lg hover:bg-gray-50 transition">
          <BellIcon />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
      </div>
    </header>
  );
}
