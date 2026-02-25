import {
  getConversations, getConvById,
  createConv, deleteConv,
  getMessages,
} from '../../services/supabase.js';
import {
  setActiveConv, setPage,
} from '../../services/redis.js';
import { dialogsKb, chatKb } from '../keyboards/dialogs.js';
import { mainMenu } from '../keyboards/main.js';
import { Markup } from 'telegraf';
import { config } from '../../config/index.js';
import { safeEdit, safeReply } from '../../utils/telegram.js';

const WEBAPP_BASE = config.WEBAPP_URL.replace(/\/+$/, '');
const buildWebAppUrl = (convId) =>
  `${WEBAPP_BASE}/webapp/index.html?convId=${convId}&api=${encodeURIComponent(WEBAPP_BASE)}`;

// ─── Show paginated list ──────────────────────────────────────────────

export const showDialogs = async (ctx, page) => {
  const uid  = ctx.from.id;
  const { conversations, total } = await getConversations(uid, page, config.DIALOGS_PER_PAGE);
  await setPage(uid, page);

  const totalPages = Math.ceil(total / config.DIALOGS_PER_PAGE) || 1;
  const text = total === 0
    ? '📭 *Диалогов пока нет.*\nНажмите «➕ Новый диалог» чтобы начать!'
    : `📋 *Диалоги* · ${total} шт · стр. ${page + 1}/${totalPages}`;

  const kb = { parse_mode: 'Markdown', ...dialogsKb(conversations, page, total) };
  try {
    if (ctx.callbackQuery) {
      const messageId = ctx.callbackQuery.message?.message_id;
      if (messageId) await safeEdit(ctx, messageId, text, kb);
    } else {
      await safeReply(ctx, text, kb);
    }
  } catch (e) {
    if (!e.description?.includes('not modified')) throw e;
  }
};

// ─── Open dialog ─────────────────────────────────────────────────────

export const openDialog = async (ctx, convId) => {
  const uid  = ctx.from.id;
  const conv = await getConvById(convId, uid);
  if (!conv) {
    await ctx.answerCbQuery('❌ Диалог не найден').catch(() => {});
    return;
  }
  await setActiveConv(uid, convId);

  const allMessages = await getMessages(convId, 100);
  let text;

  if (allMessages.length === 0) {
    text = `💬 *${conv.title}*\n\nНапишите первое сообщение!`;
  } else {
    const last10 = allMessages.slice(-10);
    const formatted = last10.map((m) => {
      return m.role === 'user' ? `👤 ${m.content}` : `🤖 ${m.content}`;
    }).join('\n\n─────────────\n\n');

    text = `💬 *${conv.title}*\n\n${formatted}`;
    if (text.length > 4000) {
      text = '…' + text.slice(text.length - 4000);
    }

    if (allMessages.length > 10 && ctx.callbackQuery) {
      const webappUrl = buildWebAppUrl(convId);
      const kb = Markup.inlineKeyboard([
        [Markup.button.webApp('🌐 Открыть WebApp', webappUrl)],
        [Markup.button.callback('◀️ Назад', 'dialogs_list')],
      ]);
      await ctx.reply('📖 История диалога:', kb);
    }
  }

  const messageId = ctx.callbackQuery?.message?.message_id;
  try {
    if (messageId) {
      await safeEdit(ctx, messageId, text, { reply_markup: chatKb(convId) });
    } else {
      await safeReply(ctx, text, { reply_markup: chatKb(convId) });
    }
  } catch (e) {
    if (!e.description?.includes('not modified')) throw e;
  }
};

// ─── Create new dialog ────────────────────────────────────────────────

export const createNewDialog = async (ctx) => {
  const uid  = ctx.from.id;
  const conv = await createConv(uid, 'Новый диалог');
  await setActiveConv(uid, conv.id);

  const text = `✨ *Новый диалог создан*\n\nНапишите первое сообщение!`;
  const kb   = { parse_mode: 'Markdown', ...chatKb(conv.id) };
  try {
    if (ctx.callbackQuery) await ctx.editMessageText(text, kb);
    else                   await ctx.reply(text, kb);
  } catch (e) {
    if (!e.description?.includes('not modified')) throw e;
  }
};
