import { showDialogs, openDialog, createNewDialog } from './dialogs.js';
import { deleteConv }    from '../../services/supabase.js';
import {
  redis, getActiveConv, setActiveConv,
  getUserModel, setUserModel,
  toggleWebSearch,
} from '../../services/redis.js';
import { chatKb, delConfirmKb }  from '../keyboards/dialogs.js';
import { mainMenu }      from '../keyboards/main.js';
import { modelsKb, MODELS, supportsWS } from '../keyboards/models.js';

export const setupCallbacks = (bot) => {

  // ── Dialog list (paginated) ───────────────────────────────────────
  bot.action(/^dialogs:(-?\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await showDialogs(ctx, parseInt(ctx.match[1]));
  });

  // ── Open dialog ───────────────────────────────────────────────────
  bot.action(/^open:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await openDialog(ctx, parseInt(ctx.match[1]));
  });

  // ── New dialog ────────────────────────────────────────────────────
  bot.action('new_dialog', async (ctx) => {
    await ctx.answerCbQuery('✨ Создаю…');
    await createNewDialog(ctx);
  });

  bot.action(/^rename:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const convId = parseInt(ctx.match[1]);
    await redis.set(`u:${ctx.from.id}:rename`, convId, 'EX', 120);
    await ctx.editMessageText(
      '✏️ *Переименование*\n\nНапишите новое название одним сообщением:',
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  });

  bot.action('model_menu', async (ctx) => {
    await ctx.answerCbQuery();
    const currentModel = await getUserModel(ctx.from.id);
    await ctx.editMessageText(
      `🧠 *Выбор модели GPT*\n\nТекущая: \`${currentModel}\``,
      { parse_mode: 'Markdown', ...modelsKb(currentModel) }
    ).catch(() => {});
  });

  bot.action(/^set_model:(.+)$/, async (ctx) => {
    const model = ctx.match[1];
    const isValid = MODELS.some(m => m.id === model);
    if (!isValid) return ctx.answerCbQuery('❌ Неизвестная модель');

    await ctx.answerCbQuery(`✅ Модель: ${model}`);
    await setUserModel(ctx.from.id, model);

    await ctx.editMessageText(
      `🧠 *Выбор модели GPT*\n\nТекущая: \`${model}\``,
      { parse_mode: 'Markdown', ...modelsKb(model) }
    ).catch(() => {});
  });

  // ── Main menu ─────────────────────────────────────────────────────
  bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('🏠 *Главное меню*', {
      parse_mode: 'Markdown', ...mainMenu(),
    }).catch(() => {});
  });

  // ── Delete — ask confirmation ─────────────────────────────────────
  bot.action(/^del_ask:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '⚠️ *Удалить диалог?*\nВсё содержимое будет удалено без возможности восстановления.',
      { parse_mode: 'Markdown', ...delConfirmKb(parseInt(ctx.match[1])) }
    ).catch(() => {});
  });

  // ── Delete — confirmed ────────────────────────────────────────────
  bot.action(/^del_ok:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('🗑 Удалено');
    const convId = parseInt(ctx.match[1]);
    const uid    = ctx.from.id;

    await deleteConv(convId, uid);

    const active = await getActiveConv(uid);
    if (active === convId) await setActiveConv(uid, null);

    await showDialogs(ctx, 0);
  });

  bot.action(/^toggle_ws:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const convId = parseInt(ctx.match[1]);
    const uid    = ctx.from.id;
    let enabled = await toggleWebSearch(uid);
    await ctx.answerCbQuery(enabled ? '🌐 Web Search включён' : '🌐 Web Search выключен');

    const currentModel = await getUserModel(uid);
    if (enabled && !supportsWS(currentModel)) {
      await ctx.answerCbQuery(`⚠️ ${currentModel} не поддерживает Web Search. Смените модель.`, { show_alert: true });
      enabled = await toggleWebSearch(uid);
      const rollbackKb = chatKb(convId, enabled);
      await ctx.editMessageReplyMarkup(rollbackKb.reply_markup).catch(() => {});
      return;
    }

    const kb = chatKb(convId, enabled);
    await ctx.editMessageReplyMarkup(kb.reply_markup).catch(() => {});
  });

  // ── No-op (page indicator) ────────────────────────────────────────
  bot.action('noop', (ctx) => ctx.answerCbQuery());
};
