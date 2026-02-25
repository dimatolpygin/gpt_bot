import OpenAI from 'openai';
import { config } from '../config/index.js';
import { File } from 'node:buffer';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const SYSTEM = {
  role: 'system',
  content: 'Ты умный и полезный AI-ассистент. Отвечай на языке пользователя. Будь чётким, структурированным и содержательным.',
};

const REASONING_MODELS = new Set([
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
  'gpt-5.2', 'gpt-5.2-pro',
]);

export const THINKING_EMOJI = {
  none:  '💭',
  low:   '🧠',
  medium:'🧠🧠',
  high:  '🧠🧠🧠',
  xhigh: '🧠⚡',
};

const wrapError = (err) => {
  if (err.status === 429) throw new Error('Превышен лимит запросов OpenAI. Подождите.');
  if (err.status === 401) throw new Error('Неверный OpenAI API ключ.');
  if (err.status === 404) throw new Error(`Модель недоступна в вашем аккаунте OpenAI.`);
  if (err.status === 400) throw new Error(`Ошибка запроса: ${err.message}`);
  throw err;
};

// ── Streaming через Chat Completions API ─────────────────────────────────────
export const streamChat = async (messages, modelId, onChunk, options = {}) => {
  try {
    const { thinkingLevel = 'none' } = options;
    const model = modelId || config.OPENAI_MODEL;
    const payload = [
      { role: 'system', content: SYSTEM.content },
      ...messages,
    ];

    const params = {
      model,
      messages: payload,
      stream: true,
    };

    if (REASONING_MODELS.has(model) && thinkingLevel !== 'none') {
      params.reasoning_effort = thinkingLevel;
    }

    const stream = await openai.chat.completions.create(params);
    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        fullText += delta;
        if (onChunk) await onChunk(delta, fullText);
      }
    }
    return fullText;
  } catch (err) {
    wrapError(err);
  }
};

// ── Streaming с веб-поиском (Responses API) ──────────────────────────────────
export const webSearchChat = async (messages, modelId, onChunk, options = {}) => {
  try {
    const { thinkingLevel = 'none' } = options;
    const model = modelId || config.OPENAI_MODEL;
    const payload = [
      { role: 'system', content: SYSTEM.content },
      ...messages,
    ];

    const params = {
      model,
      input: payload,
      stream: true,
      tools: [{ type: 'web_search_preview' }],
    };

    if (REASONING_MODELS.has(model) && thinkingLevel !== 'none') {
      params.reasoning = { effort: thinkingLevel };
    }

    const stream = await openai.responses.create(params);
    let fullText = '';
    for await (const event of stream) {
      const delta = event?.delta?.text ?? event?.delta ?? '';
      if (typeof delta === 'string' && delta) {
        fullText += delta;
        if (onChunk) await onChunk(delta, fullText);
      }
    }
    return fullText;
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

export const codeInterpreterChat = async (messages, modelId) => {
  try {
    const response = await openai.responses.create({
      model: modelId || 'gpt-4o',
      input: messages,
      tools: [
        { type: 'code_interpreter', container: { type: 'auto' } },
      ],
      tool_choice: 'auto',
    });

    const text = response.output_text || '';
    const files = [];

    for (const item of response.output || []) {
      if (item.type === 'code_interpreter_call') {
        for (const out of item.outputs || []) {
          if (out.type === 'file' && out.file_id) {
            try {
              const fileData = await openai.files.content(out.file_id);
              const buffer = Buffer.from(await fileData.arrayBuffer());
              const filename = out.filename || `output_${out.file_id.slice(-6)}.txt`;
              files.push({ name: filename, buffer });
              await openai.files.del(out.file_id).catch(() => {});
            } catch (e) {
              console.error('[CodeInterp] file download error:', e.message);
            }
          }
        }
      }
    }

    return { text, files };
  } catch (err) {
    wrapError(err);
  }
};
