import { Markup } from 'telegraf';

// Флаги:
// chat       — поддерживает v1/chat/completions
// vision     — поддерживает изображения
// webSearch  — поддерживает Responses API web_search_preview
// maxCompTok — нужен max_completion_tokens вместо max_tokens
export const MODELS = [
  { id: 'gpt-4o',        label: 'GPT-4o',          chat: true,  vision: true,  webSearch: true,  maxCompTok: false, reasoning: false },
  { id: 'gpt-4o-mini',   label: 'GPT-4o Mini',     chat: true,  vision: true,  webSearch: true,  maxCompTok: false, reasoning: false },
  { id: 'gpt-5',         label: 'GPT-5',            chat: true,  vision: true,  webSearch: true,  maxCompTok: true,  reasoning: true  },
  { id: 'gpt-5.2',       label: 'GPT-5.2',          chat: true,  vision: true,  webSearch: true,  maxCompTok: true,  reasoning: true  },
  { id: 'gpt-5.2-pro',   label: 'GPT-5.2 Pro',     chat: true,  vision: true,  webSearch: true,  maxCompTok: true,  reasoning: true  },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex',   chat: false, vision: false, webSearch: false, maxCompTok: false, reasoning: true  },
  { id: 'gpt-5-mini',    label: 'GPT-5 Mini',       chat: true,  vision: false, webSearch: false, maxCompTok: true,  reasoning: true  },
  { id: 'gpt-5-nano',    label: 'GPT-5 Nano',       chat: true,  vision: false, webSearch: false, maxCompTok: true,  reasoning: true  },
];

// Хелперы — принимают строку modelId
export const getModelMeta   = (id) => MODELS.find(m => m.id === id) ?? MODELS[0];
export const supportsChat   = (id) => getModelMeta(id).chat;
export const supportsVision = (id) => getModelMeta(id).vision;
export const supportsWS     = (id) => getModelMeta(id).webSearch;
export const needsMaxCompTok = (id) => getModelMeta(id).maxCompTok;
export const supportsReasoning = (id) => getModelMeta(id).reasoning;

export const modelsKb = (currentModel) => {
  const rows = MODELS.map(m => {
    const tags = [
      !m.chat      ? '⛔'  : '',
      m.vision     ? '👁'  : '',
      m.webSearch  ? '🌐'  : '',
    ].filter(Boolean).join('');

    const prefix = m.id === currentModel ? '✅ ' : '';
    return [Markup.button.callback(
      `${prefix}${m.label} ${tags}`.trim(),
      `set_model:${m.id}`
    )];
  });
  rows.push([Markup.button.callback('◀️ Назад', 'main_menu')]);
  return Markup.inlineKeyboard(rows);
};
