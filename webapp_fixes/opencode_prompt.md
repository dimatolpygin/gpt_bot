# OpenCode Prompt — Fix WebApp Server Startup

## Контекст проекта
GPT Telegram Bot на Node.js 20 (ES Modules), Telegraf 4.16.3, Express 4.x, Supabase, ioredis (Upstash).
Архитектура: src/index.js → src/server.js → Express на порту 3000 + Cloudflare Tunnel.

## Проблема
После запуска `node src/index.js`:
- Выводится `[Redis] connected`
- После этого лог обрывается — строка `🌐 WebApp server...` **не появляется**
- Express на порту 3000 молча не стартует
- Cloudflare Tunnel возвращает 502 Bad Gateway

## Задачи для исправления

### 1. src/index.js — порядок запуска и обработка ошибок
- Найди вызов `startServer()` (или аналогичного инициализатора Express)
- Убедись, что он вызывается **ДО** `await bot.launch()` — `bot.launch()` блокирует event loop
- Оберни вызов в try/catch с явным выводом ошибки:

```js
try {
  await startServer();
  console.log('🌐 WebApp server started on port 3000');
} catch (err) {
  console.error('[WebApp] Failed to start server:', err);
  process.exit(1);
}

await bot.launch();
```

### 2. src/server.js — защитный try/catch и диагностика
- Оберни всё тело `startServer()` в try/catch
- Добавь логирование каждого этапа инициализации:

```js
export async function startServer() {
  try {
    console.log('[WebApp] Initializing Express...');
    const app = express();
    // ... middleware, routes ...
    await new Promise((resolve, reject) => {
      const srv = app.listen(process.env.PORT || 3000, (err) => {
        if (err) return reject(err);
        resolve();
      });
      srv.on('error', reject);
    });
    console.log('[WebApp] Express listening on port', process.env.PORT || 3000);
  } catch (err) {
    console.error('[WebApp] Startup error:', err);
    throw err;
  }
}
```

### 3. Проверить зависимости
В терминале выполни:
```bash
npm list express
npm list @supabase/supabase-js
npm list ioredis
```
Если express отсутствует — `npm install express`.

### 4. Проверить занятость порта (Windows)
```powershell
netstat -aon | findstr :3000
```
Если порт занят — убить процесс или сменить порт через `PORT=3001` в `.env`.

### 5. ES Module импорты в server.js
Убедись, что все импорты используют ESM синтаксис:
```js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
```
Никаких `require()` — проект на ES Modules (type: "module" в package.json).

### 6. Проверить .env переменные
Убедись, что в `.env` или `src/config/index.js` присутствуют:
- `PORT` (или дефолт 3000)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `BOT_TOKEN`
- `TELEGRAM_SECRET` (для HMAC валидации WebApp)

## Ожидаемый результат после фиксов
```
[Redis] connected
[WebApp] Initializing Express...
[WebApp] Express listening on port 3000
🌐 WebApp server started
[Bot] launched
```

## Что НЕ трогать
- Логику GPT стриминга (services/openai.js)
- Систему диалогов и пагинацию
- Redis processing lock (TTL 90s)
- Whitelist middleware (bot/middleware/auth.js)
- GitHub Actions CI/CD конфиг
