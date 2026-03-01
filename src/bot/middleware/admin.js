import { config } from '../../config/index.js';

const adminIds = (config.ADMIN_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(Boolean);

export const adminOnly = async (ctx, next) => {
  if (!ctx.from) return;
  if (!adminIds.length) return; // если не настроено — никого не пускаем
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Раздел доступен только администратору.').catch(() => {});
    return;
  }
  return next();
};
