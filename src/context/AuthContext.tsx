import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  detectLocalLegacyProgress,
  LEGACY_MIGRATION_MARKER_KEY,
  sanitizeCharacterName,
} from '../data/newCharacterTemplate';
import {
  evaluatePasswordStrength,
  mapFirebaseAuthError,
  validateEmailFormat,
  validateUsernameFormat,
} from '../lib/authErrors';
import { auth, googleAuthProvider } from '../lib/firebase';
import {
  type AccountProfileResponse,
  deleteAccountOnServer,
  fetchAccountProfile,
  initializeAccountProfile,
  updateAccountUsername,
} from '../services/gameMasterService';
import type { GameState } from '../types/rpg';

interface PendingSignupIntent {
  username: string;
  wantsMigration: boolean;
}

const SIGNUP_INTENT_PREFIX = 'chronicle_signup_intent_';

export interface InitializedCloudProfile {
  state: GameState;
  revision: number;
  migrated: boolean;
}

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;
  profileLoading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isPasswordAccount: boolean;
  accountProfile: AccountProfileResponse | null;
  initializedProfile: InitializedCloudProfile | null;
  needsMigrationChoice: boolean;
  localLegacyDetected: boolean;
  authNotice: string | null;
  clearAuthNotice: () => void;
  registerWithEmail: (params: {
    email: string;
    password: string;
    confirmPassword: string;
    username: string;
    migrateExisting: boolean;
  }) => Promise<void>;
  loginWithEmail: (params: {
    email: string;
    password: string;
    rememberMe: boolean;
  }) => Promise<void>;
  loginWithGoogle: (rememberMe: boolean) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  completeOnboardingInitialization: (options: {
    username: string;
    importExistingProgress: boolean;
  }) => Promise<void>;
  updateUsername: (username: string) => Promise<{
    state?: GameState;
    revision?: number;
  }>;
  changePassword: (params: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<void>;
  signOutAccount: () => Promise<void>;
  deleteAccount: (currentPassword?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function saveSignupIntent(email: string, intent: PendingSignupIntent) {
  try {
    window.sessionStorage.setItem(
      `${SIGNUP_INTENT_PREFIX}${email.trim().toLowerCase()}`,
      JSON.stringify(intent)
    );
  } catch {
    // Ignore storage restriction
  }
}

function consumeSignupIntent(email: string): PendingSignupIntent | null {
  try {
    const key = `${SIGNUP_INTENT_PREFIX}${email.trim().toLowerCase()}`;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    window.sessionStorage.removeItem(key);
    return JSON.parse(raw) as PendingSignupIntent;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [accountProfile, setAccountProfile] = useState<AccountProfileResponse | null>(null);
  const [initializedProfile, setInitializedProfile] =
    useState<InitializedCloudProfile | null>(null);
  const [needsMigrationChoice, setNeedsMigrationChoice] = useState(false);
  const [localLegacyDetected, setLocalLegacyDetected] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const clearAuthNotice = () => setAuthNotice(null);

  const computeVerified = (u: User | null): boolean => {
    if (!u) return false;
    return (
      Boolean(u.emailVerified) ||
      u.providerData.some((p) => p.providerId === 'google.com')
    );
  };

  const syncAccountFromBackend = useCallback(async (firebaseUser: User) => {
    setProfileLoading(true);
    try {
      const profileResp = await fetchAccountProfile();
      setAccountProfile(profileResp);

      const verified =
        Boolean(firebaseUser.emailVerified) ||
        profileResp.user.emailVerified ||
        firebaseUser.providerData.some((p) => p.providerId === 'google.com');

      const localLegacy = detectLocalLegacyProgress();
      setLocalLegacyDetected(Boolean(localLegacy));

      if (!verified) {
        setInitializedProfile(null);
        setNeedsMigrationChoice(false);
        return;
      }

      if (profileResp.profileExists && profileResp.state) {
        setInitializedProfile({
          state: profileResp.state,
          revision: profileResp.revision,
          migrated: false,
        });
        setNeedsMigrationChoice(false);
        return;
      }

      // First-time verified login without a cloud profile yet
      const intent = firebaseUser.email ? consumeSignupIntent(firebaseUser.email) : null;
      const hasAnyLegacy = Boolean(localLegacy) || profileResp.legacyServerAvailable;

      if (!hasAnyLegacy) {
        // Auto-create fresh Level 1 character immediately
        const chosenName = sanitizeCharacterName(
          intent?.username ||
            firebaseUser.displayName ||
            profileResp.user.username ||
            'Adventurer'
        );
        const created = await initializeAccountProfile({
          username: chosenName,
          localCandidateState: null,
          claimLegacyServer: false,
        });
        setInitializedProfile({
          state: created.state,
          revision: created.revision,
          migrated: created.migrated,
        });
        setNeedsMigrationChoice(false);
        return;
      }

      if (intent) {
        const created = await initializeAccountProfile({
          username: intent.username,
          localCandidateState: intent.wantsMigration ? localLegacy : null,
          claimLegacyServer: intent.wantsMigration && profileResp.legacyServerAvailable,
        });
        if (intent.wantsMigration) {
          try {
            window.localStorage.setItem(LEGACY_MIGRATION_MARKER_KEY, firebaseUser.uid);
          } catch {
            // Ignore storage error
          }
        }
        setInitializedProfile({
          state: created.state,
          revision: created.revision,
          migrated: created.migrated,
        });
        setNeedsMigrationChoice(false);
        return;
      }

      // Google Sign-In or returning verified user with unclaimed legacy progress -> prompt explicit choice
      setInitializedProfile(null);
      setNeedsMigrationChoice(true);
    } catch (err) {
      console.error('[Chronicle Auth] Failed loading account profile:', err);
      setAuthNotice(
        err instanceof Error ? err.message : 'Unable to synchronize account profile.'
      );
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (!firebaseUser) {
        setAccountProfile(null);
        setInitializedProfile(null);
        setNeedsMigrationChoice(false);
        setLocalLegacyDetected(Boolean(detectLocalLegacyProgress()));
        return;
      }
      void syncAccountFromBackend(firebaseUser);
    });

    const handleAuthExpired = () => {
      setAuthNotice('Your session expired or was signed out. Please sign in again.');
    };
    window.addEventListener('chronicle:auth-expired', handleAuthExpired);

    return () => {
      unsubscribe();
      window.removeEventListener('chronicle:auth-expired', handleAuthExpired);
    };
  }, [syncAccountFromBackend]);

  const registerWithEmail: AuthContextValue['registerWithEmail'] = async ({
    email,
    password,
    confirmPassword,
    username,
    migrateExisting,
  }) => {
    const cleanEmail = email.trim();
    const cleanUsername = username.trim();

    if (!validateEmailFormat(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    const usernameErr = validateUsernameFormat(cleanUsername);
    if (usernameErr) {
      throw new Error(usernameErr);
    }
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }
    const strength = evaluatePasswordStrength(password);
    if (!strength.isAcceptable) {
      throw new Error(
        'Password must be at least 8 characters and include lowercase letters plus uppercase letters, numbers, or symbols.'
      );
    }

    saveSignupIntent(cleanEmail, {
      username: sanitizeCharacterName(cleanUsername),
      wantsMigration: migrateExisting,
    });

    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, {
        displayName: sanitizeCharacterName(cleanUsername),
      });
      await sendEmailVerification(cred.user);
      setUser(cred.user);
      await syncAccountFromBackend(cred.user);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const loginWithEmail: AuthContextValue['loginWithEmail'] = async ({
    email,
    password,
    rememberMe,
  }) => {
    const cleanEmail = email.trim();
    if (!validateEmailFormat(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password) {
      throw new Error('Please enter your password.');
    }

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      setAuthNotice(null);
      setUser(cred.user);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const loginWithGoogle: AuthContextValue['loginWithGoogle'] = async (rememberMe) => {
    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      const cred = await signInWithPopup(auth, googleAuthProvider);
      setAuthNotice(null);
      setUser(cred.user);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) {
      throw new Error('No active user session found.');
    }
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const checkEmailVerification = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const reloaded = auth.currentUser;
      setUser(reloaded);
      const verified = computeVerified(reloaded);
      if (verified) {
        await syncAccountFromBackend(reloaded);
      }
      return verified;
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const sendPasswordReset = async (email: string) => {
    const cleanEmail = email.trim();
    if (!validateEmailFormat(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const completeOnboardingInitialization: AuthContextValue['completeOnboardingInitialization'] =
    async ({ username, importExistingProgress }) => {
      if (!auth.currentUser) {
        throw new Error('You must be signed in first.');
      }
      const cleanName = sanitizeCharacterName(username);
      const localLegacy = importExistingProgress ? detectLocalLegacyProgress() : null;
      const claimLegacyServer =
        importExistingProgress && Boolean(accountProfile?.legacyServerAvailable);

      const created = await initializeAccountProfile({
        username: cleanName,
        localCandidateState: localLegacy,
        claimLegacyServer,
      });

      if (importExistingProgress) {
        try {
          window.localStorage.setItem(LEGACY_MIGRATION_MARKER_KEY, auth.currentUser.uid);
        } catch {
          // Ignore storage error
        }
      }

      if (auth.currentUser.displayName !== cleanName) {
        await updateProfile(auth.currentUser, { displayName: cleanName }).catch(() => {});
      }

      setInitializedProfile({
        state: created.state,
        revision: created.revision,
        migrated: created.migrated,
      });
      setNeedsMigrationChoice(false);
    };

  const updateUsername = async (username: string) => {
    const errMsg = validateUsernameFormat(username);
    if (errMsg) throw new Error(errMsg);
    const clean = sanitizeCharacterName(username);
    const res = await updateAccountUsername(clean);
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: clean }).catch(() => {});
    }
    setAccountProfile((prev) =>
      prev ? { ...prev, user: { ...prev.user, username: res.username } } : prev
    );
    return { state: res.state, revision: res.revision };
  };

  const changePassword: AuthContextValue['changePassword'] = async ({
    currentPassword,
    newPassword,
    confirmPassword,
  }) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('You must be signed in with an email account.');
    }
    if (newPassword !== confirmPassword) {
      throw new Error('New passwords do not match.');
    }
    const strength = evaluatePasswordStrength(newPassword);
    if (!strength.isAcceptable) {
      throw new Error(
        'New password must be at least 8 characters and include lowercase letters plus uppercase letters, numbers, or symbols.'
      );
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const signOutAccount = async () => {
    setInitializedProfile(null);
    setAccountProfile(null);
    setNeedsMigrationChoice(false);
    await signOut(auth);
  };

  const deleteAccount = async (currentPassword?: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user found.');
    }

    const uid = currentUser.uid;
    const isPassword = currentUser.providerData.some(
      (p) => p.providerId === 'password'
    );

    try {
      if (isPassword) {
        if (!currentPassword || !currentUser.email) {
          throw new Error('Please enter your current password to confirm account deletion.');
        }
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
      } else if (currentUser.providerData.some((p) => p.providerId === 'google.com')) {
        try {
          await reauthenticateWithPopup(currentUser, googleAuthProvider);
        } catch (reauthErr) {
          throw new Error(mapFirebaseAuthError(reauthErr));
        }
      }

      // Delete Cloud SQL user + cascaded progression data first while token is still valid
      await deleteAccountOnServer();

      // Remove only this user's UID-scoped local cache (never delete untouched legacy data)
      try {
        window.localStorage.removeItem(`chronicle_rpg_state_uid_${uid}`);
      } catch {
        // Ignore
      }

      await deleteUser(currentUser);
      setInitializedProfile(null);
      setAccountProfile(null);
      setNeedsMigrationChoice(false);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await syncAccountFromBackend(auth.currentUser);
    }
  };

  const isEmailVerified = computeVerified(user);
  const isPasswordAccount = Boolean(
    user?.providerData.some((p) => p.providerId === 'password')
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        profileLoading,
        isAuthenticated: Boolean(user),
        isEmailVerified,
        isPasswordAccount,
        accountProfile,
        initializedProfile,
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
        updateUsername,
        changePassword,
        signOutAccount,
        deleteAccount,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
