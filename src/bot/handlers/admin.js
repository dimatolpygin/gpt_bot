import { adminOnly } from '../middleware/admin.js';
import { adminKb } from '../keyboards/adminKb.js';
import {
  adminListContent, adminUpdateContent,
  adminListPrices,  adminUpdatePrice,
  adminListTariffs, adminUpdateTariff,
} from '../../services/supabase_admin.js';

const lastAdminMode = new Map();

export const setupAdmin = (bot) => {
  bot.command('admin', adminOnly, async (ctx) => {
    await ctx.reply('⚙️ <b>Админ-панель</b>', {
      parse_mode: 'HTML',
      reply_markup: adminKb().reply_markup,
    });
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
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: adminKb().reply_markup })
      .catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: adminKb().reply_markup }));
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
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: adminKb().reply_markup })
      .catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: adminKb().reply_markup }));
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
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: adminKb().reply_markup })
      .catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: adminKb().reply_markup }));
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
