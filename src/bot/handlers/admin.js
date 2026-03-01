import { adminOnly } from '../middleware/admin.js';
import { adminKb } from '../keyboards/adminKb.js';
import {
  adminListContent, adminUpdateContent,
  adminListPrices,  adminUpdatePrice,
  adminListTariffs, adminUpdateTariff,
  adminGetBotStats,
} from '../../services/supabase_admin.js';

const lastAdminMode = new Map();
const adminReplyMarkup = () => adminKb()?.reply_markup;

export const setupAdmin = (bot) => {
  bot.command('admin', adminOnly, async (ctx) => {
    const stats = await adminGetBotStats().catch(() => ({
      total_users: 0,
      active_users: 0,
      registered_3d: 0,
      registered_7d: 0,
      registered_30d: 0,
    }));

    const text =
      `<b>Админ-панель</b>\n\n` +
      `Всего пользователей: <b>${stats.total_users}</b>\n` +
      `Активных (30 дней): <b>${stats.active_users}</b> из <b>${stats.total_users}</b>\n` +
      `Регистрации за 3 дня: <b>${stats.registered_3d}</b>\n` +
      `Регистрации за 7 дней: <b>${stats.registered_7d}</b>\n` +
      `Регистрации за 30 дней: <b>${stats.registered_30d}</b>\n\n` +
      `Откройте веб-админку кнопкой ниже.`;

    const kb = adminKb();
    const extra = { parse_mode: 'HTML' };
    if (kb?.reply_markup) extra.reply_markup = kb.reply_markup;
    await ctx.reply(text, extra);
  });

  bot.action('admin_content', adminOnly, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const items = await adminListContent();
    const first = items[0];
    if (!first) return ctx.reply('Пока нет записей в bot_content.', { parse_mode: 'HTML' });
    lastAdminMode.set(ctx.from.id, { section: 'content', key: first.key });
    const text =
      `📝 <b>bot_content</b>\n\n` +
      `Текущий ключ: <code>${first.key}</code>\n` +
      `Текст:\n<pre>${(first.text || '').slice(0, 1000)}</pre>\n\n` +
      `Отправьте новый текст одним сообщением, чтобы обновить эту запись.`;
    const rm = adminReplyMarkup();
    const opts = rm ? { parse_mode: 'HTML', reply_markup: rm } : { parse_mode: 'HTML' };
    await ctx.editMessageText(text, opts)
      .catch(() => ctx.reply(text, opts));
  });

  bot.action('admin_prices', adminOnly, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const items = await adminListPrices();
    const first = items[0];
    if (!first) return ctx.reply('Пока нет записей в token_prices.', { parse_mode: 'HTML' });
    lastAdminMode.set(ctx.from.id, { section: 'prices', key: first.action_key });
    const text =
      `💰 <b>token_prices</b>\n\n` +
      `action_key: <code>${first.action_key}</code>\n` +
      `label: <code>${first.label}</code>\n` +
      `tokens: <b>${first.tokens}</b>\n\n` +
      `Отправьте новое число токенов одним сообщением, чтобы обновить цену.`;
    const rm = adminReplyMarkup();
    const opts = rm ? { parse_mode: 'HTML', reply_markup: rm } : { parse_mode: 'HTML' };
    await ctx.editMessageText(text, opts)
      .catch(() => ctx.reply(text, opts));
  });

  bot.action('admin_tariffs', adminOnly, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const items = await adminListTariffs();
    const first = items[0];
    if (!first) return ctx.reply('Пока нет записей в bot_tariffs.', { parse_mode: 'HTML' });
    lastAdminMode.set(ctx.from.id, { section: 'tariffs', key: String(first.id) });
    const text =
      `📦 <b>bot_tariffs</b>\n\n` +
      `ID: <code>${first.id}</code>\n` +
      `name: <code>${first.name}</code>\n` +
      `tokens: <b>${first.tokens}</b>\n` +
      `price_rub: <b>${first.price_rub}</b>\n` +
      `stars: <b>${first.stars}</b>\n\n` +
      `Отправьте JSON-патч одним сообщением, например: {"tokens":200, "price_rub":199}`;
    const rm = adminReplyMarkup();
    const opts = rm ? { parse_mode: 'HTML', reply_markup: rm } : { parse_mode: 'HTML' };
    await ctx.editMessageText(text, opts)
      .catch(() => ctx.reply(text, opts));
  });

  bot.on('text', async (ctx, next) => {
    const uid = ctx.from.id;
    const mode = lastAdminMode.get(uid);
    if (!mode) return next();
    if (ctx.message.text.startsWith('/')) return next();

    const txt = ctx.message.text.trim();

    if (mode.section === 'content') {
      const key = mode.key;
      await adminUpdateContent(key, txt);
      await ctx.reply(`✅ bot_content[${key}] обновлён.`, { parse_mode: 'HTML' });
      lastAdminMode.delete(uid);
      return;
    }

    if (mode.section === 'prices') {
      const key = mode.key;
      const value = parseInt(txt, 10);
      if (!Number.isFinite(value) || value <= 0) {
        await ctx.reply('❌ Введите положительное число токенов.', { parse_mode: 'HTML' });
        return;
      }
      await adminUpdatePrice(key, { tokens: value });
      await ctx.reply(`✅ token_prices[${key}] → ${value} токенов.`, { parse_mode: 'HTML' });
      lastAdminMode.delete(uid);
      return;
    }

    if (mode.section === 'tariffs') {
      const id = parseInt(mode.key, 10);
      let patch;
      try {
        patch = JSON.parse(txt);
      } catch (_) {
        await ctx.reply('❌ Нужен корректный JSON, например: {"tokens":200, "price_rub":199}', { parse_mode: 'HTML' });
        return;
      }
      await adminUpdateTariff(id, patch);
      await ctx.reply(`✅ bot_tariffs[${id}] обновлён.`, { parse_mode: 'HTML' });
      lastAdminMode.delete(uid);
      return;
    }

    return next();
  });
};
