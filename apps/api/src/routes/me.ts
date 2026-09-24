import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { updateMeSchema, type User } from '@planza/shared';
import type { Db } from '../db/client.ts';
import { users } from '../db/schema.ts';

const toUser = (u: typeof users.$inferSelect): User => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
});

export const meRoutes =
  (db: Db): FastifyPluginAsyncZod =>
  async (app) => {
    app.get('/me', async (req) => toUser(req.user));

    app.patch('/me', { schema: { body: updateMeSchema } }, async (req) => {
      const [updated] = await db
        .update(users)
        .set({ displayName: req.body.displayName })
        .where(eq(users.id, req.user.id))
        .returning();
      return toUser(updated!);
    });
  };
