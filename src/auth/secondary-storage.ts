import { clearTimeout, setTimeout } from 'node:timers';
import type { BetterAuthOptions } from 'better-auth';
import { createClient } from 'redis';

export const AUTH_REDIS_KEY_PREFIX = 'hodivo:auth:v1:';
const COMMAND_TIMEOUT_MS = 500;
const INCREMENT_WITH_TTL_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

export type AuthSecondaryStorage = NonNullable<
  BetterAuthOptions['secondaryStorage']
> & {
  close: () => void;
};

async function withDeadline<T>(command: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      command,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Auth session Redis command timed out.')),
          COMMAND_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createAuthSecondaryStorage(url: string): AuthSecondaryStorage {
  const redis = createClient({
    url,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 256,
    socket: { connectTimeout: COMMAND_TIMEOUT_MS },
  });

  // Settle initial connect on ready, first error, or timeout so cold-start checks
  // succeed quickly when Redis is up and fail closed quickly when it is down.
  let initialSettled = false;
  let resolveInitial = () => {};
  const initialConnect = new Promise<void>((resolve) => {
    resolveInitial = () => {
      if (initialSettled) return;
      initialSettled = true;
      resolve();
    };
  });
  const initialTimer = setTimeout(resolveInitial, COMMAND_TIMEOUT_MS);
  initialTimer.unref();

  redis.on('ready', () => {
    clearTimeout(initialTimer);
    resolveInitial();
  });
  redis.on('error', () => {
    clearTimeout(initialTimer);
    resolveInitial();
  });
  void redis.connect().catch(() => {
    clearTimeout(initialTimer);
    resolveInitial();
  });

  const prefixed = (key: string) => `${AUTH_REDIS_KEY_PREFIX}${key}`;

  async function run<T>(execute: () => Promise<T>): Promise<T> {
    if (!redis.isReady && !initialSettled) {
      await initialConnect;
    }
    if (!redis.isReady) {
      throw new Error('Auth session Redis is unavailable.');
    }
    return withDeadline(execute());
  }

  return {
    async get(key) {
      const value = await run(() => redis.get(prefixed(key)));
      return value ?? null;
    },
    async getAndDelete(key) {
      const value = await run(() => redis.getDel(prefixed(key)));
      return value ?? null;
    },
    async increment(key, ttl) {
      if (!Number.isFinite(ttl)) {
        throw new Error('Invalid auth counter TTL.');
      }
      const seconds = Math.ceil(ttl);
      if (seconds <= 0) {
        await run(() => redis.del(prefixed(key)));
        return 1;
      }
      const count = await run(() =>
        redis.eval(INCREMENT_WITH_TTL_LUA, {
          keys: [prefixed(key)],
          arguments: [String(seconds)],
        }),
      );
      return Number(count);
    },
    async set(key, value, ttl) {
      const redisKey = prefixed(key);
      if (ttl === undefined) {
        await run(() => redis.set(redisKey, value));
        return;
      }
      if (!Number.isFinite(ttl)) {
        throw new Error('Invalid auth session TTL.');
      }
      const seconds = Math.ceil(ttl);
      if (seconds <= 0) {
        await run(() => redis.del(redisKey));
        return;
      }
      await run(() =>
        redis.set(redisKey, value, {
          expiration: { type: 'EX', value: seconds },
        }),
      );
    },
    async delete(key) {
      await run(() => redis.del(prefixed(key)));
    },
    close() {
      clearTimeout(initialTimer);
      resolveInitial();
      if (redis.isOpen) redis.destroy();
    },
  };
}
