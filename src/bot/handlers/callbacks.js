import { showDialogs, openDialog, createNewDialog } from './dialogs.js';
import {
  deleteConv, deleteUserPrompt, setActivePrompt,
} from '../../services/supabase.js';
import {
  redis, getActiveConv, setActiveConv,
  getUserModel, setUserModel,
  toggleWebSearch, getThinkingLevel,
  setThinkingLevel, nextThinkingLevel,
} from '../../services/redis.js';
import { chatKb, delConfirmKb }  from '../keyboards/dialogs.js';
import { mainMenu }      from '../keyboards/main.js';
import { modelsKb, MODELS, supportsWS, supportsReasoning } from '../keyboards/models.js';
import { showPromptsList, showDeleteMode, beginPromptCreation } from './prompts.js';

const safeAnswerCbQuery = async (ctx, text, extra) => {
  try {
    await ctx.answerCbQuery(text, extra);
  } catch (_) {}
};

export const setupCallbacks = (bot) => {

  // ── Dialog list (paginated) ───────────────────────────────────────
  bot.action(/^dialogs:(-?\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await showDialogs(ctx, parseInt(ctx.match[1]));
  });

  bot.action('prompts', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await showPromptsList(ctx);
  });

  bot.action('prompt_add', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await beginPromptCreation(ctx);
  });

  bot.action('prompt_delete_mode', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await showDeleteMode(ctx);
  });

  bot.action('prompt_reset', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await setActivePrompt(ctx.from.id, null);
    await showPromptsList(ctx);
  });

  bot.action(/^prompt_select:(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx, '✅ Активирован');
    await setActivePrompt(ctx.from.id, parseInt(ctx.match[1]));
    await showPromptsList(ctx);
  });

  bot.action(/^prompt_del:(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx, '🗑 Удалён');
    await deleteUserPrompt(ctx.from.id, parseInt(ctx.match[1]));
    await showDeleteMode(ctx);
  });

  bot.action('dialogs_list', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await showDialogs(ctx, 0);
  });

  // ── Open dialog ───────────────────────────────────────────────────
  bot.action(/^open:(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await openDialog(ctx, parseInt(ctx.match[1]));
  });

  // ── New dialog ────────────────────────────────────────────────────
  bot.action('new_dialog', async (ctx) => {
    await safeAnswerCbQuery(ctx, '✨ Создаю…');
    await createNewDialog(ctx);
  });

  bot.action(/^rename:(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const convId = parseInt(ctx.match[1]);
    await redis.set(`u:${ctx.from.id}:rename`, convId, 'EX', 120);
    await ctx.editMessageText(
      '✏️ *Переименование*\n\nНапишите новое название одним сообщением:',
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  });

  bot.action('model_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const currentModel = await getUserModel(ctx.from.id);
    await ctx.editMessageText(
      `🧠 *Выбор модели GPT*\n\nТекущая: \`${currentModel}\``,
      { parse_mode: 'Markdown', ...modelsKb(currentModel) }
    ).catch(() => {});
  });

  bot.action(/^set_model:(.+)$/, async (ctx) => {
    const model = ctx.match[1];
    const isValid = MODELS.some(m => m.id === model);
    if (!isValid) {
      await safeAnswerCbQuery(ctx, '❌ Неизвестная модель');
      return;
    }

    await safeAnswerCbQuery(ctx, `✅ Модель: ${model}`);
    await setUserModel(ctx.from.id, model);

    await ctx.editMessageText(
      `🧠 *Выбор модели GPT*\n\nТекущая: \`${model}\``,
      { parse_mode: 'Markdown', ...modelsKb(model) }
    ).catch(() => {});
  });

  // ── Main menu ─────────────────────────────────────────────────────
  bot.action('main_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const menu = await mainMenu(ctx.from.id);
    await ctx.editMessageText('🏠 *Главное меню*', {
      parse_mode: 'Markdown', ...menu,
    }).catch(() => {});
  });

  bot.action('toggle_thinking', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const userId = ctx.from.id;
    const current = await getThinkingLevel(userId);
    const next = nextThinkingLevel(current);
    const model = await getUserModel(userId);
    if (!supportsReasoning(model)) {
      await safeAnswerCbQuery(ctx, '⚠️ Текущая модель не поддерживает режим мышления', { show_alert: true });
      return;
    }
    await setThinkingLevel(userId, next);

    const menu = await mainMenu(userId);
    await ctx.editMessageText(
      `🧠 Режим мышления: ${next}\n\n` +
      `none — без размышлений (быстро)\n` +
      `low — лёгкие рассуждения\n` +
      `medium — стандарт\n` +
      `high — глубокий анализ\n` +
      `xhigh — максимум (медленно, дорого)`,
      { parse_mode: 'Markdown', ...menu }
    ).catch(() => {});
  });


  // ── Delete — ask confirmation ─────────────────────────────────────
  bot.action(/^del_ask:(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await ctx.editMessageText(
      '⚠️ *Удалить диалог?*\nВсё содержимое будет удалено без возможности восстановления.',
      { parse_mode: 'Markdown', ...delConfirmKb(parseInt(ctx.match[1])) }
    ).catch(() => {});
  });

  // ── Delete — confirmed ────────────────────────────────────────────
  bot.action(/^del_ok:(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx, '🗑 Удалено');
    const convId = parseInt(ctx.match[1]);
    const uid    = ctx.from.id;

    await deleteConv(convId, uid);

    const active = await getActiveConv(uid);
    if (active === convId) await setActiveConv(uid, null);

    await showDialogs(ctx, 0);
  });

  bot.action(/^toggle_ws:(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const convId = parseInt(ctx.match[1]);
    const uid    = ctx.from.id;
    let enabled = await toggleWebSearch(uid);
    await safeAnswerCbQuery(ctx, enabled ? '🌐 Web Search включён' : '🌐 Web Search выключен');

    const currentModel = await getUserModel(uid);
    if (enabled && !supportsWS(currentModel)) {
      await safeAnswerCbQuery(ctx, `⚠️ ${currentModel} не поддерживает Web Search. Смените модель.`, { show_alert: true });
      enabled = await toggleWebSearch(uid);
      const rollbackKb = chatKb(convId, enabled);
      await ctx.editMessageReplyMarkup(rollbackKb.reply_markup).catch(() => {});
      return;
    }

    const kb = chatKb(convId, enabled);
    await ctx.editMessageReplyMarkup(kb.reply_markup).catch(() => {});
  });

  // ── No-op (page indicator) ────────────────────────────────────────
  bot.action('noop', (ctx) => safeAnswerCbQuery(ctx));
};
