import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Invite, InvitePreview } from '@planza/shared';
import type { Db } from '../db/client.ts';
import { groupInvites, groupMembers, groups } from '../db/schema.ts';
import { forbidden, notFound } from '../errors.ts';
import { allows, requireMembership } from '../permissions.ts';

const INVITE_TTL_DAYS = 14;

const toInvite = (i: typeof groupInvites.$inferSelect): Invite => ({
  id: i.id,
  token: i.token,
  expiresAt: i.expiresAt.toISOString(),
});

export const inviteRoutes =
  (db: Db): FastifyPluginAsyncZod =>
  async (app) => {
    // Loads an invite only if it is still usable.
    async function findActiveInvite(token: string) {
      const [row] = await db
        .select({ invite: groupInvites, group: groups })
        .from(groupInvites)
        .innerJoin(groups, eq(groups.id, groupInvites.groupId))
        .where(
          and(
            eq(groupInvites.token, token),
            isNull(groupInvites.revokedAt),
            gt(groupInvites.expiresAt, sql`now()`),
          ),
        );
      if (!row) throw notFound('This invite link is invalid or has expired');
      return row;
    }

    app.post(
      '/groups/:groupId/invites',
      { schema: { params: z.object({ groupId: z.uuid() }) } },
      async (req, reply) => {
        const { group, role } = await requireMembership(db, req.params.groupId, req.user.id);
        if (!allows(group.whoCanInvite, role)) throw forbidden('Only admins can invite people');
        const [invite] = await db
          .insert(groupInvites)
          .values({
            groupId: group.id,
            createdBy: req.user.id,
            // 18 random bytes = 144 bits, far too many to guess.
            token: randomBytes(18).toString('base64url'),
            expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
          })
          .returning();
        reply.code(201);
        return toInvite(invite!);
      },
    );

    app.delete(
      '/invites/:inviteId',
      { schema: { params: z.object({ inviteId: z.uuid() }) } },
      async (req, reply) => {
        const invite = await db.query.groupInvites.findFirst({
          where: eq(groupInvites.id, req.params.inviteId),
        });
        if (!invite) throw notFound('Invite not found');
        const { role } = await requireMembership(db, invite.groupId, req.user.id);
        if (invite.createdBy !== req.user.id && role === 'member') {
          throw forbidden('Only admins or the creator can revoke an invite');
        }
        await db
          .update(groupInvites)
          .set({ revokedAt: new Date() })
          .where(eq(groupInvites.id, invite.id));
        reply.code(204);
      },
    );

    app.get(
      '/invites/:token',
      { schema: { params: z.object({ token: z.string().max(64) }) } },
      async (req): Promise<InvitePreview> => {
        const { group } = await findActiveInvite(req.params.token);
        const members = await db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(eq(groupMembers.groupId, group.id));
        return {
          groupId: group.id,
          groupName: group.name,
          memberCount: members.length,
          alreadyMember: members.some((m) => m.userId === req.user.id),
        };
      },
    );

    app.post(
      '/invites/:token/accept',
      { schema: { params: z.object({ token: z.string().max(64) }) } },
      async (req) => {
        const { group } = await findActiveInvite(req.params.token);
        // Accepting twice is harmless: the primary key on (group_id, user_id) prevents duplicates.
        await db
          .insert(groupMembers)
          .values({ groupId: group.id, userId: req.user.id, role: 'member' })
          .onConflictDoNothing();
        return { groupId: group.id };
      },
    );
  };
