import { Redis } from 'ioredis';
import { config } from '../config/index.js';

export const redis = new Redis(config.REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
});

redis.on('error',   (err) => console.error('[Redis] error:', err.message));
redis.on('connect', ()    => console.log('[Redis] connected'));

// ── helpers ──────────────────────────────────────────────────────────

/** Active conversation for a user */
export const getActiveConv = (uid) =>
  redis.get(`u:${uid}:conv`).then(v => v ? parseInt(v) : null);

export const setActiveConv = async (uid, convId) => {
  if (convId == null) return redis.del(`u:${uid}:conv`);
  return redis.set(`u:${uid}:conv`, convId, 'EX', 86400);
};

/** Page cursor for dialog list */
export const getPage = (uid) =>
  redis.get(`u:${uid}:page`).then(v => v ? parseInt(v) : 0);

export const setPage = (uid, page) =>
  redis.set(`u:${uid}:page`, page, 'EX', 3600);

/** Processing lock — prevent double requests */
export const isProcessing = (uid) => redis.exists(`u:${uid}:busy`);

export const setProcessing = (uid, busy) =>
  busy
    ? redis.set(`u:${uid}:busy`, '1', 'EX', config.PROCESSING_TTL)
    : redis.del(`u:${uid}:busy`);

export const getUserModel = (uid) =>
  redis.get(`u:${uid}:model`).then(v => v || 'gpt-4o');

export const setUserModel = (uid, model) =>
  redis.set(`u:${uid}:model`, model, 'EX', 2592000);

export const getWebSearch = (uid) =>
  redis.get(`u:${uid}:websearch`).then(v => v === '1');

export const toggleWebSearch = async (uid) => {
  const current = await getWebSearch(uid);
  await redis.set(`u:${uid}:websearch`, current ? '0' : '1', 'EX', 86400);
  return !current;
};

export const getThinkingLevel = async (uid) => {
  const val = await redis.get(`think:${uid}`);
  return val || 'none';
};

export const setThinkingLevel = (uid, level) =>
  redis.set(`think:${uid}`, level, 'EX', 60 * 60 * 24 * 30);

export const nextThinkingLevel = (current) => {
  const levels = ['none', 'low', 'medium', 'high', 'xhigh'];
  const idx = levels.indexOf(current);
  return levels[(idx + 1) % levels.length];
};
