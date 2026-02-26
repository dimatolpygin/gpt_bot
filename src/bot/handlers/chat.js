import {
  getActiveConv, redis,
  getUserModel, getWebSearch, getThinkingLevel,
} from '../../services/redis.js';
import {
  addMessage, getMessages,
  updateConvTitle,
} from '../../services/supabase.js';
import { streamChat, webSearchChat, analyzePhoto, analyzeFile, codeInterpreterChat, needsCodeInterpreter, transcribeVoice, generateImage, openai } from '../../services/openai.js';
import { chatKb } from '../keyboards/dialogs.js';
import { supportsChat, supportsVision, supportsWS, VALID_MODELS } from '../keyboards/models.js';
import { mainMenu } from '../keyboards/main.js';
import { config } from '../../config/index.js';
import { Markup, Input } from 'telegraf';
import { safeEdit, safeSendLong, safeReply } from '../../utils/telegram.js';
import { startThinkingAnimation, stopThinkingAnimation } from '../utils/thinkingAnimation.js';
import { isImageRequest, detectImageSize, getSizeLabel } from '../utils/imageDetect.js';
import { getActivePrompt } from '../../services/supabase.js';
import { finishPromptCreation } from './prompts.js';

const CI_MODEL = 'gpt-4o';
const WEBAPP_BASE = config.WEBAPP_URL.replace(/\/+$/, '');
const buildWebAppUrl = (convId) =>
  `${WEBAPP_BASE}/webapp/index.html?convId=${convId}&api=${encodeURIComponent(WEBAPP_BASE)}`;

const buildFinalKb = (convId, wsEnabled = false) => {
  const baseKb = chatKb(convId, wsEnabled);
  const baseInline = baseKb.reply_markup?.inline_keyboard || [];
  const webappUrl = buildWebAppUrl(convId);
  return Markup.inlineKeyboard([
    [Markup.button.webApp('💬 Просмотреть весь диалог', webappUrl)],
    ...baseInline,
  ]);
};

