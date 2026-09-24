import { buildApp } from './app.ts';
import { db, sqlClient } from './db/client.ts';

const app = await buildApp(db);
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

// Finish in-flight requests and close DB connections when Docker stops the container.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await sqlClient.end();
    process.exit(0);
  });
}
