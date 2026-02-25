import { Input } from 'telegraf';

const MAX_LEN = 4000;

export async function safeEdit(ctx, messageId, text, extra = {}) {
  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id, messageId, null,
      text,
      { parse_mode: 'Markdown', ...extra }
    );
  } catch (err) {
    if (isParseError(err)) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, messageId, null,
        stripMarkdown(text),
        { ...extra, parse_mode: undefined }
      ).catch(() => {});
    } else if (!isNotModified(err)) {
      throw err;
    }
  }
}

export async function safeReply(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, { parse_mode: 'Markdown', ...extra });
  } catch (err) {
    if (isParseError(err)) {
      return await ctx.reply(stripMarkdown(text), { ...extra, parse_mode: undefined });
    }
    throw err;
  }
}

export async function sendAsFile(ctx, text, filename = 'response.txt', caption = 'Полный ответ') {
  try {
    const buffer = Buffer.from(text, 'utf-8');
    await ctx.replyWithDocument(
      Input.fromBuffer(buffer, filename),
      { caption }
    );
  } catch (err) {
    console.error('[sendAsFile] error:', err.message);
    await safeReply(ctx, text.slice(0, MAX_LEN));
  }
}

export async function safeSendLong(ctx, text, processingMsgId = null, extra = {}) {
  if (!text) return null;
  if (text.length <= MAX_LEN) {
    if (processingMsgId) return safeEdit(ctx, processingMsgId, text, extra);
    return safeReply(ctx, text, extra);
  }

  const preview = `${text.slice(0, MAX_LEN)}\n\n_(продолжение в файле ниже)_`;
  if (processingMsgId) {
    await safeEdit(ctx, processingMsgId, preview, extra);
  } else {
    await safeReply(ctx, preview, extra);
  }
  await sendAsFile(ctx, text, 'gpt_response.txt', 'Полный ответ');
  return null;
}

const isParseError = (err) =>
  err?.message?.includes("can't parse entities")
  || err?.description?.includes("can't parse entities");

const isNotModified = (err) =>
  err?.message?.includes('message is not modified')
  || err?.description?.includes('message is not modified');

export function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^#+\s/gm, '')
    .replace(/^[-*]\s/gm, '• ')
    .trim();
}

function splitSmart(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let current = '';
  for (const para of text.split('\n\n')) {
    if ((current ? current + '\n\n' + para : para).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}
