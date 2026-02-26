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

const FILE_KEYWORDS = [
  'создай файл','сделай файл','сгенерируй файл','создай pdf','сделай pdf',
  'конвертируй в pdf','создай xlsx','создай csv','создай docx','сохрани в файл',
  'выгрузи в файл','скачать файл','создай таблицу','построй график','нарисуй график',
  'generate file','create file','make file','export to','save as pdf','create csv',
  'create xlsx','create chart','plot','draw chart'
];

export const needsCodeInterpreter = (text = '') => {
  const lower = text.toLowerCase();

  const hasFormat = /\b(pdf|xlsx|xls|csv|docx|doc|txt|png|svg|zip|pptx)\b/.test(lower);
  const hasAction = /(создай|создайте|сделай|сделайте|сгенерируй|сгенерируйте|напиши|напишите|выгрузи|выгрузите|конвертируй|конвертируйте|преобразуй|экспортируй|отправь|скачать|построй|нарисуй|create|generate|make|export|convert|draw|plot|build)/i.test(lower);
  const hasPhrases = /(создай(те)? файл|сделай(те)? файл|сгенерируй(те)? файл|нарисуй(те)? (диаграмму|график|таблицу)|построй(те)? график|create file|generate file|make file|draw chart|plot graph)/i.test(lower);

  return hasPhrases || (hasFormat && hasAction);
};

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

const getRetryAfter = (err) => {
  const header = err.headers?.['retry-after']
    ?? err.headers?.['Retry-After']
    ?? err?.response?.headers?.get?.('retry-after')
    ?? err?.response?.headers?.['retry-after'];
  const value = parseInt(header, 10);
  return Number.isNaN(value) ? 10 : value;
};

const withRetry = async (fn, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err.status === 429 || err.message?.includes('429');
      if (!is429 || attempt >= maxRetries - 1) throw err;
      const retryAfter = Math.min(getRetryAfter(err) * 1000, 60000);
      console.warn(`[API] 429 rate limit, retry ${attempt + 1}/${maxRetries} after ${retryAfter / 1000}s`);
      await new Promise(r => setTimeout(r, retryAfter));
    }
  }
};

// ── Streaming через Chat Completions API ─────────────────────────────────────
export const streamChat = async (messages, modelId, onChunk, options = {}) => {
  try {
    const { thinkingLevel = 'none' } = options;
    const model = modelId || config.OPENAI_MODEL;
    const hasSystem = messages.length > 0 && messages[0].role === 'system';
    const systemMessage = hasSystem ? messages[0] : { role: 'system', content: SYSTEM.content };
    const restMessages = hasSystem ? messages.slice(1) : messages;
    const payload = [systemMessage, ...restMessages];

    const params = {
      model,
      messages: payload,
      stream: true,
    };

    if (REASONING_MODELS.has(model) && thinkingLevel !== 'none') {
      params.reasoning_effort = thinkingLevel;
    }

    const stream = await withRetry(() => openai.chat.completions.create(params));
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
    const hasSystem = messages.length > 0 && messages[0].role === 'system';
    const systemMessage = hasSystem ? messages[0] : { role: 'system', content: SYSTEM.content };
    const restMessages = hasSystem ? messages.slice(1) : messages;
    const payload = [systemMessage, ...restMessages];

    const params = {
      model,
      input: payload,
      stream: true,
      tools: [{ type: 'web_search_preview' }],
    };

    if (REASONING_MODELS.has(model) && thinkingLevel !== 'none') {
      params.reasoning = { effort: thinkingLevel };
    }

    const stream = await withRetry(() => openai.responses.create(params));
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
  console.log('[CodeInterp] starting, model:', modelId);
  try {
    const response = await openai.responses.create({
      model: modelId || 'gpt-4o',
      input: messages,
      tools: [
        { type: 'code_interpreter', container: { type: 'auto' } },
      ],
      tool_choice: 'auto',
    });

    console.log('[CodeInterp] output items:', response.output?.map(i => i.type));

    const text = response.output_text || '';
    const files = [];

    const containerIds = new Set();
    for (const item of response.output || []) {
      if (item.type === 'code_interpreter_call' && item.container_id) {
        containerIds.add(item.container_id);
      }
    }

    console.log('[CodeInterp] unique container_ids:', Array.from(containerIds));

    for (const containerId of containerIds) {
      try {
        const filesList = await openai.containers.files.list(containerId);
        console.log('[CodeInterp] files in container:', filesList.data?.length || 0);

        for (const fileInfo of filesList.data || []) {
          if (fileInfo.source !== 'assistant') {
            console.log('[CodeInterp] skip user file:', fileInfo.path);
            continue;
          }

          if (!fileInfo.bytes) {
            console.warn('[CodeInterp] bytes: null for file:', fileInfo.path, '(likely non-ASCII filename)');
          }

          try {
            const fileContent = await openai.containers.files.content.retrieve(
              containerId,
              fileInfo.id
            );

            const buffer = Buffer.from(await fileContent.arrayBuffer());
            if (buffer.length === 0) {
              console.warn('[CodeInterp] empty buffer for:', fileInfo.path);
              continue;
            }
            const filename = fileInfo.path.replace(/^\/mnt\/data\//, '') || `file_${Date.now()}.txt`;
            console.log('[CodeInterp] file ready:', filename, buffer.length, 'bytes');
            files.push({ name: filename, buffer });
          } catch (downloadErr) {
            console.error('[CodeInterp] file download error:', downloadErr.message);
          }
        }
      } catch (listErr) {
        console.error('[CodeInterp] container files.list error:', listErr.message);
      }
    }

    console.log('[CodeInterp] done, files:', files.length);
    return { text, files };
  } catch (err) {
    wrapError(err);
  }
};

export const transcribeVoice = async (audioBuffer, options = {}) => {
  const {
    fileName = 'voice_message.ogg',
    contentType = 'audio/ogg',
    language = 'auto',
  } = options;

  const transcription = await openai.audio.transcriptions.create({
    file: new File([audioBuffer], fileName, { type: contentType }),
    model: 'whisper-1',
    language,
  });

  return transcription?.text ?? '';
};

export { openai };

export async function generateImage(prompt, size = '1024x1024') {
  console.log('[Image] generating:', prompt.slice(0, 80));

  const response = await openai.images.generate({
    model: 'gpt-image-1.5',
    prompt,
    n: 1,
    size,
    quality: 'medium',
    output_format: 'png',
  });

  const item = response.data?.[0];
  if (!item) throw new Error('No image data');
  if (item.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item.url) {
    const res = await fetch(item.url);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('No image data in response');
}
