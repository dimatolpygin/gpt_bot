import OpenAI from 'openai';
import { config }          from '../config/index.js';
import { needsMaxCompTok } from '../bot/keyboards/models.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const SYSTEM = {
  role: 'system',
  content: 'Ты умный и полезный AI-ассистент. Отвечай на языке пользователя. Будь чётким, структурированным и содержательным.',
};

// Обёртка ошибок OpenAI
const wrapError = (err) => {
  if (err.status === 429) throw new Error('Превышен лимит запросов OpenAI. Подождите.');
  if (err.status === 401) throw new Error('Неверный OpenAI API ключ.');
  if (err.status === 404) throw new Error(`Модель недоступна в вашем аккаунте OpenAI.`);
  if (err.status === 400) throw new Error(`Ошибка запроса: ${err.message}`);
  throw err;
};

// Токен-параметр по модели
const tokParam = (modelId) =>
  needsMaxCompTok(modelId)
    ? { max_completion_tokens: 4096 }
    : { max_tokens: 4096 };

// ── Обычный стриминг (chat completions) ──────────────────────────────

export const streamChat = async (history, modelId, onChunk, onDone) => {
  try {
    const model  = modelId || config.OPENAI_MODEL;
    const stream = await openai.chat.completions.create({
      model,
      messages: [SYSTEM, ...history],
      stream: true,
      ...tokParam(model),
    });

    let full = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        full += delta;
        await onChunk(full);
      }
    }
    await onDone(full);
    return full;
  } catch (err) { wrapError(err); }
};

// ── Web Search через Responses API ───────────────────────────────────

export const webSearchChat = async (history, modelId) => {
  try {
    const model    = modelId || config.OPENAI_MODEL;
    const response = await openai.responses.create({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: [
        { role: 'system', content: SYSTEM.content },
        ...history.map(m => ({ role: m.role, content: m.content })),
      ],
    });
    return response.output_text ?? '';
  } catch (err) { wrapError(err); }
};

// ── Анализ фото (vision) ──────────────────────────────────────────────

export const analyzePhoto = async (imageUrl, caption, modelId) => {
  try {
    const model    = modelId || 'gpt-4o';
    const response = await openai.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text',      text: caption || 'Подробно опиши что на этом изображении.' },
        ],
      }],
      ...tokParam(model),
    });
    return response.choices[0]?.message?.content ?? '';
  } catch (err) { wrapError(err); }
};
