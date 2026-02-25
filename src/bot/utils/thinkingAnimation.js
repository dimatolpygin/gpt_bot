const THINKING_FRAMES = ['⏳', '🔄', '💭', '🤔'];
const THINKING_TIPS = [
  'Анализирую запрос...',
  'Генерирую ответ...',
  'Обрабатываю данные...',
  'Почти готово...',
];

export function startThinkingAnimation(ctx, msgId, modelName) {
  if (!modelName) return null;
  const slowModels = ['gpt-5.2-pro', 'gpt-5.2-codex', 'o1', 'o3', 'o4'];
  const isSlow = slowModels.some(m => modelName.includes(m));
  if (!isSlow) return null;

  let i = 0;
  const interval = setInterval(async () => {
    i++;
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        msgId,
        undefined,
        `${THINKING_FRAMES[i % THINKING_FRAMES.length]} <b>${modelName}</b> думает...\n` +
        `<i>${THINKING_TIPS[Math.floor(i / 2) % THINKING_TIPS.length]}</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (_) {}
  }, 4000);

  return interval;
}

export function stopThinkingAnimation(intervalId) {
  if (intervalId) clearInterval(intervalId);
}
