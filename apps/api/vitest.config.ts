import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    env: {
      DATABASE_URL: 'postgres://planza:planza@localhost:5432/planza_test',
      AUTH_MODE: 'dev',
    },
  },
});
