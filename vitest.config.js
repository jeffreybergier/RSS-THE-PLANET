import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
    define: {
      'GLOBAL_E2E_FULL_SUITE': process.env.E2E_FULL_SUITE === 'true' ? 'true' : 'false',
    },
  },
});
