import { config } from '../../config/index.js';

export const authMiddleware = async (ctx, next) => {
  if (config.ALLOWED_USERS.length === 0) return next();
  if (ctx.from && config.ALLOWED_USERS.includes(ctx.from.id)) return next();
  await ctx.reply('🚫 У вас нет доступа к этому боту.').catch(() => {});
};
