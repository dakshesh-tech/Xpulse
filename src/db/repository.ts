import { desc, eq, sql } from 'drizzle-orm';
import type { PendingTaskRecord } from '../../server/ai/types.ts';
import {
  createFreshCharacterState,
  normalizeAndValidateGameState,
  sanitizeCharacterName,
} from '../data/newCharacterTemplate.ts';
import type { GameState } from '../types/rpg.ts';
import { db } from './index.ts';
import {
  aiTasks,
  aiUsageRecords,
  legacyMigrationClaims,
  playerProfiles,
  users,
} from './schema.ts';

const LEGACY_CLAIM_KEY = 'default_legacy_chronicle';

function handleDbError(context: string, err: unknown): never {
  console.error(`[Chronicle DB] ${context}:`, err);
  throw new Error(`Database operation failed during ${context}.`, { cause: err });
}

export async function upsertUserRecord(params: {
  uid: string;
  email: string;
  username?: string;
  emailVerified: boolean;
}) {
  try {
    const cleanUsername = sanitizeCharacterName(
      params.username || params.email.split('@')[0] || 'Adventurer'
    );
    const now = new Date();
    const [row] = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: params.email,
        username: cleanUsername,
        emailVerified: params.emailVerified,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: params.email,
          emailVerified: params.emailVerified,
          updatedAt: now,
        },
      })
      .returning();
    return row;
  } catch (err) {
    handleDbError('upsertUserRecord', err);
  }
}

export async function getUserRecord(uid: string) {
  try {
    const [row] = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return row ?? null;
  } catch (err) {
    handleDbError('getUserRecord', err);
  }
}

export async function getPlayerProfileRecord(uid: string) {
  try {
    const [row] = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.uid, uid))
      .limit(1);
    return row ?? null;
  } catch (err) {
    handleDbError('getPlayerProfileRecord', err);
  }
}

export async function isLegacyStateClaimed(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(legacyMigrationClaims)
      .where(eq(legacyMigrationClaims.claimKey, LEGACY_CLAIM_KEY))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    handleDbError('isLegacyStateClaimed', err);
  }
}

export async function initializePlayerProfile(params: {
  uid: string;
  email: string;
  emailVerified: boolean;
  username: string;
  localCandidateState?: Partial<GameState> | null;
  claimLegacyServer?: boolean;
  legacyServerState?: Partial<GameState> | null;
}): Promise<{
  state: GameState;
  revision: number;
  migrated: boolean;
  alreadyExisted: boolean;
}> {
  try {
    return await db.transaction(async (tx) => {
      const safeUsername = sanitizeCharacterName(params.username);
      const now = new Date();

      await tx
        .insert(users)
        .values({
          uid: params.uid,
          email: params.email,
          username: safeUsername,
          emailVerified: params.emailVerified,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email: params.email,
            emailVerified: params.emailVerified,
            updatedAt: now,
          },
        });

      const [existing] = await tx
        .select()
        .from(playerProfiles)
        .where(eq(playerProfiles.uid, params.uid))
        .limit(1);

      if (existing) {
        return {
          state: normalizeAndValidateGameState(existing.gameStateJson, existing.characterName),
          revision: existing.revision,
          migrated: existing.migratedFromLegacy,
          alreadyExisted: true,
        };
      }

      let finalState: GameState | null = null;
      let migrated = false;

      if (params.claimLegacyServer && params.legacyServerState) {
        const [existingClaim] = await tx
          .select()
          .from(legacyMigrationClaims)
          .where(eq(legacyMigrationClaims.claimKey, LEGACY_CLAIM_KEY))
          .limit(1);

        if (!existingClaim) {
          await tx.insert(legacyMigrationClaims).values({
            claimKey: LEGACY_CLAIM_KEY,
            claimedByUid: params.uid,
            claimedAt: now,
          });
          finalState = normalizeAndValidateGameState(params.legacyServerState, safeUsername);
          migrated = true;
        }
      }

      if (!finalState && params.localCandidateState) {
        finalState = normalizeAndValidateGameState(params.localCandidateState, safeUsername);
        migrated = true;
      }

      if (!finalState) {
        finalState = createFreshCharacterState(safeUsername);
        migrated = false;
      }

      const [inserted] = await tx
        .insert(playerProfiles)
        .values({
          uid: params.uid,
          characterName: finalState.player.name,
          level: finalState.player.level,
          totalExp: finalState.player.totalExp,
          archetype: finalState.player.archetype,
          equippedTitleId: finalState.player.equippedTitleId,
          equippedCosmeticId: finalState.player.equippedCosmeticId,
          equippedPortraitId: finalState.player.equippedPortraitId,
          revision: 1,
          gameStateJson: finalState,
          migratedFromLegacy: migrated,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        state: normalizeAndValidateGameState(inserted.gameStateJson, inserted.characterName),
        revision: inserted.revision,
        migrated,
        alreadyExisted: false,
      };
    });
  } catch (err) {
    handleDbError('initializePlayerProfile', err);
  }
}

