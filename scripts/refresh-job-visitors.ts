import { createClient } from 'redis';
import { refreshJobVisitors } from '../src/lib/job-visitors.js';

async function main() {
  const {
    JOBS_REDIS_URL,
    VERCEL_ANALYTICS_TOKEN,
    VERCEL_PROJECT_ID,
    VERCEL_TEAM_ID,
  } = process.env;
  if (
    !JOBS_REDIS_URL ||
    !VERCEL_ANALYTICS_TOKEN ||
    !VERCEL_PROJECT_ID ||
    !VERCEL_TEAM_ID
  ) {
    throw new Error('Missing Redis or Vercel Analytics configuration');
  }

  const redis = createClient({
    url: JOBS_REDIS_URL,
    socket: { connectTimeout: 2_000, reconnectStrategy: false },
    disableOfflineQueue: true,
  });
  redis.on('error', () => {});
  const deadline = setTimeout(() => {
    if (redis.isOpen) redis.destroy();
  }, 15_000);
  try {
    await redis.connect();
    const changed = await refreshJobVisitors(redis, {
      token: VERCEL_ANALYTICS_TOKEN,
      projectId: VERCEL_PROJECT_ID,
      teamId: VERCEL_TEAM_ID,
    });
    console.log(
      changed === null
        ? 'Skipped outdated visitor refresh'
        : `Changed visitor counts: ${changed}`,
    );
  } finally {
    clearTimeout(deadline);
    if (redis.isOpen) redis.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error &&
      /^(Missing Redis|Vercel Analytics returned|Invalid )/.test(error.message)
      ? error.message
      : 'Job analytics refresh failed',
  );
  process.exitCode = 1;
});
