import type { createClient } from 'redis';
import { isSafeJobId } from '../../frontend/job-id.js';

export const JOB_VISITORS_KEY = 'hodivo:jobs:visitors:v1';
const MAX_AGE_MS = 3_600_000;

const applySnapshot = `
local current = redis.call('HGET', KEYS[1], '_startedAt')
if current and tonumber(current) >= tonumber(ARGV[1]) then return nil end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if now - tonumber(ARGV[1]) >= tonumber(ARGV[4]) then return nil end
local incoming = cjson.decode(ARGV[2])
local changed = 0
for id, value in pairs(incoming) do
  if redis.call('HGET', KEYS[1], id) ~= value then
    redis.call('HSET', KEYS[1], id, value)
    changed = changed + 1
  end
end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if id ~= '_startedAt' and id ~= '_refreshedAt' and id ~= '_revision' and incoming[id] == nil then
    redis.call('HDEL', KEYS[1], id)
    changed = changed + 1
  end
end
if not current or changed > 0 then
  redis.call('HSET', KEYS[1], '_revision', ARGV[3])
end
redis.call('HSET', KEYS[1], '_startedAt', ARGV[1], '_refreshedAt', string.format('%.0f', now))
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return changed
`;

type VisitorRedis = Pick<ReturnType<typeof createClient>, 'eval'>;

export async function refreshJobVisitors(
  redis: VisitorRedis,
  config: { token: string; teamId: string; projectId: string },
  request = fetch,
) {
  const startedAt = Date.now();
  const query = new URLSearchParams({
    teamId: config.teamId,
    projectId: config.projectId,
    by: 'requestPath',
    since: new Date(startedAt - 7 * 86_400_000).toISOString(),
    until: new Date(startedAt).toISOString(),
    filter: "startswith(requestPath,'/jobs/')",
    limit: '100',
  });
  const response = await request(
    `https://api.vercel.com/v1/query/web-analytics/visits/aggregate?${query}`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    throw new Error(`Vercel Analytics returned HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('data' in result) ||
    !Array.isArray(result.data)
  ) {
    throw new Error('Invalid Analytics response');
  }

  const counts = new Map<string, string>();
  const rows: unknown[] = result.data;
  for (const row of rows) {
    if (
      !row ||
      typeof row !== 'object' ||
      !('requestPath' in row) ||
      typeof row.requestPath !== 'string' ||
      /^others$/i.test(row.requestPath)
    ) {
      throw new Error('Invalid or incomplete Analytics response');
    }
    const id = /^\/jobs\/([^/]+)$/.exec(row.requestPath)?.[1];
    if (!id || id !== id.trim() || !isSafeJobId(id)) continue;
    if (
      ['_startedAt', '_refreshedAt', '_revision'].includes(id) ||
      !('visitors' in row) ||
      typeof row.visitors !== 'number' ||
      !Number.isSafeInteger(row.visitors) ||
      row.visitors < 0 ||
      counts.has(id)
    ) {
      throw new Error('Invalid visitor count or duplicate job path');
    }
    counts.set(id, String(row.visitors));
  }

  return redis.eval(applySnapshot, {
    keys: [JOB_VISITORS_KEY],
    arguments: [
      String(startedAt),
      JSON.stringify(Object.fromEntries(counts)),
      crypto.randomUUID(),
      String(MAX_AGE_MS),
    ],
  });
}

export function readJobVisitors(fields: Record<string, string>, now: number) {
  const { _startedAt, _refreshedAt, _revision, ...scores } = fields;
  const refreshedAt = Number(_refreshedAt);
  if (
    !_revision ||
    !Number.isFinite(refreshedAt) ||
    now - refreshedAt >= MAX_AGE_MS
  ) {
    return undefined;
  }
  const counts = new Map<string, number>();
  for (const [id, value] of Object.entries(scores)) {
    const count = Number(value);
    if (Number.isSafeInteger(count) && count > 0) counts.set(id, count);
  }
  return { revision: _revision, counts };
}
