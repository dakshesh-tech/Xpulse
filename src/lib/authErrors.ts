export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Strong' | 'Fortress';
  checks: {
    minLength: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
  isAcceptable: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };

  let passed = 0;
  if (checks.minLength) passed++;
  if (checks.hasUpper) passed++;
  if (checks.hasLower) passed++;
  if (checks.hasNumber) passed++;
  if (checks.hasSymbol) passed++;

  let score: PasswordStrengthResult['score'] = 0;
  if (!checks.minLength) {
    score = password.length > 0 ? 1 : 0;
  } else if (passed <= 2) {
    score = 1;
  } else if (passed === 3) {
    score = 2;
  } else if (passed === 4) {
    score = 3;
  } else {
    score = 4;
  }

  const labels: Record<PasswordStrengthResult['score'], PasswordStrengthResult['label']> = {
    0: 'Too weak',
    1: 'Weak',
    2: 'Fair',
    3: 'Strong',
    4: 'Fortress',
  };

  const isAcceptable =
    checks.minLength && checks.hasLower && (checks.hasUpper || checks.hasNumber || checks.hasSymbol);

  return {
    score,
    label: labels[score],
    checks,
    isAcceptable,
  };
}

export function validateEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function validateUsernameFormat(username: string): string | null {
  const trimmed = username.trim();
  if (trimmed.length < 2) {
    return 'Adventurer name must be at least 2 characters.';
  }
  if (trimmed.length > 32) {
    return 'Adventurer name must be 32 characters or fewer.';
  }
  if (!/^[\p{L}\p{N}_\-\s'.]+$/u.test(trimmed)) {
    return 'Adventurer name contains unsupported symbols.';
  }
  return null;
}

export function mapFirebaseAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const rawMessage = err instanceof Error ? err.message : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in or resetting your password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with mixed letters and numbers.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please verify your credentials and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts in a short period. Please wait a few minutes before trying again.';
    case 'auth/network-request-failed':
      return 'Network connection error while contacting authentication servers. Please retry.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/requires-recent-login':
      return 'For security, please confirm your current password or sign in again before performing this action.';
    case 'auth/popup-closed-by-user':
      return 'Google Sign-In popup was closed before completion.';
    case 'auth/popup-blocked':
      return 'Browser blocked the Google Sign-In popup. Please allow popups for this site and try again.';
    case 'auth/cancelled-popup-request':
      return 'Google Sign-In request was interrupted. Please try again.';
    case 'auth/unauthorized-domain':
      return 'This preview domain is not yet authorized for Google Sign-In in Firebase Console. Use Email & Password or authorize this domain.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console Authentication settings. Enable Email/Password in Firebase Console or use Google Sign-In.';
    default:
      if (/sk-or-|AIza|Bearer\s+/i.test(rawMessage)) {
        return 'Authentication failed due to a configuration error.';
      }
      return rawMessage || 'Authentication failed. Please try again.';
  }
}
