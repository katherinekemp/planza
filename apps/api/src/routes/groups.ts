import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createGroupSchema,
  updateGroupSchema,
  type Group,
  type GroupMember,
  type Role,
} from '@planza/shared';
import type { Db } from '../db/client.ts';
import { groupMembers, groups, users } from '../db/schema.ts';
import { forbidden, HttpError, notFound } from '../errors.ts';
import { isAdmin, requireAdmin, requireMembership } from '../permissions.ts';

const groupParams = z.object({ groupId: z.uuid() });
const memberParams = z.object({ groupId: z.uuid(), userId: z.uuid() });

const memberCount = sql<number>`(select count(*)::int from group_members gm where gm.group_id = ${groups.id})`;

function toGroup(g: typeof groups.$inferSelect, myRole: Role, count: number): Group {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    whoCanPost: g.whoCanPost,
    whoCanInvite: g.whoCanInvite,
    myRole,
    memberCount: count,
    createdAt: g.createdAt.toISOString(),
  };
}

export const groupRoutes =
  (db: Db): FastifyPluginAsyncZod =>
  async (app) => {
    app.get('/groups', async (req) => {
      const rows = await db
        .select({ group: groups, role: groupMembers.role, count: memberCount })
        .from(groups)
        .innerJoin(
          groupMembers,
          and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, req.user.id)),
        )
        .orderBy(groups.name);
      return rows.map((r) => toGroup(r.group, r.role, r.count));
    });

    app.post('/groups', { schema: { body: createGroupSchema } }, async (req, reply) => {
      const group = await db.transaction(async (tx) => {
        const [g] = await tx
          .insert(groups)
          .values({ ...req.body, createdBy: req.user.id })
          .returning();
        await tx
          .insert(groupMembers)
          .values({ groupId: g!.id, userId: req.user.id, role: 'owner' });
        return g!;
      });
      reply.code(201);
      return toGroup(group, 'owner', 1);
    });

    app.get('/groups/:groupId', { schema: { params: groupParams } }, async (req) => {
      const { group, role } = await requireMembership(db, req.params.groupId, req.user.id);
      const [{ count }] = (await db
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, group.id))) as [{ count: number }];
      return toGroup(group, role, count);
    });

    app.patch(
      '/groups/:groupId',
      { schema: { params: groupParams, body: updateGroupSchema } },
      async (req) => {
        const { role } = await requireAdmin(db, req.params.groupId, req.user.id);
        const [updated] = await db
          .update(groups)
          .set(req.body)
          .where(eq(groups.id, req.params.groupId))
          .returning();
        const [{ count }] = (await db
          .select({ count: sql<number>`count(*)::int` })
          .from(groupMembers)
          .where(eq(groupMembers.groupId, req.params.groupId))) as [{ count: number }];
        return toGroup(updated!, role, count);
      },
    );

    app.delete('/groups/:groupId', { schema: { params: groupParams } }, async (req, reply) => {
      const { role } = await requireMembership(db, req.params.groupId, req.user.id);
      if (role !== 'owner') throw forbidden('Only the owner can delete a group');
      await db.delete(groups).where(eq(groups.id, req.params.groupId));
      reply.code(204);
    });

    app.get('/groups/:groupId/members', { schema: { params: groupParams } }, async (req) => {
      await requireMembership(db, req.params.groupId, req.user.id);
      const rows = await db
        .select({
          userId: groupMembers.userId,
          displayName: users.displayName,
          role: groupMembers.role,
          joinedAt: groupMembers.joinedAt,
        })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(eq(groupMembers.groupId, req.params.groupId))
        .orderBy(groupMembers.joinedAt);
      return rows.map((r): GroupMember => ({ ...r, joinedAt: r.joinedAt.toISOString() }));
    });

    app.patch(
      '/groups/:groupId/members/:userId',
      { schema: { params: memberParams, body: z.object({ role: z.enum(['admin', 'member']) }) } },
      async (req, reply) => {
        const { role } = await requireMembership(db, req.params.groupId, req.user.id);
        if (role !== 'owner') throw forbidden('Only the owner can change roles');
        if (req.params.userId === req.user.id)
          throw new HttpError(400, "You can't change your own role");
        const result = await db
          .update(groupMembers)
          .set({ role: req.body.role })
          .where(
            and(
              eq(groupMembers.groupId, req.params.groupId),
              eq(groupMembers.userId, req.params.userId),
            ),
          )
          .returning();
        if (result.length === 0) throw notFound('Member not found');
        reply.code(204);
      },
    );

    // Leave a group (your own user ID) or remove someone (admins only).
    app.delete(
      '/groups/:groupId/members/:userId',
      { schema: { params: memberParams } },
      async (req, reply) => {
        const { groupId, userId } = req.params;
        const { role } = await requireMembership(db, groupId, req.user.id);
        const leaving = userId === req.user.id;
        if (leaving && role === 'owner') {
          throw new HttpError(400, 'The owner cannot leave; delete the group instead');
        }
        if (!leaving) {
          if (!isAdmin(role)) throw forbidden('Only admins can remove members');
          const target = await requireMembership(db, groupId, userId).catch(() => null);
          if (!target) throw notFound('Member not found');
          if (target.role === 'owner') throw forbidden('The owner cannot be removed');
        }
        await db
          .delete(groupMembers)
          .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
        reply.code(204);
      },
    );
  };
