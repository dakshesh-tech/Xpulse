import type express from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  signInProvider?: string;
}

export type VerifyIdTokenFn = (idToken: string) => Promise<{
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  firebase?: { sign_in_provider?: string };
}>;

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

export function createRequireAuth(verifyTokenFn?: VerifyIdTokenFn): express.RequestHandler {
  const verify: VerifyIdTokenFn =
    verifyTokenFn ?? ((token: string) => adminAuth.verifyIdToken(token));

  return async (req, res, next) => {
    const authHeader = req.header('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!match || !match[1]) {
      return res.status(401).json({
        error: 'Authentication required. Please sign in to continue.',
        code: 'AUTH_REQUIRED',
      });
    }

    const token = match[1].trim();
    if (!token || token.length < 16) {
      return res.status(401).json({
        error: 'Invalid authentication token.',
        code: 'INVALID_TOKEN',
      });
    }

    try {
      const decoded = await verify(token);
      if (!decoded || !decoded.uid) {
        return res.status(401).json({
          error: 'Authentication token did not resolve to a valid user.',
          code: 'INVALID_TOKEN',
        });
      }

      const signInProvider = decoded.firebase?.sign_in_provider;
      const emailVerified =
        Boolean(decoded.email_verified) || signInProvider === 'google.com';

      req.authUser = {
        uid: decoded.uid,
        email: decoded.email || '',
        emailVerified,
        name: decoded.name,
        signInProvider,
      };
      return next();
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      const isExpired = code === 'auth/id-token-expired';
      return res.status(401).json({
        error: isExpired
          ? 'Your session has expired. Please sign in again.'
          : 'Invalid or expired authentication session.',
        code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      });
    }
  };
}

export const requireVerifiedEmail: express.RequestHandler = (req, res, next) => {
  if (!req.authUser) {
    return res.status(401).json({
      error: 'Authentication required.',
      code: 'AUTH_REQUIRED',
    });
  }
  if (!req.authUser.emailVerified) {
    return res.status(403).json({
      error: 'Please verify your email address before accessing your Chronicle.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  return next();
};
