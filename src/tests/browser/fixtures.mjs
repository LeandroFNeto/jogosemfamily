import { test as base, expect } from '@playwright/test';
import { once } from 'node:events';
import { createApplication } from '../../backend/server.mjs';

export const test = base.extend({
  application: async ({}, use) => {
    const app = createApplication({
      databasePath: ':memory:',
      publicOrigin: '',
    });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    try {
      await use(`http://127.0.0.1:${app.server.address().port}`);
    } finally {
      await app.stop();
    }
  },
  baseURL: async ({ application }, use) => use(application),
});

export { expect };
