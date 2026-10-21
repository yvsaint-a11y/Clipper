import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthContext';
import { Surface, MotionButton, Badge, FeedbackBanner } from '../../components/ui';
import { motionTokens } from '../../lib/designTokens';
import {
  Lock,
  Mail,
  KeyRound,
  UserPlus,
  LogIn,
  ShieldCheck,
  X,
  ArrowLeft,
  Send,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export type AuthModalMode = 'signin' | 'signup' | 'forgot_password' | 'reset_password';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  defaultMode?: AuthModalMode;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultMode = 'signin' }) => {
  const [mode, setMode] = useState<AuthModalMode>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isResetLinkSent, setIsResetLinkSent] = useState(false);

  // Recovery & Resend States
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [duplicateAccountEmail, setDuplicateAccountEmail] = useState<string | null>(null);
  const [signupVerificationSent, setSignupVerificationSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  const {
    signIn,
    signUp,
    resendVerificationEmail,
    resetPasswordForEmail,
    updatePassword,
    isConfigured,
    isPasswordRecovery,
    clearPasswordRecovery,
  } = useAuth();

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // If Supabase triggered a recovery session or modal was opened in reset_password mode
  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('reset_password');
    }
  }, [isPasswordRecovery]);

  // Keep internal mode synced with defaultMode prop on mount/change
  useEffect(() => {
    if (!isPasswordRecovery) {
      setMode(defaultMode);
    }
  }, [defaultMode, isPasswordRecovery]);

  if (!isOpen) return null;

  const handleClose = () => {
    setFormError(null);
    setSuccessMessage(null);
    setIsResetLinkSent(false);
    setUnconfirmedEmail(null);
    setDuplicateAccountEmail(null);
    setSignupVerificationSent(false);
    setResendSuccess(null);
    setResendError(null);
    if (mode === 'reset_password') {
      clearPasswordRecovery();
    }
    if (onClose) onClose();
  };

  const handleResendVerification = async (targetEmail?: string) => {
    const emailToUse = targetEmail || email;
    if (!emailToUse || !emailToUse.trim()) {
      setFormError('Please enter your account email address.');
      return;
    }
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setResendSuccess(null);
    setResendError(null);
    try {
      const res = await resendVerificationEmail(emailToUse.trim());
      if (res.success) {
        setResendSuccess(`Verification email resent to ${emailToUse.trim()}. Check your inbox and spam folder.`);
        setResendCooldown(45);
      } else {
        setResendError(res.error || 'Failed to resend verification email.');
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setUnconfirmedEmail(null);
    setResendSuccess(null);
    setResendError(null);

    if (!email || !password) {
      setFormError('Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signIn(email, password);
      if (res.success) {
        setSuccessMessage('Signed in successfully.');
        if (onClose) setTimeout(onClose, 700);
      } else {
        if (res.isUnconfirmed) {
          setUnconfirmedEmail(email);
          setFormError("Your email address hasn't been verified yet.");
        } else {
          setFormError(res.error || 'Failed to sign in.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setDuplicateAccountEmail(null);
    setSignupVerificationSent(false);
    setResendSuccess(null);
    setResendError(null);

    if (!email || !password) {
      setFormError('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signUp(email, password);
      if (res.success) {
        if (res.requiresConfirmation) {
          // Genuine signup requiring verification (Part 4D)
          setSignupVerificationSent(true);
          setResendCooldown(45);
        } else {
          setSuccessMessage('Account created! Entering studio workspace...');
          if (onClose) setTimeout(onClose, 900);
        }
      } else {
        if (res.isExistingUser) {
          // Account already exists (Part 4C)
          setDuplicateAccountEmail(email);
          setFormError('An account may already exist with this email. Try signing in or resetting your password.');
        } else {
          setFormError(res.error || 'Failed to create account.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setResendSuccess(null);
    setResendError(null);

    if (!email) {
      setFormError('Please enter your account email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await resetPasswordForEmail(email);
      if (res.success) {
        setIsResetLinkSent(true);
        setSuccessMessage('Password reset link sent. Check your email for instructions to reset your password.');
      } else {
        setFormError(res.error || 'Failed to send password reset email.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!password || !confirmPassword) {
      setFormError('Please enter and confirm your new password.');
      return;
    }

    if (password.length < 6) {
      setFormError('New password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updatePassword(password);
      if (res.success) {
        setSuccessMessage('Your password has been updated successfully. Continuing to your workspace...');
        setPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          handleClose();
        }, 1200);
      } else {
        setFormError(res.error || 'Failed to update password. Your recovery link may be expired or invalid.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Spatial Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionTokens.duration.micro }}
          onClick={handleClose}
          className="absolute inset-0 bg-[#090a0f]/80 backdrop-blur-md"
        />

        {/* Modal Dialog Surface */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: motionTokens.duration.component, ease: motionTokens.ease.expressiveOut }}
          className="relative z-10 w-full max-w-md"
        >
          <Surface level={4} className="border-[#2e374f] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.9)]">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#242b3d]">
              <Badge variant="outline" className="text-[11px] gap-1.5 border-[#2e374f] text-zinc-300 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Encrypted Studio Access
              </Badge>
              {onClose && (
                <button
                  onClick={handleClose}
                  className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Title / Description */}
            <div className="mt-4 mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
                <Lock className="w-4 h-4 text-[#C7C9CC]" />
                {signupVerificationSent && 'Verify Your Email'}
                {!signupVerificationSent && mode === 'signin' && 'Sign In to Workspace'}
                {!signupVerificationSent && mode === 'signup' && 'Create Creative Studio Account'}
                {!signupVerificationSent && mode === 'forgot_password' && 'Reset Your Password'}
                {!signupVerificationSent && mode === 'reset_password' && 'Set New Password'}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                {signupVerificationSent && 'Check your email to verify your Clipper account.'}
                {!signupVerificationSent && mode === 'signin' && 'Access your video timelines, media assets, and saved project states.'}
                {!signupVerificationSent && mode === 'signup' && 'Start editing with verified identity and high-speed cloud storage.'}
                {!signupVerificationSent && mode === 'forgot_password' && 'Enter your email address and we will send you a secure link to reset your password.'}
                {!signupVerificationSent && mode === 'reset_password' && 'Enter a secure new password for your Clipper account.'}
              </p>
            </div>

            {/* Error / Success Banners */}
            <div className="space-y-3 mb-4">
              {!isConfigured && (
                <FeedbackBanner
                  type="warning"
                  title="Client Configuration Warning"
                  message="Authentication service is currently offline or unreachable. Please try again shortly."
                />
              )}
              {formError && (
                <FeedbackBanner
                  type="error"
                  title="Authentication Notice"
                  message={formError}
                  onDismiss={() => setFormError(null)}
                />
              )}
              {successMessage && (
                <FeedbackBanner
                  type="success"
                  title="Success"
                  message={successMessage}
                />
              )}
              {resendSuccess && (
                <FeedbackBanner
                  type="success"
                  title="Verification Email Sent"
                  message={resendSuccess}
                  onDismiss={() => setResendSuccess(null)}
                />
              )}
              {resendError && (
                <FeedbackBanner
                  type="error"
                  title="Resend Error"
                  message={resendError}
                  onDismiss={() => setResendError(null)}
                />
              )}
            </div>

            {/* 0. SIGNUP VERIFICATION SENT STATE (Part 4D) */}
            {signupVerificationSent ? (
              <div className="space-y-4 py-2 text-center">
                <div className="w-12 h-12 rounded-full bg-[#1B1C1E] border border-[#3A3C3F] text-[#F2F2F0] flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(0,0,0,0.6)]">
                  <Mail className="w-6 h-6 animate-pulse text-[#C7C9CC]" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Check your email to verify your Clipper account</h4>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    We sent a verification link to <span className="text-[#C7C9CC] font-mono font-medium">{email}</span>. Click the link in your email to activate your account and start creating.
                  </p>
                </div>

                <div className="pt-2 space-y-2">
                  <MotionButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={resendCooldown > 0 || isResending}
                    isLoading={isResending}
                    onClick={() => handleResendVerification(email)}
                    className="w-full text-xs"
                    leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />}
                  >
                    {resendCooldown > 0 ? `Resend verification email (${resendCooldown}s)` : 'Resend verification email'}
                  </MotionButton>

                  <MotionButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSignupVerificationSent(false);
                      setMode('signin');
                      setFormError(null);
                      setSuccessMessage(null);
                    }}
                    className="w-full text-xs"
                    leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                  >
                    Back to Sign In
                  </MotionButton>
                </div>
              </div>
            ) : (
              <>
            {/* 1. SIGN IN VIEW */}
            {mode === 'signin' && (
              <form onSubmit={handleSignInSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777A7E]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="creator@studio.com"
                      required
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-zinc-300">Password</label>
                    <button
                      type="button"
                      id="forgot-password-link"
                      onClick={() => {
                        setMode('forgot_password');
                        setFormError(null);
                        setSuccessMessage(null);
                        setIsResetLinkSent(false);
                      }}
                      className="text-xs text-[#C7C9CC] hover:text-white font-medium transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777A7E]" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                    />
                  </div>
                </div>

                {/* 4B: Unconfirmed Sign-In Recovery Action */}
                {unconfirmedEmail && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-2">
                    <div className="flex items-center gap-2 text-amber-300 font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Your email address hasn't been verified yet.</span>
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      Need a new confirmation link? We can send one right away to <span className="text-zinc-200 font-mono">{unconfirmedEmail}</span>.
                    </p>
                    <MotionButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={resendCooldown > 0 || isResending}
                      isLoading={isResending}
                      onClick={() => handleResendVerification(unconfirmedEmail)}
                      className="w-full text-xs"
                      leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />}
                    >
                      {resendCooldown > 0 ? `Resend verification email (${resendCooldown}s)` : 'Resend verification email'}
                    </MotionButton>
                  </div>
                )}

                <MotionButton
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSubmitting}
                  disabled={!isConfigured}
                  className="w-full mt-2"
                  leftIcon={<LogIn className="w-4 h-4" />}
                >
                  Sign In
                </MotionButton>
              </form>
            )}

            {/* 2. SIGN UP VIEW */}
            {mode === 'signup' && (
              <form onSubmit={handleSignUpSubmit} className="space-y-3.5">
                {/* 4C: Duplicate / Existing Account Banner & Actions */}
                {duplicateAccountEmail && (
                  <div className="p-3 bg-[#171819] border border-[#3A3C3F] rounded-lg text-xs space-y-2.5">
                    <div className="flex items-center gap-2 text-[#C7C9CC] font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0 text-[#C7C9CC]" />
                      <span>An account may already exist with this email.</span>
                    </div>
                    <p className="text-[#92969C] text-[11px] leading-relaxed">
                      Try signing in with your existing credentials, or reset your password if you forgot it.
                    </p>
                    <div className="flex items-center gap-2">
                      <MotionButton
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setMode('signin');
                          setDuplicateAccountEmail(null);
                          setFormError(null);
                        }}
                        className="flex-1 text-xs"
                        leftIcon={<LogIn className="w-3.5 h-3.5" />}
                      >
                        Sign In
                      </MotionButton>
                      <MotionButton
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setMode('forgot_password');
                          setDuplicateAccountEmail(null);
                          setFormError(null);
                        }}
                        className="flex-1 text-xs"
                      >
                        Forgot Password
                      </MotionButton>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777A7E]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="creator@studio.com"
                      required
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777A7E]" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777A7E]" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                    />
                  </div>
                </div>

                <MotionButton
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSubmitting}
                  disabled={!isConfigured}
                  className="w-full mt-2"
                  leftIcon={<UserPlus className="w-4 h-4" />}
                >
                  Create Account
                </MotionButton>
              </form>
            )}

            {/* 3. FORGOT PASSWORD VIEW (REQUEST LINK) */}
            {mode === 'forgot_password' && (
              <div>
                {isResetLinkSent ? (
                  <div className="space-y-4 py-2 text-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Password reset link sent</h4>
                      <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                        Check your email for instructions to reset your password. If an account is associated with <span className="text-zinc-200 font-mono">{email}</span>, you will receive a reset link shortly.
                      </p>
                    </div>
                    <MotionButton
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMode('signin');
                        setFormError(null);
                        setSuccessMessage(null);
                        setIsResetLinkSent(false);
                      }}
                      className="w-full mt-2"
                      leftIcon={<ArrowLeft className="w-4 h-4" />}
                    >
                      Return to Sign In
                    </MotionButton>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPasswordSubmit} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">Account Email Address</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777A7E]" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="creator@studio.com"
                          required
                          disabled={isSubmitting}
                          className="w-full pl-9 pr-3 py-2 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                        />
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1.5">
                        We will send a secure recovery link that brings you back to Clipper to enter a new password.
                      </p>
                    </div>

                    <MotionButton
                      type="submit"
                      variant="primary"
                      size="md"
                      isLoading={isSubmitting}
                      disabled={!isConfigured}
                      className="w-full mt-2"
                      leftIcon={<Send className="w-4 h-4" />}
                    >
                      Send reset link
                    </MotionButton>
                  </form>
                )}
              </div>
            )}

            {/* 4. RESET PASSWORD VIEW (NEW PASSWORD ENTRY) */}
            {mode === 'reset_password' && (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">New Password</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777A7E]" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Confirm New Password</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777A7E]" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 bg-[#141516] border border-[#292B2D] rounded-lg text-xs text-[#F2F2F0] placeholder-[#777A7E] focus:outline-none focus:border-[#686B70] focus:ring-1 focus:ring-[#C7C9CC] transition-colors"
                    />
                  </div>
                </div>

                <MotionButton
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSubmitting}
                  disabled={!isConfigured}
                  className="w-full mt-2"
                  leftIcon={<KeyRound className="w-4 h-4" />}
                >
                  Update password
                </MotionButton>
              </form>
            )}
            </>
            )}

            {/* Switch Mode Footer */}
            {!signupVerificationSent && (
            <div className="pt-4 mt-4 border-t border-[#292B2D] text-center">
              {mode === 'signin' && (
                <p className="text-xs text-zinc-400">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setFormError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[#C7C9CC] hover:text-white font-medium underline ml-1 cursor-pointer"
                  >
                    Sign up
                  </button>
                </p>
              )}

              {mode === 'signup' && (
                <p className="text-xs text-zinc-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setFormError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[#C7C9CC] hover:text-white font-medium underline ml-1 cursor-pointer"
                  >
                    Sign in
                  </button>
                </p>
              )}

              {(mode === 'forgot_password' && !isResetLinkSent) && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setFormError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-xs text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 mx-auto font-medium transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                </button>
              )}

              {mode === 'reset_password' && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-xs text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 mx-auto font-medium transition-colors cursor-pointer"
                >
                  Cancel and return to studio
                </button>
              )}
            </div>
            )}
          </Surface>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
