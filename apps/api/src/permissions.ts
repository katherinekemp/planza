import { and, eq } from 'drizzle-orm';
import type { PermissionLevel, Role } from '@planza/shared';
import type { Db } from './db/client.ts';
import { groupMembers, groups } from './db/schema.ts';
import { forbidden, notFound } from './errors.ts';

export const isAdmin = (role: Role) => role === 'owner' || role === 'admin';

export const allows = (level: PermissionLevel, role: Role) =>
  level === 'all_members' || isAdmin(role);

/**
 * Loads a group the user belongs to. Non-members get a 404 (not a 403) so that
 * group IDs can't be probed to learn whether a private group exists.
 */
export async function requireMembership(db: Db, groupId: string, userId: string) {
  const [row] = await db
    .select({ group: groups, role: groupMembers.role })
    .from(groups)
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, userId)),
    )
    .where(eq(groups.id, groupId));
  if (!row) throw notFound('Group not found');
  return row;
}

export async function requireAdmin(db: Db, groupId: string, userId: string) {
  const membership = await requireMembership(db, groupId, userId);
  if (!isAdmin(membership.role)) throw forbidden('Only group admins can do that');
  return membership;
}
