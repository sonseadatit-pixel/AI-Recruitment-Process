import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import WelcomeTransition from '../components/WelcomeTransition';
import logo from '../image/logo.png';

export default function Login() {
  const { session, loading: authLoading, user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [remember, setRemember] = useState(() => localStorage.getItem('talentai_remembered_email') !== null);

  useEffect(() => {
    const saved = localStorage.getItem('talentai_remembered_email');
    if (saved) setEmail(saved);
  }, []);

  const state = location.state as { from?: { pathname: string }; message?: string } | null;
  const successMessage = state?.message ?? '';
  const from = state?.from?.pathname ?? '/';

  const firstName =
    (user?.user_metadata?.full_name as string)?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  if (authLoading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (welcome) {
    return (
      <WelcomeTransition
        name={firstName}
        onComplete={() => navigate('/', { replace: true })}
      />
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      if (remember) {
        localStorage.setItem('talentai_remembered_email', email);
      } else {
        localStorage.removeItem('talentai_remembered_email');
      }
      setWelcome(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-dark via-navy to-navy-light p-6"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="TalentAI logo" className="w-14 h-14 mb-3" />
          <h1 className="text-2xl font-bold text-white">TalentAI</h1>
          <p className="text-sm text-blue-100/70 mt-1">Recruitment Suite</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-lg font-semibold text-gray-900">Sign in</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-6">Enter your credentials to access your workspace</p>

          {successMessage && (
            <div className="mb-4 bg-teal-50 border border-teal-200 text-teal-800 text-sm px-3 py-2.5 rounded-lg">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-gray-600 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full text-sm px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-sm px-3.5 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-navy focus:ring-teal-400/30"
              />
              <span className="text-sm text-gray-600">Remember me</span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-navy hover:bg-navy-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-navy hover:text-navy-light">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
