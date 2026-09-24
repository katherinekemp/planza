import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from './db/client.ts';
import { users } from './db/schema.ts';
import { HttpError } from './errors.ts';

export type UserRow = typeof users.$inferSelect;

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow;
  }
}

interface Identity {
  subject: string;
  email: string;
}

type VerifyToken = (token: string) => Promise<Identity>;

function createVerifier(): VerifyToken {
  const mode = process.env.AUTH_MODE ?? 'cognito';

  if (mode === 'dev') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_MODE=dev must never be used in production');
    }
    // Local development only: the "token" is just `dev:<email>`.
    return async (token) => {
      const email = token.startsWith('dev:') ? token.slice(4).trim().toLowerCase() : '';
      if (!email.includes('@')) throw new HttpError(401, 'Invalid dev token');
      return { subject: `dev:${email}`, email };
    };
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    throw new Error(
      'COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required when AUTH_MODE=cognito',
    );
  }
  // Verifies the signature against Cognito's public keys (fetched once and cached),
  // plus expiry, issuer, and audience.
  const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id' });
  return async (token) => {
    try {
      const payload = await verifier.verify(token);
      return { subject: payload.sub, email: String(payload.email) };
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }
  };
}

async function findOrCreateUser(db: Db, identity: Identity): Promise<UserRow> {
  const existing = await db.query.users.findFirst({
    where: eq(users.authSubject, identity.subject),
  });
  if (existing) return existing;

  await db
    .insert(users)
    .values({
      authSubject: identity.subject,
      email: identity.email,
      displayName: identity.email.split('@')[0] ?? identity.email,
    })
    .onConflictDoNothing(); // Two simultaneous first requests shouldn't crash.
  const created = await db.query.users.findFirst({
    where: eq(users.authSubject, identity.subject),
  });
  if (!created) throw new Error('Failed to create user');
  return created;
}

/** Adds an onRequest hook that requires a valid bearer token and sets `request.user`. */
export function registerAuth(app: FastifyInstance, db: Db) {
  const verify = createVerifier();
  app.decorateRequest('user', null as unknown as UserRow);
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Missing bearer token');
    const identity = await verify(header.slice('Bearer '.length));
    request.user = await findOrCreateUser(db, identity);
  });
}
