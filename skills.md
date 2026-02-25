# GPT Telegram Bot — Skill Summary

## Контекст проекта
- Стек: Telegraf 4 + OpenAI gpt-4o + Supabase (PostgreSQL) + Redis (ioredis) + Docker Compose.
- Бот поддерживает мультипользовательские диалоги, стриминг ответов, пагинацию и lock на Redis.
- Первичная настройка: `.env` (BOT_TOKEN, OPENAI_API_KEY, SUPABASE_URL/KEY, REDIS_URL), запуск миграций `src/db/migrations/init.sql`, `npm install`, `npm run dev`.

## Архитектура и файлы
- `src/index.js` — точка входа: dotenv + Telegraf, DNS fix, прокси (SOCKS5/HTTPS) и логика запуска.
- `src/config/index.js` — все env-константы (ключи Supabase, Redis URL, limits, allow list).
- `src/services/`:
  - `openai.js` — streamChat (с моделью), Responses API (`webSearchChat`), vision (`analyzePhoto`).
  - `supabase.js` — CRUD для users/conversations/messages (переименованы в bot_* таблицы).
  - `redis.js` — активная сессия, lock, страницы, настройки модели и Web Search toggle.
- `src/bot/handlers/` — handlers для команд (`start`, `dialogs`, `chat`, `callbacks`), включая rename, history export, Web Search toggle, photo handling.
- `src/bot/keyboards/` — main/menu dialogs/models keyboards.

## Ход работы и фичи
1. `.env` и `.env.example` расширены: прокси, WebApp `PORT/WEBAPP_URL`, ngrok-адрес, DNS IPv4-first и Redis/Upstash-конфигурация.
2. Таблицы Supabase переименованы в `bot_*`, `addMessage` сохраняет модель, и прокси агенты внедрены в `src/index.js`.
3. Диалоги теперь выводят историю (последние 10 сообщений + экспорт `.txt`), поддерживают переименование, выбор модели и Web Search toggle.
4. OpenAI-сервис и chat handler получили масштабную модернизацию: выбор модели, Responses API, анализ фото, проверка возможностей, новая Web Search клавиатура и WebApp-интеграция.
5. Появился WebApp: `src/webapp/index.html` рендерит историю (с датами и бейджами модели), `src/server.js` обслуживает `/webapp` и `/api/history`, а `skills.md` теперь описывает запуск cloudflared tunnel и кнопку «Просмотреть весь диалог».

## Процесс работы
- Файлы редактировались напрямую (`src/bot/…`, `src/services/…`, `.env`, `.env.example`, `skills.md`).
- Для проверок запускался `npm install` и `npm run dev` (nodemon). С запуском логи показывали проблемы с Telegram API, поэтому использовался SOCKS/HTTPS прокси и история логов сохранялась в `bot.log`.
- Ведётся документация архитектуры и инструкций (см. `README.md`, `OPENCODE_PROMPT.md`, `task*.txt`).

## Дополнительно (skills)
- Чтение и форматирование сообщений: Markdown-поддержка, safeEdit, chunk-splitting (max 4000).
- Интеграция с Supabase: upsert, pagination, history/notes export.
- Использование Redis для активных диалогов, locks, model settings, toggle Web Search, rename flags.
- Проксирование Telegram (SOCKS5/HTTPS) + DNS IPv4-first.
