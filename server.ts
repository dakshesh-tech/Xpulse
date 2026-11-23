import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AIModelManager } from './server/ai/modelManager.ts';
import { isSqlConfigured } from './src/db/index.ts';
import {
  deleteUserAccountData,
  getPlayerProfileRecord,
  initializePlayerProfile,
  isLegacyStateClaimed,
  recordAIUsageToDb,
  savePlayerState,
  syncAITaskToDb,
  updateUsernameRecord,
  upsertUserRecord,
} from './src/db/repository.ts';
import {
  createFreshCharacterState,
  normalizeAndValidateGameState,
  sanitizeCharacterName,
} from './src/data/newCharacterTemplate.ts';
import {
  createRequireAuth,
  requireVerifiedEmail,
  type VerifyIdTokenFn,
} from './src/middleware/auth.ts';
import type {
  ActivityDifficulty,
  CollectibleType,
  ExperienceActivity,
  GameState,
  Rarity,
} from './src/types/rpg.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'server-data');
const ASSETS_DIR = path.resolve(DATA_DIR, 'assets');
const LEGACY_STATE_FILE = path.resolve(DATA_DIR, 'chronicle-state.json');

fs.mkdirSync(ASSETS_DIR, { recursive: true });

function sanitizeUidForFilename(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96) || 'user';
}

function getIsolatedFileStatePath(baseDir: string, uid: string): string {
  const safeUid = sanitizeUidForFilename(uid);
  const resolved = path.resolve(baseDir, `chronicle-state-${safeUid}.json`);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid state path resolution.');
  }
  return resolved;
}