export async function savePlayerState(params: {
  uid: string;
  incomingState: Partial<GameState>;
  expectedRevision?: number;
}): Promise<
  | { ok: true; state: GameState; revision: number }
  | { ok: false; conflict: true; currentState: GameState; currentRevision: number }
  | { ok: false; notFound: true }
> {
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(playerProfiles)
        .where(eq(playerProfiles.uid, params.uid))
        .limit(1);

      if (!current) {
        return { ok: false as const, notFound: true as const };
      }

      if (
        typeof params.expectedRevision === 'number' &&
        params.expectedRevision !== current.revision
      ) {
        return {
          ok: false as const,
          conflict: true as const,
          currentState: normalizeAndValidateGameState(
            current.gameStateJson,
            current.characterName
          ),
          currentRevision: current.revision,
        };
      }

      const validatedState = normalizeAndValidateGameState(
        params.incomingState,
        current.characterName
      );
      const nextRevision = current.revision + 1;
      const now = new Date();

      await tx
        .update(playerProfiles)
        .set({
          characterName: validatedState.player.name,
          level: validatedState.player.level,
          totalExp: validatedState.player.totalExp,
          archetype: validatedState.player.archetype,
          equippedTitleId: validatedState.player.equippedTitleId,
          equippedCosmeticId: validatedState.player.equippedCosmeticId,
          equippedPortraitId: validatedState.player.equippedPortraitId,
          revision: nextRevision,
          gameStateJson: validatedState,
          updatedAt: now,
        })
        .where(eq(playerProfiles.uid, params.uid));

      await tx
        .update(users)
        .set({
          username: validatedState.player.name,
          updatedAt: now,
        })
        .where(eq(users.uid, params.uid));

      return {
        ok: true as const,
        state: validatedState,
        revision: nextRevision,
      };
    });
  } catch (err) {
    handleDbError('savePlayerState', err);
  }
}

export async function updateUsernameRecord(params: {
  uid: string;
  username: string;
}): Promise<{ username: string; state?: GameState; revision?: number }> {
  try {
    return await db.transaction(async (tx) => {
      const cleanName = sanitizeCharacterName(params.username);
      const now = new Date();

      await tx
        .update(users)
        .set({ username: cleanName, updatedAt: now })
        .where(eq(users.uid, params.uid));

      const [profile] = await tx
        .select()
        .from(playerProfiles)
        .where(eq(playerProfiles.uid, params.uid))
        .limit(1);

      if (!profile) {
        return { username: cleanName };
      }

      const nextState = normalizeAndValidateGameState(
        {
          ...profile.gameStateJson,
          player: {
            ...profile.gameStateJson.player,
            name: cleanName,
          },
        },
        cleanName
      );
      const nextRevision = profile.revision + 1;

      await tx
        .update(playerProfiles)
        .set({
          characterName: cleanName,
          revision: nextRevision,
          gameStateJson: nextState,
          updatedAt: now,
        })
        .where(eq(playerProfiles.uid, params.uid));

      return { username: cleanName, state: nextState, revision: nextRevision };
    });
  } catch (err) {
    handleDbError('updateUsernameRecord', err);
  }
}

