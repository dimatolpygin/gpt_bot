import { redis } from '../../services/redis.js';
import { adminBanUser, isUserBanned } from '../../services/supabase_admin.js';

const SPAM_KEY = (uid) => `spam:${uid}`;
const PENALTY_KEY = (uid) => `spam:penalty:${uid}`;
const BAN_TTL_KEY = (uid) => `spam:ban-until:${uid}`;
const BASE_PENALTY = 30;
const MAX_PENALTY = 3600;
const THRESHOLD = 5;
const WINDOW = 10; // seconds

export const spamGuard = async (ctx, next) => {
  if (!ctx.from) return next();
  const uid = ctx.from.id;
  const updateType = ctx.updateType;
  if (!['message', 'callback_query'].includes(updateType)) return next();

  const key = SPAM_KEY(uid);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW);
  if (count <= THRESHOLD) return next();

  const banKey = BAN_TTL_KEY(uid);
  const penaltyKey = PENALTY_KEY(uid);
  const currentPenalty = parseInt(await redis.get(penaltyKey), 10);
  const nextPenalty = currentPenalty ? Math.min(currentPenalty * 2, MAX_PENALTY) : BASE_PENALTY;
  await redis.set(penaltyKey, nextPenalty, 'EX', 86400);
  await redis.set(banKey, '1', 'EX', nextPenalty);

  const existing = await isUserBanned(uid);
  if (!existing) {
    await adminBanUser({ userId: uid, reason: `Автоблок за спам (${count} сообщений)`, adminId: 0 });
  }

  await ctx.reply(`🚫 Вы заблокированы на ${nextPenalty} сек. за спам.`).catch(() => {});
};
