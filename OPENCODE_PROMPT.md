# OpenCode Prompt — GPT Telegram Bot

## Контекст проекта

Telegram-бот на Telegraf v4, который общается с OpenAI (GPT-4o / GPT-5) в стриминге, хранит диалоги в Supabase и использует Redis как быстрый хранилище состояния.

**Стек:** Node 20+, ES Modules, `telegraf`, `openai`, `@supabase/supabase-js`, `ioredis`, `express`, `dotenv`.

## Архитектура

```
src/
├── index.js               # точка входа: авторизация, bot.launch, Express WebApp server
├── config/index.js        # конфиг из process.env
├── server.js              # `/webapp` + `/api/history` + Telegram WebApp validation
├── services/
│   ├── openai.js          # streamChat/webSearchChat, codeInterpreter, generateImage, transcribeVoice, mdToHtml
│   ├── supabase.js        # users/conversations/messages/prompts helpers
│   └── redis.js           # conv/model/processing locks/prompt state/thinking/web-search toggle
├── bot/
│   ├── middleware/auth.js # whitelist (ALLOWED_USERS)
│   ├── handlers/
│   │   ├── start.js       # /start /menu /new /dialogs /help
│   │   ├── dialogs.js     # отображение списков/историй
│   │   ├── chat.js        # message/video/image → GPT / code-interpreter / Whisper / image generation
│   │   └── callbacks.js   # inline action handlers (с safeAnswerCbQuery)
│   └── keyboards/
│       ├── main.js        # главное меню (📚 Промты, Мышление и т.п.)
│       ├── dialogs.js     # клавиатуры диалогов
│       └── models.js      # список моделей + capability map
├── bot/utils/
│   ├── format.js          # Markdown → HTML
│   ├── thinkingAnimation.js# slow-model spinner
│   ├── imageDetect.js     # детект на запрос картинки
└── webapp/index.html      # статический интерфейс истории (markdown → html)
```

## Supabase

Таблицы: `bot_users`, `bot_conversations`, `bot_messages`, `user_prompts`.
`user_prompts` хранит `name`, `content`, `is_active` и позволяет переключаться на активный системный промт.
Ещё есть вспомогательные views (init.sql применить вручную при первом запуске).

## Ключевые фичи

1. **Redis-статусы**: `conv:{uid}`, `model:{uid}`, `lock:{uid}`, `wsearch:{uid}`, `prompt_add_state:{uid}`, `thinking:{uid}`.
2. **Промты**: кнопка `📚 Промты` открывает список, позволяет выбрать/добавить/удалить, активный промт инжектится перед первым system-а.
3. **Автогенерация изображений**: `imageDetect` ловит «нарисуй», GPT-4o-mini оптимизирует промт → `generateImage` (gpt-image-1.5/1) возвращает PNG.
4. **Голос**: `transcribeVoice` (Whisper) → текст и `processUserText` переиспользует логику chat.
5. **Code interpreter**: ловим `needsCodeInterpreter`, всегда используем `gpt-4o` и retry на 429, отправляем файлы.
6. **HTML-ответы**: `mdToHtml` → `safeSendLong` → `parse_mode: 'HTML'`, `fetch` с Markdown теперь безопасно отображает bold/code/link.
7. **WebApp**: Express обрабатывает `/webapp` и `/api/history`, WebApp рендерит markdown/scroll и требует `WEBAPP_URL`/`TELEGRAM_INIT_DATA`.

## Что сделать при локальной разработке

1. Скопируй `.env.example` → `.env` и заполни `BOT_TOKEN`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `REDIS_URL`, `WEBAPP_URL`.
2. Выполни миграцию `src/db/migrations/init.sql` в Supabase (ручной запуск через SQL Editor).
3. Установи зависимости `npm install`.
4. Запусти `npm run dev` (или `./setup.sh` + `docker compose up -d` для докерной среды).

## Процесс изменений

- Всегда `await`. Не миксуй `then` и `await`.
- `ctx.from.id` сохраняем как `uid`, используем для Redis/Supabase.
- `safeAnswerCbQuery` и `bot.catch` игнорируют просроченные callback query и таймауты.
- `safeSendLong` уже форматирует Markdown → HTML.
- Markdown-правила: `*bold*`, `_italic_`, `` `inline` ``, triple ```code```.

## Git workflow

```
git checkout dev        # работа
git merge dev main      # только по согласованию
git push origin main    # main — стабильный
```

Пока нет CI/CD: пуш в `main` делает человек, автодеплой отсутствует (скрипт `setup.sh` можно использовать для ручного развертывания).
