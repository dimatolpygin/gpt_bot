import {
  getActiveConv, isProcessing, setProcessing, redis,
  getUserModel, getWebSearch,
} from '../../services/redis.js';
import {
  addMessage, getMessages,
  updateConvTitle,
} from '../../services/supabase.js';
import { streamChat, webSearchChat, analyzePhoto } from '../../services/openai.js';
import { chatKb } from '../keyboards/dialogs.js';
import { supportsChat, supportsVision, supportsWS } from '../keyboards/models.js';
import { mainMenu } from '../keyboards/main.js';
import { config } from '../../config/index.js';
import { Markup } from 'telegraf';

const MAX_LEN = 4000;

// ─── Safe edit with Markdown → plain fallback ─────────────────────────

const safeEdit = async (telegram, chatId, msgId, text, extra = {}) => {
  try {
    await telegram.editMessageText(chatId, msgId, undefined, text, {
      parse_mode: 'Markdown', ...extra,
    });
  } catch (e) {
    if (e.description?.includes('parse')) {
      // Fallback to plain text
      await telegram.editMessageText(chatId, msgId, undefined, text, extra)
        .catch(() => {});
    }
    // Ignore "not modified" and "message to edit not found"
  }
};

// ─── Split long messages ──────────────────────────────────────────────

const splitText = (text) => {
  const parts = [];
  while (text.length > MAX_LEN) {
    let cut = text.lastIndexOf('\n', MAX_LEN);
    if (cut < 1) cut = MAX_LEN;
    parts.push(text.slice(0, cut));
    text = text.slice(cut).trimStart();
  }
  parts.push(text);
  return parts;
};

const buildFinalKb = (convId, wsEnabled = false) => {
  const baseKb = chatKb(convId, wsEnabled);
  const baseInline = baseKb.reply_markup?.inline_keyboard || [];
  const webappBase = config.WEBAPP_URL.replace(/\/+$/, '');
  const webappUrl = `${webappBase}/webapp/index.html?convId=${convId}&api=${encodeURIComponent(webappBase)}`;
  return Markup.inlineKeyboard([
    [Markup.button.webApp('💬 Просмотреть весь диалог', webappUrl)],
    ...baseInline,
  ]);
};

// ─── Main handler ─────────────────────────────────────────────────────

