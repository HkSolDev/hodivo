import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { prismaRead } from '../src/db.js';

// Run against live slave-db with Neon unreachable:
//   DATABASE_URL=postgresql://aptus:aptus@127.0.0.1:1/dead \
//   SLAVE_DATABASE_URL=postgresql://aptus:aptus@127.0.0.1:5433/aptus_slave \
//   node --import ./tests/css-module-hook.mjs --import tsx --test scripts/zero-neon-reads.test.ts
const hasSlaveEnv = Boolean(process.env.SLAVE_DATABASE_URL?.trim());

test(
  'public jobs and typing routes succeed from slave-db even when Neon (DATABASE_URL) is unreachable',
  { skip: !hasSlaveEnv },
  async () => {
    const app = buildApp();
    try {
      const jobsRes = await app.inject({ method: 'GET', url: '/api/jobs' });
      assert.equal(jobsRes.statusCode, 200);
      const jobsBody = jobsRes.json() as { data: { id: string }[] };
      assert.ok(jobsBody.data.length > 0);

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/jobs/${jobsBody.data[0].id}`,
      });
      assert.equal(detailRes.statusCode, 200);

      const practiceRes = await app.inject({
        method: 'GET',
        url: '/api/typing/practice-passages',
      });
      assert.equal(practiceRes.statusCode, 200);

      const examsRes = await app.inject({
        method: 'GET',
        url: '/api/typing/exams',
      });
      assert.equal(examsRes.statusCode, 200);
    } finally {
      await app.close();
      await prismaRead.$disconnect();
    }
  },
);
