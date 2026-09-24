import cors from '@fastify/cors';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { registerAuth } from './auth.ts';
import type { Db } from './db/client.ts';
import { HttpError } from './errors.ts';
import { groupRoutes } from './routes/groups.ts';
import { inviteRoutes } from './routes/invites.ts';
import { meRoutes } from './routes/me.ts';
import { planRoutes } from './routes/plans.ts';

export async function buildApp(db: Db, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? true }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      // Fastify's own client errors, including request validation failures.
      return reply.code(status).send({ error: (err as Error).message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong' });
  });

  // Used by Docker and the load balancer/uptime checks. Deliberately unauthenticated.
  app.get('/health', async () => {
    await db.execute('select 1');
    return { ok: true };
  });

  // Everything under /v1 requires a logged-in user.
  await app.register(
    async (v1) => {
      registerAuth(v1, db);
      await v1.register(meRoutes(db));
      await v1.register(groupRoutes(db));
      await v1.register(inviteRoutes(db));
      await v1.register(planRoutes(db));
    },
    { prefix: '/v1' },
  );

  return app;
}
