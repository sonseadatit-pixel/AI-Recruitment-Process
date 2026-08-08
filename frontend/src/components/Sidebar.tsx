import { NavLink, useNavigate } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { GridIcon, BriefcaseIcon, UsersIcon, ScanIcon, ChatIcon, StarIcon, SettingsIcon, LogoutIcon, MailIcon } from './icons';
import { useRecruitment } from '../context/RecruitmentContext';
import { useAuth } from '../context/AuthContext';
import logo from '../image/logo.png';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: GridIcon },
  { id: 'jobs', label: 'Jobs', path: '/jobs', icon: BriefcaseIcon },
  { id: 'candidates', label: 'Candidates', path: '/candidates', icon: UsersIcon },
  { id: 'email-applications', label: 'Email Applications', path: '/email-applications', icon: MailIcon },
  { id: 'screening', label: 'Screening', path: '/screening', icon: ScanIcon },
  { id: 'interviews', label: 'Interviews', path: '/interviews', icon: ChatIcon },
  { id: 'recommendations', label: 'Recommendations', path: '/recommendations', icon: StarIcon },
  { id: 'settings', label: 'Settings', path: '/settings', icon: SettingsIcon },
];

export default function Sidebar() {
  const { aiSuggestedCount } = useRecruitment();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = (user?.user_metadata?.full_name as string) || user?.email || 'HR User';
  const email = user?.email || '';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleLogout() {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-[#1E3A5F] text-white shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
        <img src={logo} alt="TalentAI logo" className="w-9 h-9 rounded-lg shrink-0" />
        <div>
          <div className="text-sm font-semibold leading-tight">TalentAI</div>
          <div className="text-xs text-blue-200/70">Recruitment Suite</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ id, label, path, icon: Icon }) => (
          <NavLink
            key={id}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${isActive ? 'bg-white/15 text-white' : 'text-blue-100/70 hover:bg-white/8 hover:text-white'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-teal-300' : 'text-blue-200/60'}>
                  <Icon />
                </span>
                {label}
                {id === 'screening' && aiSuggestedCount > 0 && (
                  <span className="ml-auto bg-teal-400 text-navy text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {aiSuggestedCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-300 to-teal-500 flex items-center justify-center text-xs font-bold text-white shrink-0">{initials || 'HR'}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">{displayName}</div>
            <div className="text-xs text-blue-200/60 truncate">{email || 'Recruitment'}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
            className="p-1.5 rounded-lg text-blue-200/60 hover:text-white hover:bg-white/10 transition"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}
