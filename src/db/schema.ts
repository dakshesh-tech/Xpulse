import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { GameState } from '../types/rpg.ts';

export const users = pgTable('users', {
  uid: text('uid').primaryKey(),
  email: text('email').notNull(),
  username: text('username').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const playerProfiles = pgTable('player_profiles', {
  uid: text('uid')
    .primaryKey()
    .references(() => users.uid, { onDelete: 'cascade' }),
  characterName: text('character_name').notNull(),
  level: integer('level').notNull().default(1),
  totalExp: integer('total_exp').notNull().default(0),
  archetype: text('archetype').notNull().default('Wanderer'),
  equippedTitleId: text('equipped_title_id').notNull(),
  equippedCosmeticId: text('equipped_cosmetic_id').notNull(),
  equippedPortraitId: text('equipped_portrait_id').notNull(),
  revision: integer('revision').notNull().default(1),
  gameStateJson: jsonb('game_state_json').$type<GameState>().notNull(),
  migratedFromLegacy: boolean('migrated_from_legacy').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiTasks = pgTable('ai_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  taskType: text('task_type').notNull(),
  priority: integer('priority').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(6),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiUsageRecords = pgTable(
  'ai_usage_records',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    dailyDate: text('daily_date').notNull(),
    requestCount: integer('request_count').notNull().default(0),
    successfulCount: integer('successful_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.dailyDate] })]
);

export const legacyMigrationClaims = pgTable('legacy_migration_claims', {
  claimKey: text('claim_key').primaryKey(),
  claimedByUid: text('claimed_by_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  claimedAt: timestamp('claimed_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(playerProfiles, {
    fields: [users.uid],
    references: [playerProfiles.uid],
  }),
  aiTasks: many(aiTasks),
  aiUsageRecords: many(aiUsageRecords),
}));

export const playerProfilesRelations = relations(playerProfiles, ({ one }) => ({
  user: one(users, {
    fields: [playerProfiles.uid],
    references: [users.uid],
  }),
}));

export const aiTasksRelations = relations(aiTasks, ({ one }) => ({
  user: one(users, {
    fields: [aiTasks.userId],
    references: [users.uid],
  }),
}));

export const aiUsageRecordsRelations = relations(aiUsageRecords, ({ one }) => ({
  user: one(users, {
    fields: [aiUsageRecords.userId],
    references: [users.uid],
  }),
}));
