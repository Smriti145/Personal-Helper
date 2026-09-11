import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('idx_users_email').on(table.email)],
);

export const profiles = sqliteTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  age: integer('age'),
  timezone: text('timezone').notNull().default('UTC'),
  dietaryStyle: text('dietary_style').notNull().default('unspecified'),
  exclusionsJson: text('exclusions_json').notNull().default('[]'),
  waterTargetMl: integer('water_target_ml').notNull().default(2000),
});

export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  dayType: text('day_type').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const routineTasks = sqliteTable('routine_tasks', {
  id: text('id').primaryKey(),
  routineId: text('routine_id')
    .notNull()
    .references(() => routines.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  title: text('title').notNull(),
  scheduledMinute: integer('scheduled_minute').notNull(),
  dependencyType: text('dependency_type'),
  dependencyTaskId: text('dependency_task_id'),
  offsetMinutes: integer('offset_minutes'),
  priority: integer('priority').notNull().default(2),
});

export const medications = sqliteTable('medications', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  dose: text('dose'),
  instructions: text('instructions').notNull(),
  frequency: text('frequency').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  prescriber: text('prescriber'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const taskLogs = sqliteTable('task_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  taskId: text('task_id'),
  medicationId: text('medication_id'),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }).notNull(),
  status: text('status').notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  missedReason: text('missed_reason'),
  note: text('note'),
});

export const dailyCheckins = sqliteTable(
  'daily_checkins',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    energy: integer('energy'),
    mood: integer('mood'),
    stress: integer('stress'),
    symptomsJson: text('symptoms_json').notNull().default('[]'),
    sleepMinutes: integer('sleep_minutes'),
    movementMinutes: integer('movement_minutes'),
    waterMl: integer('water_ml').notNull().default(0),
  },
  (table) => [
    uniqueIndex('idx_daily_checkins_user_date').on(table.userId, table.date),
  ],
);

export const reminderSettings = sqliteTable('reminder_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  quietStart: text('quiet_start').notNull().default('22:30'),
  quietEnd: text('quiet_end').notNull().default('05:30'),
  defaultSnoozeMinutes: integer('default_snooze_minutes').notNull().default(10),
  escalationEnabled: integer('escalation_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
});

export const routineStates = sqliteTable('routine_states', {
  userId: text('user_id').primaryKey(),
  stateJson: text('state_json').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    salt: text('salt').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('idx_accounts_email').on(t.email)],
);
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});
export const authAttempts = sqliteTable('auth_attempts', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull(),
  resetAt: integer('reset_at').notNull(),
});
