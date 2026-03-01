import { resolveAdminRole } from '../../services/supabase_admin.js';

export const adminOnly = async (ctx, next) => {
  if (!ctx.from) return;
  const role = await resolveAdminRole(ctx.from.id).catch(() => 'none');
  if (role === 'none') {
    await ctx.reply('🚫 Раздел доступен только администратору.').catch(() => {});
    return;
  }
  return next();
};