const processUserText = async (ctx, userText, waitMsg) => {
  const uid = ctx.from.id;
  const renameConvId = await redis.get(`u:${uid}:rename`);
  if (renameConvId) {
    await redis.del(`u:${uid}:rename`);
    const newTitle = (userText || '').slice(0, 60);
    await updateConvTitle(parseInt(renameConvId), newTitle);
    await ctx.reply(
      `✅ Переименовано: *${newTitle}*`,
      { parse_mode: 'Markdown', ...chatKb(parseInt(renameConvId)) }
    );
    return;
  }

  const convId = await getActiveConv(uid);
  if (!convId) {
    await ctx.reply('❌ Нет активного диалога. Выберите или создайте:', await mainMenu(uid));
    return;
  }

  const history = await getMessages(convId, config.MAX_HISTORY);
  const isFirst = history.length === 0;
  const messageText = userText || '';

  const [model, wsEnabled, thinkLevel] = await Promise.all([
    getUserModel(uid),
    getWebSearch(uid),
    getThinkingLevel(uid),
  ]);
  const safeModel = VALID_MODELS.includes(model) ? model : 'gpt-4o';

  if (isImageRequest(messageText)) {
    const processingMsgId = waitMsg?.message_id;
    const size = detectImageSize(messageText);
    const sizeLabel = getSizeLabel(size);
    await safeEdit(
      ctx,
      processingMsgId,
      `🎨 Генерирую изображение...\n📐 Формат: <b>${sizeLabel}</b>`,
      { parse_mode: 'HTML' }
    );
    try {
      const promptMessages = [
        {
          role: 'system',
          content: 'You are an image prompt engineer. The user wants to generate an image. Extract the image description from the user message and return ONLY an optimized English prompt for image generation. No explanations, no extra text. Just the prompt.',
        },
        { role: 'user', content: messageText },
      ];

      let imagePrompt = messageText;
      try {
        const promptResp = await openai.responses.create({
          model: 'gpt-4o-mini',
          input: promptMessages,
        });
        imagePrompt = promptResp.output_text?.trim() || messageText;
      } catch (err) {
        console.warn('[Image] prompt optimization failed, using original:', err.message);
      }

      console.log('[Image] optimized prompt:', imagePrompt.slice(0, 120));
      const imageBuffer = await generateImage(imagePrompt, size);

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsgId);
      } catch (_) {}

      await ctx.replyWithPhoto(
        { source: imageBuffer, filename: 'image.png' },
        {
          caption: `🎨 <i>${imagePrompt.slice(0, 200)}</i>\n📐 ${sizeLabel}`,
          parse_mode: 'HTML',
        }
      );

      if (convId) {
        await addMessage(convId, 'user', messageText);
        await addMessage(convId, 'assistant', `[Изображение сгенерировано]\nПромт: ${imagePrompt}`, safeModel);
      }
      return;
    } catch (err) {
      console.error('[Image] generation error:', err.message);
      await safeEdit(ctx, waitMsg.message_id, `❌ Ошибка генерации: ${err.message}`);
      return;
    }
  }

  await addMessage(convId, 'user', messageText);
  if (isFirst) {
    const t = messageText;
    await updateConvTitle(convId, t.length > 45 ? `${t.slice(0, 45)}…` : t);
  }

  if (!supportsChat(safeModel)) {
    await ctx.reply(
      `⛔ Модель \`${safeModel}\` не поддерживает диалог.\nВыберите другую в 🧠 Модель GPT.`,
      { parse_mode: 'Markdown', ...chatKb(convId) }
    );
    return;
  }

  const wsAllowed = wsEnabled && supportsWS(safeModel);
  const finalKb = buildFinalKb(convId, wsAllowed);
  const thinkingInterval = startThinkingAnimation(ctx, waitMsg.message_id, safeModel);

  let finalText = '';
  try {
    let openAiMsgs = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: messageText },
    ];
    const activePrompt = await getActivePrompt(uid);
    console.log('[Prompt] active prompt:', activePrompt ? `"${activePrompt.name}"` : 'none (default)');
    if (activePrompt) {
      const filtered = openAiMsgs.filter(m => m.role !== 'system' && m.role !== 'developer');
      openAiMsgs = [
        { role: 'system', content: activePrompt.content },
        ...filtered,
      ];
      console.log('[Prompt] injected:', `${activePrompt.content.slice(0, 80)}...`);
    }
    const useCodeInterp = needsCodeInterpreter(messageText);

    if (useCodeInterp) {
      await safeEdit(ctx, waitMsg.message_id, '🐍 Создаю файл...');
      const fileInstruction = {
        role: 'developer',
        content:
          'The user wants you to CREATE and SEND an actual file. ' +
          'You MUST use the code_interpreter tool to generate it. ' +
          'CRITICAL RULES:\n' +
          '1. Save ALL output to /mnt/data/ directory.\n' +
          '2. Use ONLY ASCII letters, digits, underscores, or hyphens in filenames.\n' +
          '3. NO Cyrillic, Chinese, Arabic, emoji, or spaces.\n' +
          '4. Good examples: essay_monster.pdf, data_report.xlsx, chart_2024.png\n' +
          '5. Bad examples: эссе.pdf, 文件.xlsx, my file.docx\n' +
          'Code examples:\n' +
          '- PDF: pdf.output("/mnt/data/essay_monster.pdf")\n' +
          '- Excel: df.to_excel("/mnt/data/report.xlsx", index=False)\n' +
          '- PNG: plt.savefig("/mnt/data/chart.png")\n' +
          'Do NOT say you cannot create files. Just write and execute Python code.',
      };
      const systemIdx = openAiMsgs.findIndex(m => m.role === 'system' || m.role === 'developer');
      if (systemIdx >= 0) {
        openAiMsgs.splice(systemIdx + 1, 0, fileInstruction);
      } else {
        openAiMsgs.unshift(fileInstruction);
      }

      console.log(`[CodeInterp] user model: ${safeModel}, using: ${CI_MODEL}`);
      let attempt = 0;
      const MAX_RETRIES = 3;
      let result = null;
      while (attempt < MAX_RETRIES) {
        try {
          result = await codeInterpreterChat(openAiMsgs, CI_MODEL);
          break;
        } catch (err) {
          attempt++;
          const isRL = err.status === 429
            || err.message?.includes('rate limit')
            || err.message?.includes('Too Many Requests');
          if (!isRL || attempt >= MAX_RETRIES) throw err;
          const delay = Math.pow(2, attempt) * 1000;
          const rateMsg = `⏳ Rate limit. Повтор ${attempt}/${MAX_RETRIES}...`;
          console.warn(`[CodeInterp] rate limit, retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
          await safeEdit(ctx, waitMsg.message_id, rateMsg);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      const { text, files } = result || { text: '', files: [] };
      finalText = text;

      if (files.length === 0) {
        console.warn('[CodeInterp] model responded with text only, no files generated');
        const preview = finalText
          ? (finalText.length > 3500 ? finalText.slice(0, 3500) : finalText)
          : 'Ответ пустой.';
        await safeEdit(
          ctx,
          waitMsg.message_id,
          `⚠️ Файл не был создан (возможно API вернул bytes: null).\n\n${preview}`,
          { ...finalKb }
        );
      } else {
        await safeSendLong(ctx, finalText, waitMsg.message_id, finalKb);
        for (const f of files) {
          await ctx.replyWithDocument(
            Input.fromBuffer(f.buffer, f.name),
            { caption: `📎 ${f.name}` }
          ).catch(() => {});
        }
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
      await safeSendLong(ctx, finalText, waitMsg.message_id, finalKb);
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
    stopThinkingAnimation(thinkingInterval);
  }
};

export const setupChat = (bot) => {
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const uid = ctx.from.id;
    const isAddingPrompt = await redis.get(`prompt_add_state:${uid}`);
    if (isAddingPrompt) {
      await redis.del(`prompt_add_state:${uid}`);
      await finishPromptCreation(ctx);
      return;
    }

    const waitMsg = await ctx.reply('🤔 Думаю…');
    processUserText(ctx, ctx.message.text || '', waitMsg).catch(err => {
      console.error('[Chat] async processing error:', err);
    });
  });

  bot.on('voice', async (ctx) => {
    const uid = ctx.from.id;
    if (!ctx.message?.voice) return;

    const recognitionMsg = await ctx.reply('🎤 Распознаю голос…');
    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      const transcription = (await transcribeVoice(buffer, { language: 'ru' })).trim();
      if (!transcription) {
        await safeEdit(ctx, recognitionMsg.message_id, '❌ Не удалось распознать речь.');
        return;
      }

      await ctx.reply(`🎤 Распознано: "${transcription}"`);
      const waitMsg = await ctx.reply('🤔 Думаю…');
      await processUserText(ctx, transcription, waitMsg);
    } catch (err) {
      console.error('[Voice] error:', err.message);
      await safeReply(ctx, `❌ Ошибка: ${err.message}`);
    } finally {
      await ctx.telegram.deleteMessage(ctx.chat.id, recognitionMsg.message_id).catch(() => {});
    }
  });

  bot.on('document', async (ctx) => {
    const uid = ctx.from.id;
    const convId = await getActiveConv(uid);
    if (!convId) {
      await ctx.reply('❌ Нет активного диалога.', await mainMenu(uid));
      return;
    }

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
      await safeSendLong(ctx, result, waitMsg.message_id, { ...finalKb });

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
    }
  });

  bot.on('photo', async (ctx) => {
    const uid    = ctx.from.id;
    const convId = await getActiveConv(uid);
    if (!convId) {
      await ctx.reply('❌ Нет активного диалога.', await mainMenu(uid));
      return;
    }

    const waitMsg = await ctx.reply('🔍 Анализирую изображение…');

    try {
      const model = await getUserModel(uid);
      if (!supportsVision(model)) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        await ctx.reply(
          `⛔ Модель \`${model}\` не поддерживает анализ изображений.\nВыберите GPT-4o или GPT-5 в 🧠 Модель GPT.`,
          { parse_mode: 'Markdown', ...chatKb(convId) }
        );
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
    }
  });
};
