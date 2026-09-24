import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createPlanSchema, respondSchema, updatePlanSchema, type Plan } from '@planza/shared';
import type { Db } from '../db/client.ts';
import { groupMembers, groups, planResponses, plans, users } from '../db/schema.ts';
import { forbidden, notFound } from '../errors.ts';
import { allows, isAdmin, requireMembership } from '../permissions.ts';

const planParams = z.object({ planId: z.uuid() });
const groupParams = z.object({ groupId: z.uuid() });

// A plan stays "upcoming" for a few hours after it starts, so tonight's dinner doesn't vanish at 7:01.
const upcomingCutoff = sql`now() - interval '6 hours'`;

type Order = SQL | SQL[];

/** Loads plans matching `where`, with author, group name, and everyone's responses. */
async function loadPlans(
  db: Db,
  userId: string,
  where: SQL | undefined,
  order: Order,
  limit = 100,
) {
  const rows = await db
    .select({ plan: plans, authorName: users.displayName, groupName: groups.name })
    .from(plans)
    .innerJoin(users, eq(users.id, plans.authorId))
    .innerJoin(groups, eq(groups.id, plans.groupId))
    .where(where)
    .orderBy(...(Array.isArray(order) ? order : [order]))
    .limit(limit);

  const ids = rows.map((r) => r.plan.id);
  const responses = ids.length
    ? await db
        .select({
          planId: planResponses.planId,
          userId: planResponses.userId,
          response: planResponses.response,
          displayName: users.displayName,
        })
        .from(planResponses)
        .innerJoin(users, eq(users.id, planResponses.userId))
        .where(inArray(planResponses.planId, ids))
        .orderBy(planResponses.updatedAt)
    : [];

  return rows.map(({ plan, authorName, groupName }): Plan => {
    const mine = responses.filter((r) => r.planId === plan.id);
    return {
      id: plan.id,
      groupId: plan.groupId,
      groupName,
      author: { id: plan.authorId, displayName: authorName },
      title: plan.title,
      description: plan.description,
      location: plan.location,
      startsAt: plan.startsAt?.toISOString() ?? null,
      createdAt: plan.createdAt.toISOString(),
      responses: mine.map(({ userId, displayName, response }) => ({
        userId,
        displayName,
        response,
      })),
      myResponse: mine.find((r) => r.userId === userId)?.response ?? null,
    };
  });
}

// Converts the API's ISO string (or null = "make it an idea") into a Date for the database.
const toDate = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Date(v);

export const planRoutes =
  (db: Db): FastifyPluginAsyncZod =>
  async (app) => {
    async function loadPlanForMember(planId: string, userId: string) {
      const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
      if (!plan) throw notFound('Plan not found');
      const membership = await requireMembership(db, plan.groupId, userId).catch(() => {
        throw notFound('Plan not found');
      });
      return { plan, role: membership.role };
    }

    // Upcoming plans across every group I'm in.
    app.get('/feed', async (req) => {
      const myGroups = db
        .select({ id: groupMembers.groupId })
        .from(groupMembers)
        .where(eq(groupMembers.userId, req.user.id));
      return loadPlans(
        db,
        req.user.id,
        and(inArray(plans.groupId, myGroups), gte(plans.startsAt, upcomingCutoff)),
        asc(plans.startsAt),
        50,
      );
    });

    app.get(
      '/groups/:groupId/plans',
      {
        schema: {
          params: groupParams,
          querystring: z.object({
            when: z.enum(['upcoming', 'ideas', 'past']).default('upcoming'),
          }),
        },
      },
      async (req) => {
        const { group } = await requireMembership(db, req.params.groupId, req.user.id);
        const inGroup = eq(plans.groupId, group.id);
        switch (req.query.when) {
          case 'ideas':
            return loadPlans(
              db,
              req.user.id,
              and(inGroup, isNull(plans.startsAt)),
              desc(plans.createdAt),
            );
          case 'past':
            return loadPlans(
              db,
              req.user.id,
              and(inGroup, isNotNull(plans.startsAt), lt(plans.startsAt, upcomingCutoff)),
              desc(plans.startsAt),
              50,
            );
          default:
            return loadPlans(
              db,
              req.user.id,
              and(inGroup, gte(plans.startsAt, upcomingCutoff)),
              asc(plans.startsAt),
            );
        }
      },
    );

    app.post(
      '/groups/:groupId/plans',
      { schema: { params: groupParams, body: createPlanSchema } },
      async (req, reply) => {
        const { group, role } = await requireMembership(db, req.params.groupId, req.user.id);
        if (!allows(group.whoCanPost, role)) throw forbidden('Only admins can post in this group');
        const { startsAt, ...rest } = req.body;
        const [plan] = await db
          .insert(plans)
          .values({ ...rest, startsAt: toDate(startsAt), groupId: group.id, authorId: req.user.id })
          .returning();
        reply.code(201);
        const [created] = await loadPlans(db, req.user.id, eq(plans.id, plan!.id), asc(plans.id));
        return created!;
      },
    );

    app.get('/plans/:planId', { schema: { params: planParams } }, async (req) => {
      const { plan } = await loadPlanForMember(req.params.planId, req.user.id);
      const [loaded] = await loadPlans(db, req.user.id, eq(plans.id, plan.id), asc(plans.id));
      return loaded!;
    });

    app.patch(
      '/plans/:planId',
      { schema: { params: planParams, body: updatePlanSchema } },
      async (req) => {
        const { plan, role } = await loadPlanForMember(req.params.planId, req.user.id);
        if (plan.authorId !== req.user.id && !isAdmin(role)) {
          throw forbidden('Only the author or a group admin can edit this plan');
        }
        const { startsAt, ...rest } = req.body;
        await db
          .update(plans)
          .set({ ...rest, startsAt: toDate(startsAt) })
          .where(eq(plans.id, plan.id));
        const [loaded] = await loadPlans(db, req.user.id, eq(plans.id, plan.id), asc(plans.id));
        return loaded!;
      },
    );

    app.delete('/plans/:planId', { schema: { params: planParams } }, async (req, reply) => {
      const { plan, role } = await loadPlanForMember(req.params.planId, req.user.id);
      if (plan.authorId !== req.user.id && !isAdmin(role)) {
        throw forbidden('Only the author or a group admin can delete this plan');
      }
      await db.delete(plans).where(eq(plans.id, plan.id));
      reply.code(204);
    });

    // PUT because setting your response is idempotent: sending "going" twice is the same as once.
    app.put(
      '/plans/:planId/response',
      { schema: { params: planParams, body: respondSchema } },
      async (req, reply) => {
        const { plan } = await loadPlanForMember(req.params.planId, req.user.id);
        await db
          .insert(planResponses)
          .values({ planId: plan.id, userId: req.user.id, response: req.body.response })
          .onConflictDoUpdate({
            target: [planResponses.planId, planResponses.userId],
            set: { response: req.body.response, updatedAt: new Date() },
          });
        reply.code(204);
      },
    );

    app.delete(
      '/plans/:planId/response',
      { schema: { params: planParams } },
      async (req, reply) => {
        const { plan } = await loadPlanForMember(req.params.planId, req.user.id);
        await db
          .delete(planResponses)
          .where(and(eq(planResponses.planId, plan.id), eq(planResponses.userId, req.user.id)));
        reply.code(204);
      },
    );
  };
