import { Markup } from 'telegraf';
import { config } from '../../config/index.js';

/** Paginated list of dialogs */
export const dialogsKb = (conversations, page, total) => {
  const totalPages = Math.ceil(total / config.DIALOGS_PER_PAGE) || 1;
  const rows = [];

  for (const c of conversations) {
    const label = c.title.length > 32 ? c.title.slice(0, 32) + '…' : c.title;
    rows.push([Markup.button.callback(`📂 ${label}`, `open:${c.id}`)]);
  }

  // Pagination row
  const nav = [];
  if (page > 0)             nav.push(Markup.button.callback('◀️', `dialogs:${page - 1}`));
  if (totalPages > 1)       nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'noop'));
  if (page < totalPages - 1) nav.push(Markup.button.callback('▶️', `dialogs:${page + 1}`));
  if (nav.length) rows.push(nav);

  rows.push([Markup.button.callback('➕ Новый диалог', 'new_dialog')]);
  rows.push([Markup.button.callback('🏠 Меню', 'main_menu')]);

  return Markup.inlineKeyboard(rows);
};

/** Keyboard shown inside an active dialog */
export const chatKb = (convId, wsEnabled = false) => {
  const wsLabel = wsEnabled ? '🌐 Web Search: вкл ✅' : '🌐 Web Search: выкл';
  return Markup.inlineKeyboard([
    [Markup.button.callback('🗑 Удалить диалог', `del_ask:${convId}`)],
    [Markup.button.callback('✏️ Переименовать', `rename:${convId}`)],
    [Markup.button.callback('◀️ К диалогам', 'dialogs:0')],
    [Markup.button.callback('🏠 Меню', 'main_menu')],
    [Markup.button.callback(wsLabel, `toggle_ws:${convId}`)],
  ]);
};

/** Delete confirmation */
export const delConfirmKb = (convId) =>
  Markup.inlineKeyboard([[
    Markup.button.callback('✅ Удалить', `del_ok:${convId}`),
    Markup.button.callback('❌ Отмена',  `open:${convId}`),
  ]]);