function readLegacyServerStateIfMeaningful(): GameState | null {
  try {
    if (!fs.existsSync(LEGACY_STATE_FILE)) return null;
    const raw = fs.readFileSync(LEGACY_STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (!parsed?.player || !parsed?.attributes) return null;
    const normalized = normalizeAndValidateGameState(parsed, parsed.player.name);
    if (
      normalized.player.totalExp > 0 ||
      normalized.activities.length > 0 ||
      normalized.quests.length > 0
    ) {
      return normalized;
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizeErrorText(raw: string, fallback: string): string {
  if (!raw) return fallback;
  if (/sk-or-[a-zA-Z0-9_-]+|AIza[0-9A-Za-z_-]{10,}|Bearer\s+\S+|apiKey=/i.test(raw)) {
    return fallback;
  }
  return raw;
}

const VALID_DIFFICULTIES: ActivityDifficulty[] = [
  'Tiny',
  'Easy',
  'Medium',
  'Hard',
  'Very Hard',
  'Exceptional',
];

const VALID_COLLECTIBLE_TYPES: CollectibleType[] = [
  'Relic',
  'Artifact',
  'Portrait',
  'Frame',
  'Token',
];

function normalizeDifficulty(raw: string): ActivityDifficulty {
  const match = VALID_DIFFICULTIES.find(
    (d) => d.toLowerCase() === (raw || '').toLowerCase().trim()
  );
  return match ?? 'Medium';
}

function normalizeCollectibleType(raw: string): CollectibleType {
  const match = VALID_COLLECTIBLE_TYPES.find(
    (t) => t.toLowerCase() === (raw || '').toLowerCase().trim()
  );
  return match ?? 'Relic';
}

export async function createAppServer(options?: {
  dataDir?: string;
  assetsDir?: string;
  aiManager?: AIModelManager;
  disableVite?: boolean;
  verifyIdTokenFn?: VerifyIdTokenFn;
  useDatabase?: boolean;
}) {
  const dataDir = options?.dataDir ?? DATA_DIR;
  const assetsDir = options?.assetsDir ?? ASSETS_DIR;
  fs.mkdirSync(assetsDir, { recursive: true });

  const useDb =
    typeof options?.useDatabase === 'boolean'
      ? options.useDatabase
      : options?.dataDir && options.dataDir !== DATA_DIR
        ? false
        : isSqlConfigured();

  const aiManager =
    options?.aiManager ??
    new AIModelManager({
      dataDir,
      assetsDir,
    });

  const requireAuth = createRequireAuth(options?.verifyIdTokenFn);

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Lightweight per-user / IP sliding-window rate limiter on AI endpoints
  const apiHits = new Map<string, number[]>();
  const aiRateLimitMiddleware: express.RequestHandler = (req, res, next) => {
    const uid = req.authUser?.uid || 'anon';
    const key = `${req.ip || 'local'}:${uid}`;
    const now = Date.now();
    const hits = (apiHits.get(key) || []).filter((ts) => now - ts < 60000);
    if (hits.length >= 60) {
      return res.status(429).json({
        error: 'Too many AI requests in a short window. Please wait a moment and retry.',
        code: 'API_RATE_LIMIT',
      });
    }
    hits.push(now);
    apiHits.set(key, hits);
    return next();
  };

  app.get('/api/health', (_req, res) => {
    return res.json({
      ok: true,
      freeOnlyMode: aiManager.freeOnlyMode,
      databaseConfigured: useDb,
    });
  });

  // 1. Account & Migration Endpoints (strictly bound to verified Firebase UID)
  app.get('/api/account/profile', requireAuth, async (req, res) => {
    try {
      const authUser = req.authUser!;
      const fallbackName =
        authUser.name || authUser.email.split('@')[0] || 'Adventurer';

      if (useDb) {
        const userRow = await upsertUserRecord({
          uid: authUser.uid,
          email: authUser.email,
          username: fallbackName,
          emailVerified: authUser.emailVerified,
        });
        const profile = await getPlayerProfileRecord(authUser.uid);
        let legacyServerAvailable = false;
        if (!profile && authUser.emailVerified) {
          const claimed = await isLegacyStateClaimed();
          if (!claimed && readLegacyServerStateIfMeaningful() !== null) {
            legacyServerAvailable = true;
          }
        }

        return res.json({
          user: {
            uid: authUser.uid,
            email: authUser.email,
            username: userRow.username,
            emailVerified: authUser.emailVerified,
            signInProvider: authUser.signInProvider || 'password',
          },
          profileExists: Boolean(profile),
          legacyServerAvailable,
          revision: profile?.revision ?? 0,
          state: profile
            ? normalizeAndValidateGameState(profile.gameStateJson, profile.characterName)
            : null,
        });
      }

      // Isolated file fallback when Cloud SQL is disabled (e.g. local unit tests)
      const filePath = getIsolatedFileStatePath(dataDir, authUser.uid);
      const hasProfile = fs.existsSync(filePath);
      const parsed = hasProfile
        ? (JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
            state?: GameState;
            revision?: number;
          })
        : null;
      return res.json({
        user: {
          uid: authUser.uid,
          email: authUser.email,
          username: parsed?.state?.player?.name || sanitizeCharacterName(fallbackName),
          emailVerified: authUser.emailVerified,
          signInProvider: authUser.signInProvider || 'password',
        },
        profileExists: Boolean(parsed?.state),
        legacyServerAvailable: false,
        revision: parsed?.revision ?? 0,
        state: parsed?.state ?? null,
      });
    } catch (err) {
      return res.status(500).json({
        error: sanitizeErrorText(
          err instanceof Error ? err.message : '',
          'Failed to load account profile.'
        ),
      });
    }
  });

  app.post('/api/account/initialize', requireAuth, requireVerifiedEmail, async (req, res) => {
    try {
      const authUser = req.authUser!;
      const requestedUsername = sanitizeCharacterName(
        String(
          req.body?.username ||
            authUser.name ||
            authUser.email.split('@')[0] ||
            'Adventurer'
        )
      );
      const claimLegacyServer = Boolean(req.body?.claimLegacyServer);
      const localCandidateState =
        req.body?.localCandidateState &&
        typeof req.body.localCandidateState === 'object'
          ? (req.body.localCandidateState as Partial<GameState>)
          : null;

      if (useDb) {
        const legacyServerState = claimLegacyServer
          ? readLegacyServerStateIfMeaningful()
          : null;
        const result = await initializePlayerProfile({
          uid: authUser.uid,
          email: authUser.email,
          emailVerified: authUser.emailVerified,
          username: requestedUsername,
          localCandidateState,
          claimLegacyServer,
          legacyServerState,
        });
        return res.json(result);
      }

      const filePath = getIsolatedFileStatePath(dataDir, authUser.uid);
      if (fs.existsSync(filePath)) {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
          state: GameState;
          revision: number;
        };
        return res.json({
          state: existing.state,
          revision: existing.revision || 1,
          migrated: false,
          alreadyExisted: true,
        });
      }

      const initialState = localCandidateState
        ? normalizeAndValidateGameState(localCandidateState, requestedUsername)
        : createFreshCharacterState(requestedUsername);
      const payload = { state: initialState, revision: 1 };
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
      fs.renameSync(tmp, filePath);

      return res.json({
        state: initialState,
        revision: 1,
        migrated: Boolean(localCandidateState),
        alreadyExisted: false,
      });
    } catch (err) {
      return res.status(500).json({
        error: sanitizeErrorText(
          err instanceof Error ? err.message : '',
          'Failed to initialize character profile.'
        ),
      });
    }
  });

  app.patch('/api/account/username', requireAuth, requireVerifiedEmail, async (req, res) => {
    try {
      const authUser = req.authUser!;
      const rawName = String(req.body?.username || '').trim();
      if (rawName.length < 2 || rawName.length > 32) {
        return res
          .status(400)
          .json({ error: 'Adventurer name must be between 2 and 32 characters.' });
      }

      if (useDb) {
        const updated = await updateUsernameRecord({
          uid: authUser.uid,
          username: rawName,
        });
        return res.json({ ok: true, ...updated });
      }

      const clean = sanitizeCharacterName(rawName);
      const filePath = getIsolatedFileStatePath(dataDir, authUser.uid);
      if (fs.existsSync(filePath)) {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
          state: GameState;
          revision: number;
        };
        const nextState = normalizeAndValidateGameState(
          {
            ...existing.state,
            player: { ...existing.state.player, name: clean },
          },
          clean
        );
        const nextRevision = (existing.revision || 1) + 1;
        fs.writeFileSync(
          filePath,
          JSON.stringify({ state: nextState, revision: nextRevision }, null, 2),
          'utf-8'
        );
        return res.json({ ok: true, username: clean, state: nextState, revision: nextRevision });
      }
      return res.json({ ok: true, username: clean });
    } catch (err) {
      return res.status(500).json({
        error: sanitizeErrorText(
          err instanceof Error ? err.message : '',
          'Failed to update username.'
        ),
      });
    }
  });

  app.delete('/api/account', requireAuth, async (req, res) => {
    try {
      const authUser = req.authUser!;
      if (useDb) {
        await deleteUserAccountData(authUser.uid);
      } else {
        const filePath = getIsolatedFileStatePath(dataDir, authUser.uid);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      aiManager.taskQueue.removeTasksForUser(authUser.uid);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        error: sanitizeErrorText(
          err instanceof Error ? err.message : '',
          'Failed to delete account data.'
        ),
      });
    }
  });

  // 2. State Persistence Endpoints (strictly authenticated & UID-isolated)
  app.get('/api/state', requireAuth, requireVerifiedEmail, async (req, res) => {
    try {
      const uid = req.authUser!.uid;
      if (useDb) {
        const profile = await getPlayerProfileRecord(uid);
        if (!profile) {
          return res.json({ state: null, revision: 0 });
        }
        return res.json({
          state: normalizeAndValidateGameState(profile.gameStateJson, profile.characterName),
          revision: profile.revision,
        });
      }

      const targetFile = getIsolatedFileStatePath(dataDir, uid);
      if (!fs.existsSync(targetFile)) {
        return res.json({ state: null, revision: 0 });
      }
      const raw = fs.readFileSync(targetFile, 'utf-8');
      const parsed = JSON.parse(raw) as { state?: GameState; revision?: number } | GameState;
      if ('state' in parsed && parsed.state) {
        return res.json({
          state: normalizeAndValidateGameState(parsed.state),
          revision: parsed.revision ?? 1,
        });
      }
      return res.json({
        state: normalizeAndValidateGameState(parsed as GameState),
        revision: 1,
      });
    } catch {
      return res.status(500).json({ error: 'Failed to read persisted chronicle state.' });
    }
  });

  app.put('/api/state', requireAuth, requireVerifiedEmail, async (req, res) => {
    try {
      const uid = req.authUser!.uid;
      const incoming = req.body?.state as Partial<GameState> | undefined;
      if (!incoming || !incoming.player || !incoming.attributes) {
        return res.status(400).json({ error: 'Invalid chronicle state payload.' });
      }
      const expectedRevision =
        typeof req.body?.expectedRevision === 'number' &&
        Number.isFinite(req.body.expectedRevision)
          ? req.body.expectedRevision
          : undefined;

      if (useDb) {
        const result = await savePlayerState({
          uid,
          incomingState: incoming,
          expectedRevision,
        });
        if (!result.ok) {
          if ('notFound' in result) {
            return res.status(404).json({
              error: 'Character profile has not been initialized yet.',
              code: 'PROFILE_NOT_INITIALIZED',
            });
          }
          return res.status(409).json({
            error: 'A newer Chronicle revision was saved from another session.',
            code: 'STATE_CONFLICT',
            currentState: result.currentState,
            currentRevision: result.currentRevision,
          });
        }
        return res.json({
          ok: true,
          state: result.state,
          revision: result.revision,
        });
      }

      const targetFile = getIsolatedFileStatePath(dataDir, uid);
      let currentRevision = 0;
      if (fs.existsSync(targetFile)) {
        const existingRaw = JSON.parse(fs.readFileSync(targetFile, 'utf-8')) as {
          state?: GameState;
          revision?: number;
        };
        currentRevision = existingRaw.revision ?? 1;
        if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
          return res.status(409).json({
            error: 'A newer Chronicle revision was saved from another session.',
            code: 'STATE_CONFLICT',
            currentState: existingRaw.state,
            currentRevision,
          });
        }
      }
      const validated = normalizeAndValidateGameState(incoming);
      const nextRevision = currentRevision + 1;
      const tmpFile = `${targetFile}.tmp`;
      fs.writeFileSync(
        tmpFile,
        JSON.stringify({ state: validated, revision: nextRevision }, null, 2),
        'utf-8'
      );
      fs.renameSync(tmpFile, targetFile);
      return res.json({ ok: true, state: validated, revision: nextRevision });
    } catch {
      return res.status(500).json({ error: 'Failed to save chronicle state.' });
    }
  });

  // 3. Persistent Collectible Artwork Asset Route (strict path confinement)
  app.get('/api/assets/:filename', (req, res) => {
    const filename = req.params.filename || '';
    if (!/^[a-zA-Z0-9_-]+\.(svg|png|jpg|jpeg|webp)$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid asset filename.' });
    }
    const resolvedPath = path.resolve(assetsDir, filename);
    if (!resolvedPath.startsWith(assetsDir + path.sep)) {
      return res.status(403).json({ error: 'Forbidden asset path.' });
    }
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Asset not found.' });
    }
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.svg'
        ? 'image/svg+xml; charset=utf-8'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(resolvedPath);
  });

  // 4. Central AI Status & Pending Queue Endpoints (strictly authenticated & UID-scoped)
  app.get('/api/ai/status', requireAuth, requireVerifiedEmail, async (req, res) => {
    try {
      const userId = req.authUser!.uid;
      const snapshot = await aiManager.getStatusSnapshot(userId);
      return res.json(snapshot);
    } catch (err) {
      return res.status(500).json({
        error: sanitizeErrorText(
          err instanceof Error ? err.message : '',
          'Failed to fetch AI system status.'
        ),
      });
    }
  });

  app.post(
    '/api/ai/models/refresh',
    requireAuth,
    requireVerifiedEmail,
    aiRateLimitMiddleware,
    async (req, res) => {
      try {
        const userId = req.authUser!.uid;
        await aiManager.refreshCatalogueAndQuota(true);
        const snapshot = await aiManager.getStatusSnapshot(userId);
        return res.json(snapshot);
      } catch (err) {
        return res.status(502).json({
          error: sanitizeErrorText(
            err instanceof Error ? err.message : '',
            'Failed to refresh free model catalogue.'
          ),
        });
      }
    }
  );

  app.get('/api/ai/tasks', requireAuth, requireVerifiedEmail, (req, res) => {
    const userId = req.authUser!.uid;
    return res.json({
      tasks: aiManager.taskQueue.listForUser(userId),
    });
  });

  app.post(
    '/api/ai/tasks/process',
    requireAuth,
    requireVerifiedEmail,
    aiRateLimitMiddleware,
    async (req, res) => {
      try {
        const userId = req.authUser!.uid;
        const result = await aiManager.processPendingQueue(userId);
        const userTasks = aiManager.taskQueue.listForUser(userId);
        if (useDb) {
          await Promise.all(userTasks.map((t) => syncAITaskToDb(t)));
        }
        return res.json({
          processed: result.processed,
          tasks: userTasks,
        });
      } catch (err) {
        return res.status(500).json({
          error: sanitizeErrorText(
            err instanceof Error ? err.message : '',
            'Failed to process pending AI tasks.'
          ),
        });
      }
    }
  );

  app.post(
    '/api/ai/tasks/:id/retry',
    requireAuth,
    requireVerifiedEmail,
    aiRateLimitMiddleware,
    async (req, res) => {
      const userId = req.authUser!.uid;
      const taskId = String(req.params.id || '');
      const scheduled = aiManager.taskQueue.scheduleImmediateRetry(taskId, userId);
      if (!scheduled) {
        return res.status(404).json({ error: 'Pending task not found for this user.' });
      }
      await aiManager.processPendingQueue(userId);
      const updated = aiManager.taskQueue.getById(taskId, userId);
      if (useDb && updated) {
        await syncAITaskToDb(updated);
      }
      return res.json({ task: updated });
    }
  );

  app.post(
    '/api/ai/tasks/:id/cancel',
    requireAuth,
    requireVerifiedEmail,
    aiRateLimitMiddleware,
    async (req, res) => {
      const userId = req.authUser!.uid;
      const taskId = String(req.params.id || '');
      const cancelled = aiManager.taskQueue.markCancelled(taskId, userId);
      if (!cancelled) {
        return res.status(404).json({ error: 'Pending task not found for this user.' });
      }
      if (useDb) {
        const updated = aiManager.taskQueue.getById(taskId, userId);
        if (updated) await syncAITaskToDb(updated);
      }
      return res.json({ ok: true });
    }
  );

  // 5. AI Chronicle Evaluation Endpoint
  app.post(
    '/api/gm/evaluate',
    requireAuth,
    requireVerifiedEmail,
    aiRateLimitMiddleware,
    async (req, res) => {
      const userId = req.authUser!.uid;
      const today = new Date().toISOString().slice(0, 10);
      try {
        const userInput = String(req.body?.userInput || '').trim();
        const clarificationContext = req.body?.clarificationContext
          ? String(req.body.clarificationContext).trim()
          : undefined;
        const playerName = String(req.body?.playerName || 'Adventurer').slice(0, 48);
        const idempotencyKey =
          typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.trim()
            ? req.body.idempotencyKey.trim().slice(0, 80)
            : undefined;
        const recentSameDayActivities = Array.isArray(req.body?.recentSameDayActivities)
          ? (req.body.recentSameDayActivities as ExperienceActivity[])
          : [];

        if (!userInput) {
          return res.status(400).json({ error: 'Experience description is required.' });
        }

        const outcome = await aiManager.evaluateChronicle({
          userId,
          userInput,
          playerName,
          recentSameDayActivities,
          clarificationContext,
          idempotencyKey,
        });

        if (outcome.status === 'queued') {
          if (useDb && outcome.task) {
            await syncAITaskToDb(outcome.task);
            await recordAIUsageToDb({ userId, dailyDate: today, success: false });
          }
          return res.status(202).json({
            type: 'queued',
            message: outcome.message,
            task: outcome.task,
          });
        }

        if (useDb) {
          await recordAIUsageToDb({ userId, dailyDate: today, success: true });
        }

        return res.json(outcome.data);
      } catch (err) {
        if (useDb) {
          await recordAIUsageToDb({ userId, dailyDate: today, success: false });
        }
        return res.status(502).json({
          error: sanitizeErrorText(
            err instanceof Error ? err.message : '',
            'Failed to evaluate experience with AI Model Manager.'
          ),
          code: 'AI_EVALUATION_FAILED',
        });
      }
    }
  );

  // 6. AI Quest Generation Endpoint
  app.post(
    '/api/quests/generate',
    requireAuth,
    requireVerifiedEmail,
    aiRateLimitMiddleware,
    async (req, res) => {
      const userId = req.authUser!.uid;
      const today = new Date().toISOString().slice(0, 10);
      try {
        const goalDescription = String(req.body?.goalDescription || '').trim();
        const playerLevel = Number(req.body?.playerLevel) || 1;
        const existingQuestTitles = Array.isArray(req.body?.existingQuestTitles)
          ? (req.body.existingQuestTitles as string[])
          : [];
        const idempotencyKey =
          typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.trim()
            ? req.body.idempotencyKey.trim().slice(0, 80)
            : undefined;

        if (!goalDescription || goalDescription.length < 5) {
          return res
            .status(400)
            .json({ error: 'Please describe your goal or quest in a few words.' });
        }

        const outcome = await aiManager.generateQuest({
          userId,
          goalDescription,
          playerLevel,
          existingQuestTitles,
          idempotencyKey,
        });

        if (outcome.status === 'queued') {
          if (useDb && outcome.task) {
            await syncAITaskToDb(outcome.task);
            await recordAIUsageToDb({ userId, dailyDate: today, success: false });
          }
          return res.status(202).json({
            queued: true,
            message: outcome.message,
            task: outcome.task,
          });
        }

        if (useDb) {
          await recordAIUsageToDb({ userId, dailyDate: today, success: true });
        }

        return res.json({
          draft: outcome.draft,
          modelUsed: outcome.modelUsed,
        });
      } catch (err) {
        if (useDb) {
          await recordAIUsageToDb({ userId, dailyDate: today, success: false });
        }
        return res.status(502).json({
          error: sanitizeErrorText(
            err instanceof Error ? err.message : '',
            'Failed to generate AI quest blueprint.'
          ),
        });
      }
    }
  );

  // 7. AI Achievement & Metadata Generation Endpoint
  app.post(
    '/api/achievements/generate',
    requireAuth,
    requireVerifiedEmail,
    aiRateLimitMiddleware,
    async (req, res) => {
      const userId = req.authUser!.uid;
      const today = new Date().toISOString().slice(0, 10);
      try {
        const sourceLabel = String(req.body?.sourceLabel || '').trim();
        const sourceDescription = String(req.body?.sourceDescription || sourceLabel).trim();
        const difficulty = normalizeDifficulty(String(req.body?.difficulty || 'Medium'));
        const existingAchievementNames = Array.isArray(req.body?.existingAchievementNames)
          ? (req.body.existingAchievementNames as string[])
          : [];
        const existingCollectibleNames = Array.isArray(req.body?.existingCollectibleNames)
          ? (req.body.existingCollectibleNames as string[])
          : [];

        if (!sourceLabel) {
          return res.status(400).json({ error: 'Milestone context is required.' });
        }

        const outcome = await aiManager.generateAchievementMetadata({
          userId,
          sourceLabel,
          sourceDescription,
          difficulty,
          existingAchievementNames,
          existingCollectibleNames,
        });

        if (outcome.status === 'queued') {
          if (useDb && outcome.task) {
            await syncAITaskToDb(outcome.task);
            await recordAIUsageToDb({ userId, dailyDate: today, success: false });
          }
          return res.status(202).json({
            queued: true,
            message: outcome.message,
            task: outcome.task,
          });
        }

        if (useDb) {
          await recordAIUsageToDb({ userId, dailyDate: today, success: true });
        }

        return res.json(outcome.result);
      } catch (err) {
        if (useDb) {
          await recordAIUsageToDb({ userId, dailyDate: today, success: false });
        }
        return res.status(502).json({
          error: sanitizeErrorText(
            err instanceof Error ? err.message : '',
            'Achievement metadata generation failed.'
          ),
        });
      }
    }
  );

  // 8. Collectible Artwork Generation Pipeline
  app.post(
    '/api/collectibles/generate',
    requireAuth,
    requireVerifiedEmail,
    aiRateLimitMiddleware,
    async (req, res) => {
      const userId = req.authUser!.uid;
      const today = new Date().toISOString().slice(0, 10);
      try {
        const sourceLabel = String(req.body?.sourceLabel || '').trim();
        const sourceDescription = String(req.body?.sourceDescription || sourceLabel).trim();
        const difficulty = normalizeDifficulty(String(req.body?.difficulty || 'Medium'));
        const suggestedType = normalizeCollectibleType(String(req.body?.suggestedType || 'Relic'));
        const rarity: Rarity | undefined = req.body?.rarity
          ? (String(req.body.rarity) as Rarity)
          : undefined;
        const existingNames = Array.isArray(req.body?.existingNames)
          ? (req.body.existingNames as string[])
          : [];
        const collectibleId =
          typeof req.body?.collectibleId === 'string' && req.body.collectibleId.trim()
            ? req.body.collectibleId.trim().slice(0, 64)
            : undefined;
        const artworkPrompt =
          typeof req.body?.artworkPrompt === 'string' ? req.body.artworkPrompt : undefined;

        if (!sourceLabel) {
          return res.status(400).json({ error: 'Source experience context is required.' });
        }

        const outcome = await aiManager.generateCollectibleArtwork({
          userId,
          collectibleId,
          sourceLabel,
          sourceDescription,
          difficulty,
          suggestedType,
          rarity,
          existingNames,
          artworkPrompt,
        });

        if (outcome.status === 'rejected') {
          return res.status(400).json({ error: outcome.reason });
        }

        if (outcome.status === 'pending_artwork') {
          if (useDb && outcome.task) {
            await syncAITaskToDb(outcome.task);
          }
          return res.status(202).json({
            pendingArtwork: true,
            message: outcome.message,
            task: outcome.task,
          });
        }

        if (useDb) {
          await recordAIUsageToDb({ userId, dailyDate: today, success: true });
        }

        return res.json({
          collectible: outcome.collectible,
          modelUsed: outcome.modelUsed,
        });
      } catch (err) {
        if (useDb) {
          await recordAIUsageToDb({ userId, dailyDate: today, success: false });
        }
        return res.status(502).json({
          error: sanitizeErrorText(
            err instanceof Error ? err.message : '',
            'Collectible artwork generation failed.'
          ),
        });
      }
    }
  );

  // Guarantee /api/* NEVER falls through to SPA HTML fallback or Express HTML error pages
  app.use('/api', (_req, res) => {
    return res.status(404).json({
      error: 'Requested API endpoint does not exist.',
      code: 'API_NOT_FOUND',
    });
  });

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.path.startsWith('/api')) {
        const e = err as { status?: number; statusCode?: number; type?: string; message?: string };
        const status =
          e?.type === 'entity.parse.failed'
            ? 400
            : Number(e?.statusCode || e?.status || 500);
        return res.status(status >= 400 && status < 600 ? status : 500).json({
          error:
            e?.type === 'entity.parse.failed'
              ? 'Invalid JSON request payload.'
              : sanitizeErrorText(e?.message || '', 'Internal server error.'),
          code: e?.type === 'entity.parse.failed' ? 'INVALID_JSON_BODY' : 'SERVER_ERROR',
        });
      }
      return next(err);
    }
  );

  // Vite Dev Middleware or Static Production Build
  if (!options?.disableVite) {
    const distDir = path.resolve(__dirname, 'dist');
    const distIndexPath = path.resolve(distDir, 'index.html');
    const hasBuiltDist = fs.existsSync(distIndexPath);
    const isDevMode =
      process.env.NODE_ENV === 'development' ||
      process.env.npm_lifecycle_event === 'dev';
    const isProd =
      process.env.NODE_ENV === 'production' ||
      (!isDevMode && (process.env.npm_lifecycle_event === 'start' || hasBuiltDist));

    if (!isProd) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        if (!fs.existsSync(distIndexPath)) {
          return res
            .status(503)
            .send('Production build not found. Run "npm run build" before starting.');
        }
        return res.sendFile(distIndexPath);
      });
    }
  }

  return { app, aiManager };
}

function resolveRealPath(targetPath: string): string {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolveRealPath(process.argv[1]) === resolveRealPath(__filename);

if (isEntrypoint) {
  createAppServer()
    .then(({ app, aiManager }) => {
      aiManager.startBackgroundWorker();

      const rawPort = process.env.PORT;
      const port = rawPort && rawPort.trim() !== '' ? Number(rawPort) : 3000;
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`Invalid PORT environment variable: "${rawPort}"`);
      }

      const server = app.listen(port, '0.0.0.0', () => {
        console.log(`XPulse server listening on http://0.0.0.0:${port}`);
      });

      server.on('error', (err) => {
        console.error('[XPulse Server] Failed to bind HTTP server:', err);
        process.exit(1);
      });
    })
    .catch((err) => {
      console.error('[XPulse Server] Fatal startup error:', err);
      process.exit(1);
    });
}
