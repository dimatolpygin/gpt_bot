import {
  getActiveConv, isProcessing, setProcessing, redis,
  getUserModel, getWebSearch, getThinkingLevel, getCodeInterp,
} from '../../services/redis.js';
import {
  addMessage, getMessages,
  updateConvTitle,
} from '../../services/supabase.js';
import { streamChat, webSearchChat, analyzePhoto, analyzeFile, codeInterpreterChat } from '../../services/openai.js';
import { chatKb } from '../keyboards/dialogs.js';
import { supportsChat, supportsVision, supportsWS, VALID_MODELS } from '../keyboards/models.js';
import { mainMenu } from '../keyboards/main.js';
import { config } from '../../config/index.js';
import { Markup, Input } from 'telegraf';
import { safeEdit, safeSendLong, safeReply } from '../../utils/telegram.js';

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
      await ctx.reply('❌ Нет активного диалога. Выберите или создайте:', await mainMenu(uid));
      return;
    }

    await setProcessing(uid, true);
    const waitMsg = await ctx.reply('🤔 Думаю…');

    try {
      const history = await getMessages(convId, config.MAX_HISTORY);
      const isFirst = history.length === 0;

      await addMessage(convId, 'user', ctx.message.text);

      if (isFirst) {
        const t = ctx.message.text;
        await updateConvTitle(convId, t.length > 45 ? t.slice(0, 45) + '…' : t);
      }

      const openAiMsgs = [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: ctx.message.text },
      ];

      const [model, wsEnabled, thinkLevel, useCodeInterp] = await Promise.all([
        getUserModel(uid),
        getWebSearch(uid),
        getThinkingLevel(uid),
        getCodeInterp(uid),
      ]);
      const safeModel = VALID_MODELS.includes(model) ? model : 'gpt-4o';

      if (!supportsChat(safeModel)) {
        await ctx.reply(
          `⛔ Модель \`${safeModel}\` не поддерживает диалог.\nВыберите другую в 🧠 Модель GPT.`,
          { parse_mode: 'Markdown', ...chatKb(convId) }
        );
        return;
      }

      const wsAllowed = wsEnabled && supportsWS(safeModel);
      const finalKb = buildFinalKb(convId, wsAllowed);
      let finalText = '';

      if (useCodeInterp) {
        await safeEdit(ctx, waitMsg.message_id, '🐍 Выполняю код...');
        const { text, files } = await codeInterpreterChat(openAiMsgs, safeModel);
        finalText = text;
        await safeSendLong(ctx, finalText, waitMsg.message_id, { parse_mode: 'Markdown', ...finalKb });
        for (const f of files) {
          await ctx.replyWithDocument(
            Input.fromBuffer(f.buffer, f.name),
            { caption: `📎 ${f.name}` }
          ).catch(() => {});
        }
      } else {
        let lastEdit = 0;
        const handleChunk = async (_delta, full) => {
          finalText = full;
          const now = Date.now();
          if (now - lastEdit > config.STREAM_THROTTLE) {
            lastEdit = now;
            const preview = full.length > 4000 ? '…' + full.slice(-4000) : full;
            await safeEdit(ctx, waitMsg.message_id, preview + ' ▌');
          }
        };

        const streamResult = wsAllowed
          ? await webSearchChat(openAiMsgs, safeModel, handleChunk, { thinkingLevel: thinkLevel })
          : await streamChat(openAiMsgs, safeModel, handleChunk, { thinkingLevel: thinkLevel });
        finalText = finalText || streamResult;
        await safeSendLong(ctx, finalText, waitMsg.message_id, { parse_mode: 'Markdown', ...finalKb });
      }

      if (convId) {
        await addMessage(convId, 'assistant', finalText, safeModel);
      }
    } catch (err) {
      console.error('[Chat] error:', err.message);
      const isModelError = err?.message?.includes('model')
        || err?.message?.includes('недоступна')
        || err?.message?.includes('does not exist')
        || err?.status === 404;
      const errorText = isModelError
        ? `❌ Модель недоступна в вашем аккаунте.\n\nПереключитесь на *gpt-4o* через меню 👉 Модель.`
        : `❌ Ошибка: ${err.message}`;
      try {
        if (waitMsg?.message_id) {
          await safeEdit(ctx, waitMsg.message_id, errorText);
        } else {
          await safeReply(ctx, errorText);
        }
      } catch (replyErr) {
        console.error('[Chat] failed to send error message:', replyErr.message);
      }
    } finally {
      await setProcessing(uid, false);
    }
  });

  bot.on('document', async (ctx) => {
    const uid = ctx.from.id;
    const convId = await getActiveConv(uid);
    if (!convId) {
      await ctx.reply('❌ Нет активного диалога.', await mainMenu(uid));
      return;
    }

    if (await isProcessing(uid)) {
      await ctx.reply('⏳ Подождите, обрабатываю предыдущий запрос…');
      return;
    }

    await setProcessing(uid, true);
    const waitMsg = await ctx.reply('📄 Анализирую файл…');

    try {
      const doc = ctx.message.document;
      const MAX_FILE_SIZE = 20 * 1024 * 1024;
      if (doc.file_size > MAX_FILE_SIZE) {
        await safeEdit(ctx, waitMsg.message_id, '❌ Файл слишком большой. Максимум 20MB.');
        return;
      }

      const ALLOWED_EXTS = ['pdf','txt','md','csv','json','js','ts','py','docx'];
      const ext = doc.file_name?.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTS.includes(ext)) {
        await safeEdit(
          ctx,
          waitMsg.message_id,
          `❌ Формат .${ext || '??'} не поддерживается. Допустимо: ${ALLOWED_EXTS.join(', ')}`
        );
        return;
      }

      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const fileBuffer = Buffer.from(await response.arrayBuffer());
      const model = await getUserModel(uid);
      const caption = ctx.message.caption || '';
      const result = await analyzeFile(fileBuffer, doc.file_name, caption, model || 'gpt-4o');

      await addMessage(convId, 'user', `[Файл: ${doc.file_name}] ${caption}`);
      await addMessage(convId, 'assistant', result, model);

      const finalKb = buildFinalKb(convId);
      await safeSendLong(
        ctx,
        result,
        waitMsg.message_id,
        { parse_mode: 'Markdown', ...finalKb }
      );

      if (result.length > 4000) {
        const buffer = Buffer.from(result, 'utf-8');
        await ctx.replyWithDocument(
          { source: buffer, filename: 'gpt_response.txt' },
          { caption: '📄 Полный ответ' }
        );
      }
    } catch (err) {
      console.error('[File] analysis error:', err.message);
      await safeEdit(ctx, waitMsg.message_id, `❌ Ошибка при анализе файла: ${err.message}`);
    } finally {
      await setProcessing(uid, false);
    }
  });

  bot.on('photo', async (ctx) => {
    const uid    = ctx.from.id;
    const convId = await getActiveConv(uid);
    if (!convId) {
      await ctx.reply('❌ Нет активного диалога.', await mainMenu(uid));
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
      await safeEdit(ctx, waitMsg.message_id, result, finalKb);
    } catch (err) {
      console.error('[Photo] error:', err.message);
      await safeEdit(ctx, waitMsg.message_id, `❌ Ошибка: ${err.message}`);
    } finally {
      await setProcessing(uid, false);
    }
  });
};