export async function deleteUserAccountData(uid: string): Promise<boolean> {
  try {
    const deleted = await db.delete(users).where(eq(users.uid, uid)).returning({ uid: users.uid });
    return deleted.length > 0;
  } catch (err) {
    handleDbError('deleteUserAccountData', err);
  }
}

export async function syncAITaskToDb(task: PendingTaskRecord): Promise<void> {
  try {
    const now = new Date();
    await db
      .insert(aiTasks)
      .values({
        id: task.id,
        userId: task.userId,
        taskType: task.taskType,
        priority: task.priority,
        idempotencyKey: task.idempotencyKey,
        status: task.status,
        attemptCount: task.attemptCount,
        maxAttempts: task.maxAttempts,
        payload: {
          originalInput: task.originalInput,
          context: task.context,
          modelsAttempted: task.modelsAttempted,
          failureReason: task.failureReason,
          result: task.result ?? null,
        },
        createdAt: new Date(task.createdAt),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: aiTasks.id,
        set: {
          status: task.status,
          attemptCount: task.attemptCount,
          maxAttempts: task.maxAttempts,
          payload: {
            originalInput: task.originalInput,
            context: task.context,
            modelsAttempted: task.modelsAttempted,
            failureReason: task.failureReason,
            result: task.result ?? null,
          },
          updatedAt: now,
        },
      });
  } catch (err) {
    // Non-fatal mirror to PostgreSQL when user record exists
    console.warn('[Chronicle DB] Non-fatal AI task sync notice:', err);
  }
}

export async function listUserAITasksFromDb(uid: string) {
  try {
    return await db
      .select()
      .from(aiTasks)
      .where(eq(aiTasks.userId, uid))
      .orderBy(desc(aiTasks.createdAt))
      .limit(100);
  } catch (err) {
    handleDbError('listUserAITasksFromDb', err);
  }
}

export async function recordAIUsageToDb(params: {
  userId: string;
  dailyDate: string;
  success: boolean;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}): Promise<void> {
  try {
    const now = new Date();
    await db
      .insert(aiUsageRecords)
      .values({
        userId: params.userId,
        dailyDate: params.dailyDate,
        requestCount: 1,
        successfulCount: params.success ? 1 : 0,
        failedCount: params.success ? 0 : 1,
        inputTokens: params.inputTokens ?? null,
        outputTokens: params.outputTokens ?? null,
        totalTokens: params.totalTokens ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [aiUsageRecords.userId, aiUsageRecords.dailyDate],
        set: {
          requestCount: sql`${aiUsageRecords.requestCount} + 1`,
          successfulCount: sql`${aiUsageRecords.successfulCount} + ${params.success ? 1 : 0}`,
          failedCount: sql`${aiUsageRecords.failedCount} + ${params.success ? 0 : 1}`,
          inputTokens:
            params.inputTokens != null
              ? sql`COALESCE(${aiUsageRecords.inputTokens}, 0) + ${params.inputTokens}`
              : aiUsageRecords.inputTokens,
          outputTokens:
            params.outputTokens != null
              ? sql`COALESCE(${aiUsageRecords.outputTokens}, 0) + ${params.outputTokens}`
              : aiUsageRecords.outputTokens,
          totalTokens:
            params.totalTokens != null
              ? sql`COALESCE(${aiUsageRecords.totalTokens}, 0) + ${params.totalTokens}`
              : aiUsageRecords.totalTokens,
          updatedAt: now,
        },
      });
  } catch (err) {
    console.warn('[Chronicle DB] Non-fatal AI usage sync notice:', err);
  }
}
