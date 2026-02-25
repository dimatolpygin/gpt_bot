import OpenAI from 'openai';
import { config } from '../config/index.js';
import { File } from 'node:buffer';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const SYSTEM = {
  role: 'system',
  content: 'Ты умный и полезный AI-ассистент. Отвечай на языке пользователя. Будь чётким, структурированным и содержательным.',
};

const REASONING_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.2', 'gpt-5.2-pro', 'gpt-5.2-codex'];

export const THINKING_EMOJI = {
  none:  '💭',
  low:   '🧠',
  medium:'🧠🧠',
  high:  '🧠🧠🧠',
  xhigh: '🧠⚡',
};

// Обёртка ошибок OpenAI
const wrapError = (err) => {
  if (err.status === 429) throw new Error('Превышен лимит запросов OpenAI. Подождите.');
  if (err.status === 401) throw new Error('Неверный OpenAI API ключ.');
  if (err.status === 404) throw new Error(`Модель недоступна в вашем аккаунте OpenAI.`);
  if (err.status === 400) throw new Error(`Ошибка запроса: ${err.message}`);
  throw err;
};

const normalizeHistory = (history) => history.map(m => ({ role: m.role, content: m.content }));

// ── Streaming через Responses API ──────────────────────────────────────
export const streamChat = async (messages, modelId, onChunk, onDone, options = {}) => {
  try {
    const { thinkingLevel = 'none', webSearch = false } = options;
    const model = modelId || config.OPENAI_MODEL;
    const params = {
      model,
      input: [
        { role: 'system', content: SYSTEM.content },
        ...normalizeHistory(messages),
      ],
      stream: true,
    };

    if (REASONING_MODELS.includes(model) && thinkingLevel !== 'none') {
      params.reasoning = { effort: thinkingLevel };
    }

    if (webSearch) {
      params.tools = [{ type: 'web_search_preview' }];
    }

    const stream = await openai.responses.create(params);
    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.delta?.text || '';
      if (delta) {
        fullText += delta;
        if (onChunk) await onChunk(fullText);
      }
    }
    if (onDone) await onDone(fullText);
    return fullText;
  } catch (err) {
    wrapError(err);
  }
};

// ── Web Search через Responses API ───────────────────────────────────
export const webSearchChat = async (history, modelId) => {
  try {
    const model = modelId || config.OPENAI_MODEL;
    const response = await openai.responses.create({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: [
        { role: 'system', content: SYSTEM.content },
        ...normalizeHistory(history),
      ],
    });
    return response.output_text ?? '';
  } catch (err) {
    wrapError(err);
  }
};

// ── Анализ фото (vision) ──────────────────────────────────────────────
export const analyzePhoto = async (imageUrl, caption, modelId) => {
  try {
    const model = modelId || 'gpt-4o';
    const response = await openai.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: caption || 'Подробно опиши что на этом изображении.' },
        ],
      }],
    });
    return response.choices[0]?.message?.content ?? '';
  } catch (err) {
    wrapError(err);
  }
};

const getMimeType = (fileName) => {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  const types = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    js: 'text/javascript',
    ts: 'text/typescript',
    py: 'text/x-python',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return types[ext] || 'application/octet-stream';
};

export const analyzeFile = async (fileBuffer, fileName, caption, modelId) => {
  let uploaded;
  try {
    const file = new File([fileBuffer], fileName, { type: getMimeType(fileName) });
    uploaded = await openai.files.create({ file, purpose: 'user_data' });

    const response = await openai.responses.create({
      model: modelId || 'gpt-4o',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_file', file_id: uploaded.id },
            { type: 'input_text', text: caption || 'Проанализируй этот файл и опиши его содержимое.' },
          ],
        },
      ],
    });

    return response.output_text ?? '';
  } catch (err) {
    wrapError(err);
  } finally {
    if (uploaded?.id) {
      await openai.files.del(uploaded.id).catch(() => {});
    }
  }
};
