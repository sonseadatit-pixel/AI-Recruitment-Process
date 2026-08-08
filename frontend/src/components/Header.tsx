import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SearchIcon, BellIcon } from './icons';
import { useAuth } from '../context/AuthContext';
import { fetchNotifications, markNotificationRead } from '../services/api';
import { formatRelativeTime } from '../utils/formatDate';
import type { NotificationItem } from '../types';

const POLL_INTERVAL_MS = 30_000;

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
  'email-applications': { title: 'Email Applications', subtitle: 'CVs received by email, ready for screening' },
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const key = screenKeyForPath(pathname);
  const { title, subtitle } = screenTitles[key] ?? { title: pathname, subtitle: '' };

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await fetchNotifications();
      setNotifications(items);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const openNotification = async (item: NotificationItem) => {
    if (!item.is_read) {
      setNotifications((prev) => prev.filter((n) => n.id !== item.id));
      try {
        await markNotificationRead(item.id);
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }
    setOpen(false);
    const focus = item.candidate_id ? `?focus=${encodeURIComponent(item.candidate_id)}` : '';
    navigate(`/email-applications${focus}`);
  };

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
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Notifications"
            className="relative p-2 rounded-lg hover:bg-gray-50 transition"
          >
            <BellIcon />
            {notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                {notifications.length > 99 ? '99+' : notifications.length}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-50">
                <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
                <p className="text-xs text-gray-400">
                  {notifications.length > 0
                    ? `${notifications.length} unread`
                    : 'You’re all caught up'}
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">No new notifications</div>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openNotification(item)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
                    >
                      <p className="text-xs font-medium text-gray-800">{item.message}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{formatRelativeTime(item.created_at)}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
