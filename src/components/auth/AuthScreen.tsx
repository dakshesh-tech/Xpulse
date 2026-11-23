import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  Shield,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { evaluatePasswordStrength } from '../../lib/authErrors';

type AuthMode = 'login' | 'register' | 'forgot';

const GoogleMark: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
    />
    <path
      fill="#34A853"
      d="M3.6 7.3l3.2 2.3C7.7 7.4 9.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 8.3 2.5 5.1 4.6 3.6 7.3z"
    />
    <path
      fill="#FBBC05"
      d="M12 21.5c2.5 0 4.7-.8 6.3-2.3l-2.9-2.4c-.8.6-1.9 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1l-3.3 2.5C4.6 19.3 8 21.5 12 21.5z"
    />
    <path
      fill="#4285F4"
      d="M21.1 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.2-1 2.2-2.1 2.9l2.9 2.4c1.7-1.6 2.8-4 2.8-7.6z"
    />
  </svg>
);

export const AuthScreen: React.FC = () => {
  const {
    user,
    authLoading,
    profileLoading,
    isAuthenticated,
    isEmailVerified,
    accountProfile,
    needsMigrationChoice,
    localLegacyDetected,
    authNotice,
    clearAuthNotice,
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    resendVerificationEmail,
    checkEmailVerification,
    sendPasswordReset,
    completeOnboardingInitialization,
    signOutAccount,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [migrateExisting, setMigrateExisting] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [onboardingName, setOnboardingName] = useState(
    user?.displayName || accountProfile?.user?.username || ''
  );

  const passwordStrength = useMemo(
    () => evaluatePasswordStrength(password),
    [password]
  );

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrorMsg(null);
    setSuccessMsg(null);
    clearAuthNotice();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await loginWithEmail({ email, password, rememberMe });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await registerWithEmail({
        email,
        password,
        confirmPassword,
        username,
        migrateExisting,
      });
      setSuccessMsg(
        'Account forged! Check your inbox for a verification link before entering the Chronicle.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await sendPasswordReset(email);
      setSuccessMsg(
        `Password reset instructions sent to ${email.trim()}. Check your inbox and spam folder.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await loginWithGoogle(rememberMe);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCheck = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const verified = await checkEmailVerification();
      if (!verified) {
        setErrorMsg(
          'Email is not verified yet. Please click the verification link in your email, then click Check Status again.'
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification check failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await resendVerificationEmail();
      setSuccessMsg('A fresh verification email has been dispatched to your inbox.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteOnboarding = async (importExistingProgress: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const finalName =
        onboardingName.trim() ||
        user?.displayName ||
        accountProfile?.user?.username ||
        user?.email?.split('@')[0] ||
        'Adventurer';
      await completeOnboardingInitialization({
        username: finalName,
        importExistingProgress,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to initialize your adventurer profile.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || (isAuthenticated && profileLoading && !needsMigrationChoice && isEmailVerified)) {
    return (
      <div className="min-h-screen bg-[#0A0B0F] text-[#EDEFF5] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
          <div>
            <div className="font-[var(--font-display)] text-lg font-semibold tracking-wide text-amber-200">
              Chronicle
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Synchronizing your adventurer realm...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0B0F] text-[#EDEFF5] relative flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Ambient Obsidian & Violet Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(212,168,83,0.08),transparent_50%)]"
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-[11px] font-mono text-violet-300 tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Real-Life RPG Sanctuary</span>
          </div>
          <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-wide text-[#EDEFF5]">
            Chronicle
          </h1>
          <p className="text-sm text-slate-400">
            Your lived experiences, synced securely across every device.
          </p>
        </div>

        <div className="bg-[#11131A] border border-white/[0.09] rounded-2xl p-6 sm:p-7 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8)] space-y-5">
          {(errorMsg || authNotice) && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg || authNotice}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-xs text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* GATE 1: Email Verification Pending */}
          {isAuthenticated && !isEmailVerified ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
                    Verify Your Email
                  </h2>
                  <p className="text-xs text-slate-400 truncate max-w-[260px]">
                    {user?.email}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                We sent a verification link to your email address. Click the link in your inbox (or spam folder) to unlock your Cloud Chronicle and protect your progression.
              </p>

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleVerifyCheck}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>I&apos;ve Verified — Enter Chronicle</span>
                </button>

                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  Resend Verification Email
                </button>

                <button
                  type="button"
                  onClick={() => signOutAccount()}
                  className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out / Use Another Account</span>
                </button>
              </div>
            </div>
          ) : isAuthenticated && isEmailVerified && needsMigrationChoice ? (
            /* GATE 2: Existing Progress Migration Choice */
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-400/35 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                  <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
                    Existing Chronicle Found
                  </h2>
                  <p className="text-xs text-slate-400">
                    Choose how to initialize your cloud adventurer save
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="onboard-username"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Adventurer Name
                </label>
                <input
                  id="onboard-username"
                  type="text"
                  value={onboardingName}
                  onChange={(e) => setOnboardingName(e.target.value)}
                  placeholder="Enter your character name"
                  maxLength={32}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] focus:outline-none focus:border-violet-400"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-[#0A0B0F] border border-amber-400/25 text-xs text-slate-300 leading-relaxed">
                Unclaimed Chronicle progress is available on this realm. You can import your existing EXP, attributes, quests, and collectibles into your private cloud account, or begin fresh at Level 1.
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleCompleteOnboarding(true)}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Import Existing Progress &amp; Continue</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCompleteOnboarding(false)}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  Start Fresh Level 1 Adventurer
                </button>

                <button
                  type="button"
                  onClick={() => signOutAccount()}
                  className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            /* GATE 3: Unauthenticated Login / Register / Forgot Password */
            <>
              {mode !== 'forgot' ? (
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0A0B0F] border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      mode === 'login'
                        ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      mode === 'register'
                        ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-300 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>
              )}

              {mode === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Email Address
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="adventurer@realm.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="login-password"
                        className="text-xs font-medium text-slate-300"
                      >
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-[11px] text-violet-300 hover:text-violet-200 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-white/20 bg-[#0A0B0F] text-violet-500 focus:ring-violet-500"
                    />
                    <span>Remember me on this device</span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-[0_0_24px_-6px_rgba(139,92,246,0.7)] cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    <span>Enter the Chronicle</span>
                  </button>
                </form>
              )}

              {mode === 'register' && (
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div>
                    <label
                      htmlFor="reg-username"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Adventurer / Character Name
                    </label>
                    <input
                      id="reg-username"
                      type="text"
                      autoComplete="nickname"
                      required
                      maxLength={32}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g., Aria, Dakshesh, Kael"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-email"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Email Address
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="adventurer@realm.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-password"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 8 chars, mixed letters & numbers"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {password.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Password strength</span>
                          <span
                            className={`font-medium ${
                              passwordStrength.score >= 3
                                ? 'text-emerald-300'
                                : passwordStrength.score === 2
                                  ? 'text-amber-300'
                                  : 'text-rose-300'
                            }`}
                          >
                            {passwordStrength.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {[1, 2, 3, 4].map((level) => (
                            <div
                              key={level}
                              className={`h-1 rounded-full transition-colors ${
                                passwordStrength.score >= level
                                  ? passwordStrength.score >= 3
                                    ? 'bg-emerald-400'
                                    : passwordStrength.score === 2
                                      ? 'bg-amber-400'
                                      : 'bg-rose-400'
                                  : 'bg-white/10'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Include 8+ characters, lowercase, and uppercase/number/symbol.
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="reg-confirm-password"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        id="reg-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={
                          showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {localLegacyDetected && (
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-100 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={migrateExisting}
                        onChange={(e) => setMigrateExisting(e.target.checked)}
                        className="mt-0.5 rounded border-amber-400/40 bg-[#0A0B0F] text-amber-400"
                      />
                      <span>
                        Import my existing local Chronicle progress into this cloud account after verification.
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-[0_0_24px_-6px_rgba(139,92,246,0.7)] cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span>Forge Adventurer Account</span>
                  </button>
                </form>
              )}

              {mode === 'forgot' && (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
                      Reset Your Password
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Enter your account email to receive a secure password reset link.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="forgot-email"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Email Address
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="adventurer@realm.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    <span>Send Reset Link</span>
                  </button>
                </form>
              )}

              {/* Optional Google Sign-In Divider */}
              {mode !== 'forgot' && (
                <>
                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/[0.07]" />
                    </div>
                    <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                      <span className="bg-[#11131A] px-2.5 text-slate-500 font-mono">
                        Or continue optionally
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={submitting}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#0A0B0F] hover:bg-white/[0.04] border border-white/15 text-slate-200 text-sm font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <GoogleMark />
                    <span>Continue with Google</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
