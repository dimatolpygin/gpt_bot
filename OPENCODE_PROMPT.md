# OpenCode Prompt — GPT Telegram Bot

## Контекст проекта

Node.js Telegram-бот на Telegraf v4 с GPT-стримингом, Supabase (PostgreSQL) и Redis.

**Стек:**
- `telegraf` ^4.16.3 — Telegram Bot API
- `openai` ^4.28.0 — GPT-4o с потоковой передачей
- `@supabase/supabase-js` ^2.39.0 — база данных
- `ioredis` ^5.3.2 — кэш, сессии, processing lock
- ES Modules (`"type": "module"`)
- Node.js 20+

## Архитектура

```
src/
├── index.js                  # Точка входа, middlewares, запуск
├── config/index.js           # Все настройки из process.env
├── services/
│   ├── openai.js             # streamChat() — стриминг ответов GPT
│   ├── supabase.js           # CRUD: users, conversations, messages
│   └── redis.js              # getActiveConv, setActiveConv, isProcessing, setProcessing
├── bot/
│   ├── middleware/auth.js    # Whitelist фильтр
│   ├── handlers/
│   │   ├── index.js          # Регистрация всех handlers
│   │   ├── start.js          # /start, /menu, /new, /dialogs, /help
│   │   ├── dialogs.js        # showDialogs, openDialog, createNewDialog
│   │   ├── chat.js           # bot.on('text') → GPT streaming
│   │   └── callbacks.js      # Все inline callback_query actions
│   └── keyboards/
│       ├── main.js           # mainMenu()
│       └── dialogs.js        # dialogsKb(), chatKb(), delConfirmKb()
└── db/migrations/init.sql    # Supabase схема (выполнить вручную)
```

## База данных (Supabase)

Три таблицы: `users`, `conversations`, `messages`.
`conversations.user_id` — это `telegram_id` пользователя.
`messages.role` ∈ `{user, assistant, system}`.

## Ключевая логика

1. **Мультипользователь**: `user_id = ctx.from.id` везде, запросы изолированы.
2. **Активный диалог**: хранится в Redis (`u:{uid}:conv`). При смене темы — обновляем.
3. **Стриминг**: `streamChat()` вызывает `onChunk` каждые ~800 мс, `onDone` — финальный текст.
4. **Processing lock**: `u:{uid}:busy` в Redis TTL 90s — защита от дублей.
5. **Авто-заголовок**: первое сообщение пользователя → заголовок диалога.
6. **Пагинация**: `DIALOGS_PER_PAGE=5`, callback `dialogs:{page}`.

## Что нужно сделать

1. Убедись, что `.env` заполнен (BOT_TOKEN, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY).
2. В Supabase SQL Editor выполни `src/db/migrations/init.sql`.
3. Установи зависимости: `npm install`
4. Запусти: `npm run dev` (локально) или `docker compose up -d` (сервер).

## Правила при изменении кода

- Всегда `async/await`, не смешивать с `.then()`.
- `ctx.from.id` — Telegram user ID (число), использовать везде как `uid`.
- `ctx.answerCbQuery()` вызывать в `callbacks.js`, не внутри helper-функций.
- Ловить ошибку "message is not modified" при `editMessageText`.
- При ошибке парсинга Markdown — повторить запрос без `parse_mode`.
- Markdown в Telegram: **bold** = `*text*`, `inline code` = \`code\`.

## Git workflow

```
git checkout dev
# разработка и тесты
git merge dev main
git push origin main
# → GitHub Actions деплоит на сервер через SSH
```