export const setupChat = (bot) => {
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const uid = ctx.from.id;

    const renameConvId = await redis.get(`u:${uid}:rename`);
    if (renameConvId) {
      await redis.del(`u:${uid}:rename`);
      const newTitle = ctx.message.text.slice(0, 60);
      await updateConvTitle(parseInt(renameConvId), newTitle);
      await ctx.reply(
        `✅ Переименовано: *${newTitle}*`,
        { parse_mode: 'Markdown', ...chatKb(parseInt(renameConvId)) }
      );
      return;
    }

    if (await isProcessing(uid)) {
      await ctx.reply('⏳ Подождите, обрабатываю предыдущий запрос…');
      return;
    }

    const convId = await getActiveConv(uid);
    if (!convId) {
      await ctx.reply('❌ Нет активного диалога. Выберите или создайте:', mainMenu());
      return;
    }

    await setProcessing(uid, true);
    const waitMsg = await ctx.reply('🤔 Думаю…');

    try {
      // History BEFORE new message (to build OpenAI payload correctly)
      const history = await getMessages(convId, config.MAX_HISTORY);
      const isFirst = history.length === 0;

      // Persist user message
      await addMessage(convId, 'user', ctx.message.text);

      // Auto-title from first message
      if (isFirst) {
        const t = ctx.message.text;
        await updateConvTitle(convId, t.length > 45 ? t.slice(0, 45) + '…' : t);
      }

      // Build messages for OpenAI
      const openAiMsgs = [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: ctx.message.text },
      ];

      const model = await getUserModel(uid);
      if (!supportsChat(model)) {
        await ctx.reply(
          `⛔ Модель \`${model}\` не поддерживает диалог.\nВыберите другую в 🧠 Модель GPT.`,
          { parse_mode: 'Markdown', ...chatKb(convId) }
        );
        return;
      }

      const wsEnabled = await getWebSearch(uid);
      const wsAllowed = wsEnabled && supportsWS(model);

      if (wsAllowed) {
        await safeEdit(ctx.telegram, ctx.chat.id, waitMsg.message_id, '🌐 Ищу в интернете…');
        const wsResult = await webSearchChat(openAiMsgs, model);
        await addMessage(convId, 'assistant', wsResult, model);

        const parts = splitText(wsResult);
        const baseKb  = chatKb(convId, true);
        const finalKb = buildFinalKb(convId, true);

        if (parts.length === 1) {
          await safeEdit(
            ctx.telegram, ctx.chat.id, waitMsg.message_id,
            wsResult,
            finalKb
          );
        } else {
          await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
          for (let i = 0; i < parts.length; i++) {
            const isLast = i === parts.length - 1;
            const extra = isLast
              ? { parse_mode: 'Markdown', ...finalKb }
              : { parse_mode: 'Markdown' };
            await ctx.reply(parts[i], extra).catch(() => ctx.reply(
              parts[i],
              isLast ? { parse_mode: 'Markdown', ...finalKb } : { parse_mode: 'Markdown' }
            ));
          }
        }
        return;
      }

      let lastEdit = 0;
      let finalText = '';

      await streamChat(
        openAiMsgs,
        model,
        async (accumulated) => {
          const now = Date.now();
          if (now - lastEdit > config.STREAM_THROTTLE) {
            lastEdit = now;
            const preview = accumulated.length > MAX_LEN
              ? '…' + accumulated.slice(-MAX_LEN)
              : accumulated;
            await safeEdit(ctx.telegram, ctx.chat.id, waitMsg.message_id, preview + ' ▌');
          }
        },
        async (full) => { finalText = full; }
      );

      // Persist assistant reply
        await addMessage(convId, 'assistant', finalText, model);

        const parts = splitText(finalText);
        const baseKb  = chatKb(convId, wsAllowed);
        const finalKb = buildFinalKb(convId, wsAllowed);

        if (parts.length === 1) {
          await safeEdit(
            ctx.telegram, ctx.chat.id, waitMsg.message_id,
            finalText,
            finalKb
          );
        } else {
          await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
          for (let i = 0; i < parts.length; i++) {
            const isLast = i === parts.length - 1;
            const extra  = isLast
              ? { parse_mode: 'Markdown', ...finalKb }
              : { parse_mode: 'Markdown' };
            await ctx.reply(parts[i], extra).catch(() => ctx.reply(
              parts[i],
              isLast ? { parse_mode: 'Markdown', ...finalKb } : { parse_mode: 'Markdown' }
            ));
          }
        }

    } catch (err) {
      console.error('[Chat] error:', err.message);
      await safeEdit(
        ctx.telegram, ctx.chat.id, waitMsg.message_id,
        `❌ Ошибка: ${err.message}`
      );
    } finally {
      await setProcessing(uid, false);
    }
  });

  bot.on('photo', async (ctx) => {
    const uid    = ctx.from.id;
    const convId = await getActiveConv(uid);
    if (!convId) {
      await ctx.reply('❌ Нет активного диалога.', mainMenu());
      return;
    }

    if (await isProcessing(uid)) {
      await ctx.reply('⏳ Подождите…');
      return;
    }

    await setProcessing(uid, true);
    const waitMsg = await ctx.reply('🔍 Анализирую изображение…');

    try {
      const model   = await getUserModel(uid);
      // Проверка: модель поддерживает vision
      if (!supportsVision(model)) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        await ctx.reply(
          `⛔ Модель \`${model}\` не поддерживает анализ изображений.\nВыберите GPT-4o или GPT-5 в 🧠 Модель GPT.`,
          { parse_mode: 'Markdown', ...chatKb(convId) }
        );
        await setProcessing(uid, false);
        return;
      }
      const photo   = ctx.message.photo[ctx.message.photo.length - 1];
      const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
      const caption = ctx.message.caption || 'Подробно опиши что на этом изображении.';

      const result = await analyzePhoto(fileUrl.href, caption, model);

      await addMessage(convId, 'user', `[Фото] ${caption}`);
      await addMessage(convId, 'assistant', result, model);

      const finalKb = buildFinalKb(convId);
      await safeEdit(ctx.telegram, ctx.chat.id, waitMsg.message_id, result, finalKb);
    } catch (err) {
      console.error('[Photo] error:', err.message);
      await safeEdit(ctx.telegram, ctx.chat.id, waitMsg.message_id, `❌ Ошибка: ${err.message}`);
    } finally {
      await setProcessing(uid, false);
    }
  });
};
