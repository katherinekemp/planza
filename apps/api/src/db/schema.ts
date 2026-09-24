import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PERMISSION_LEVELS, RESPONSES, ROLES } from '@planza/shared';

export const roleEnum = pgEnum('group_role', ROLES);
export const permissionEnum = pgEnum('permission_level', PERMISSION_LEVELS);
export const responseEnum = pgEnum('plan_response', RESPONSES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Stable ID from the auth provider (Cognito "sub" claim, or "dev:<email>" locally).
  authSubject: text('auth_subject').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  ...timestamps,
});

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  whoCanPost: permissionEnum('who_can_post').notNull().default('all_members'),
  whoCanInvite: permissionEnum('who_can_invite').notNull().default('all_members'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    // "Which groups am I in?" is the most common lookup.
    index('group_members_user_idx').on(t.userId),
  ],
);

export const groupInvites = pgTable('group_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  // Unguessable random string that appears in the invite URL.
  token: text('token').notNull().unique(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    // NULL means this is an idea without a date yet.
    startsAt: timestamp('starts_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // Serves "upcoming plans in this group" (ordered by date) and "ideas" (starts_at IS NULL).
    index('plans_group_starts_idx').on(t.groupId, t.startsAt),
  ],
);

export const planResponses = pgTable(
  'plan_responses',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    response: responseEnum('response').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.planId, t.userId] })],
);
