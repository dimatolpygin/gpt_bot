import { config } from '../../config/index.js';
import { isUserBanned, adminUnbanUser } from '../../services/supabase_admin.js';
import { redis } from '../../services/redis.js';

export const authMiddleware = async (ctx, next) => {
  if (ctx.from) {
    const ban = await isUserBanned(ctx.from.id).catch(() => null);
    if (ban) {
      const banKey = `spam:ban-until:${ctx.from.id}`;
      const ttl = await redis.ttl(banKey);
      if (ttl <= 0) {
        await adminUnbanUser({ userId: ctx.from.id }).catch(() => null);
        await redis.del(banKey);
        return next();
      }
      const reason = ban.reason ? `\nПричина: ${ban.reason}` : '';
      await ctx.reply(`🚫 Ваш доступ к боту ограничен.${reason}`).catch(() => {});
      return;
    }
  }

  if (config.ALLOWED_USERS.length === 0) return next();
  if (ctx.from && config.ALLOWED_USERS.includes(ctx.from.id)) return next();
  await ctx.reply('🚫 У вас нет доступа к этому боту.').catch(() => {});
};
