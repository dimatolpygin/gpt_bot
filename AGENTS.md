# AGENTS

## Overview
- This document briefs any agentic contributor on how to bootstrap, inspect, and extend the Telegram bot without guesswork.
- Treat it as the go-to checklist before touching bot logic, middleware, hosting, or the tiny Express server that powers the web view.
- It bundles commands, environment rules, code-style expectations, and notes about tooling (Cursor/Copilot) for consistent work.
- Nothing here is secret; keep it in sync with README.md and package.json whenever new scripts or requirements land.

## Build & Run
- `npm install` installs both production and dev dependencies; run it once after cloning or when package-lock.json changes.
- `npm run dev` wraps `nodemon --watch src src/index.js`, so local dev watches every source file and restarts the bot automatically.
- `npm start` spins up the compiled bot with Node 20+; use this after building or for production-equivalent launches.
- The bot entry (`src/index.js`) bootstraps Telegraf with proxy support, injects middleware, and launches the Express server afterward.
- `docker compose up -d` brings up the bot, Redis, and Supabase helpers as defined in docker-compose.yml; rely on it for production-like environments.
- Before running locally or inside Docker, apply the Supabase SQL migration at `src/db/migrations/init.sql` via the Supabase dashboard.
- Any time you change `.env.example`, propagate updates into `.env` and call `npm install` if new dependencies appear.
- The Telegram bot depends on Redis and Supabase connections, so confirm `REDIS_URL`, `SUPABASE_URL`, and `SUPABASE_KEY` resolve before launching.
- `src/server.js` exposes `/api/history`; ensure this service is reachable from the WebApp either via `WEBAPP_URL` or the proxy path configured upstream.
- `startServer()` is invoked after `bot.launch()` and logs the WebApp URL; do not remove, or the static web interface will not respond.

## Testing
- No automated tests are checked in yet, so there is currently no `npm run test` to execute.
- If a single-test command appears later, document it here as “Single test command: `npm run test:foo`” so future agents can run it directly.
- For now, rely on manual flows: send `/dialogs`, create a conversation via `/new`, and ensure the WebApp history works via `http://localhost:3000/webapp`.

## Environment & Secrets
- Node 20+ is required (see `package.json`).
- Required env vars: `BOT_TOKEN`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`; the bot refuses to start without them thanks to the early check in `src/index.js`.
- Optional but supported env vars: `REDIS_URL`, HTTP/S proxy vars (`SOCKS5_PROXY`, `HTTPS_PROXY`), `WEBAPP_URL`, `PORT`, `OPENAI_MODEL`, `ALLOWED_USERS`, and toggles like `REDIS_URL` defaults.
- `ALLOWED_USERS` is read as a comma-separated list of Telegram IDs and coerced into integers; keep strings numeric to avoid parsing hiccups.
- Proxy logic picks a `SocksProxyAgent` before a `HttpsProxyAgent` so specify only one as needed.
- `config` centralizes defaults (see `src/config/index.js`), so add any new constants there before referencing them elsewhere.
- Keep secrets out of the repo—there is no `.env` version control; copy `.env.example` and fill in the values locally.

## Project Layout
- `src/index.js` orchestrates bootstrapping: environment validation, middleware injection, handler setup, and server start.
- `src/server.js` is a minimalist Express app with `/api/history` and the Telegram WebApp validation logic.
- `src/config` defines runtime constants; add keys there so everyone has a single source of truth for defaults.
- `src/services` splits Redis (`redis.js`) and Supabase (`supabase.js`) helpers; keep each helper pure and export it via `export const`.
- `src/bot` branches into `handlers` (modules that bind Telegraf commands) and `middleware` (auth guard, logging, etc.).
- `src/webapp/index.html` is a static client that fetches `/api/history` and renders messages; treat it as the only frontend asset.
- `src/db/migrations` holds schema SQL; running the init migration is mandatory before the bot can persist users or dialogs.

## Code Style Guidelines
- **Imports**: always use ESM `import` statements. Group them by origin (node built-ins first, third-party packages next, then local files). Align spacing inside curly braces when helpful (see `src/index.js` and `server.js`).
- **Exports**: favor named exports (`export const foo = () => {}`) instead of default exports so tooling can tree-shake predictably.
- **Objects & Configs**: align key-values vertically within objects (`config`, DTO payloads). Prefer uppercased constants for config keys (e.g., `BOT_TOKEN`, `STREAM_THROTTLE`).
- **Naming**: use camelCase for functions and helper variables, PascalCase for classes (there are none yet), and ALL_CAPS only for static config keys or TTL values.
- **Formatting**: two-space indentation is the norm across JS and HTML; keep line lengths readable (~100 chars). Section comments use the visual bars (`// ── ... ──`).
- **Async Handling**: always await Promises in `async` functions. When calling Supabase/Redis helpers, check `error` and `throw` immediately after, as seen in every service method.
- **Error Propagation**: do not swallow errors silently—log them with `console.error('[Context] message:', err.message)` before rethrowing if the caller should see the failure.
- **Telegram Replies**: when you send replies with `ctx.reply(...)`, append `.catch(() => {})` to avoid unhandled rejections caused by deleted chats (see `auth.js` and `bot.catch`).
- **Dynamic Imports**: lazily import heavy handlers (dialogs) inside command callbacks to keep startup fast (see `setupStart` commands).
- **Whitespace**: keep blank lines around logical blocks but don’t add extra vertical space inside short functions.
- **Inline Comments**: use compact explanations for unusual steps (e.g., `ctx.callbackQuery = null;` to treat buttons as plain commands).

## Formatting & Patterns
- Always surround string interpolation that spans multiple lines with template literals for readability (used in `/help` handler).
- Prefer `Math.min` or helper functions when computing capped TTLs (as done in `redis.retryStrategy`).
- For array filters/from-s). use `Array.prototype.filter(Boolean)` to drop undefined values, like when parsing `ALLOWED_USERS`.
- Use `JSON.stringify` with explicit MIME headers in fetch bodies for the WebApp (`Content-Type: application/json`).
- `fetch` and `express` responses should check `res.ok`/`status` and return meaningful error payloads (`{ error: '...' }`).
- Always parse numbers explicitly (`parseInt(convId)`) when working with IDs or pagination values.

## Error Handling & Logging
- Log high-level failures with context: `[Bot]`, `[Redis]`, `[API]` prefixes keep runtime logs scannable.
- After logging errors, return guard responses (HTTP 400/403/404/500 with JSON) so clients can show actionable messages.
- For Supabase helpers, throw `error` right after the request when `error` exists; let the caller decide how to reply to Telegram or HTTP.
- Use `ctx.reply(...).catch(() => {})` when telling users about access denial or unexpected failures, since replies can fail when chat history is missing.
- The global `bot.catch` picks up unhandled errors from any handler and notifies the user about internal problems.
- Redis helpers return Promises; let the calling code `await` them and rely on `ioredis` retry logic configured via `retryStrategy`.
- When toggling feature flags (web search), always read the current state first and then flip it—replicate the `toggleWebSearch` pattern.

## Runtime & Architecture Notes
- `Telegraf` is the heart of the bot; use `bot.use(...)` to register middleware before handlers, as seen in `src/index.js` (auth + `upsertUser`).
- `upsertUser` touches Supabase, so wrap it in `catch(console.error)` in middleware to keep the bot responsive even if Supabase is down.
- `startServer()` runs after the bot to keep the Express app alert; do not start the web server before bot launch to avoid race conditions.
- Configuration defaults cover paging (`DIALOGS_PER_PAGE`), history limits (`MAX_HISTORY`), throttling (`STREAM_THROTTLE`), and lock TTLs (`PROCESSING_TTL`).
- Redis stores per-user state under keys like `u:{id}:conv`; follow this namespace when adding new data for consistency.
- Conversations and messages live in Supabase tables `bot_conversations` and `bot_messages`; keep helper names close to their actions (`createConv`, `addMessage`).

## WebApp Behavior
- The static `src/webapp/index.html` downloads Telegram history from `/api/history`; it runs entirely in the browser with no bundler.
- Use Telegram WebApp props (`tg.initData`) to validate the request server-side before servicing history.
- Format timestamps via `toLocaleString('ru-RU', {...})` when displaying them in the WebApp; keep the `fmt` helper there for consistency.
- WebApp CSS relies on variables like `--tg-theme-bg-color`; don’t hardcode colors that could clash with Telegram themes.
- The page renders spinner and state cards when loading/failing; follow the same structure when adding new UI states.
- Always scroll to the bottom after rendering messages to ensure the latest reply is visible to users running the WebApp.
- When the WebApp encounters errors, replace the message list with a `.state` element showing the issue (see `load()` catch block).

## Redis & Supabase Helper Practices
- Redis exports (`getActiveConv`, `setActiveConv`, `setProcessing`, etc.) should remain small and descriptive so they can be reused anywhere.
- Set TTLs explicitly (`EX 86400`, `EX 3600`) so keys expire predictably—never rely on default expirations.
- When deleting keys (`setActiveConv` when `convId` is null), use `redis.del(...)` and `return` the Promise so callers can wait for the cleanup.
- Supabase helpers prefer `.select().single()` when one row is expected; use `.range()` with `limit` when paginating message histories.
- Keep Supabase errors surfaced; helper callers (dialogs, API) will handle user-facing text or HTTP statuses.
- Add new helpers only when there is shared behavior, and keep them grouped in their respective service files to avoid circular dependencies.

## Cursor & Copilot Rules
- This repo currently lacks `.cursor` or `.cursorrules` directories, so no Cursor-specific guardrails need copying into AGENTS.md.
- There is also no `.github/copilot-instructions.md`; assume Copilot has no special directives here until one appears.
- If such rule files show up later, duplicate their key points here so autonomous agents always have the latest instructions.

## Next Steps for Agents
- Verify env vars before launching; missing credentials halt startup with a clear error.
- Run `npm run dev` locally whenever you plan to test handler logic, and use `docker compose up -d` for staging-like checks.
- Add new commands or helpers in the existing folder structure, keeping naming and formatting consistent with this guide.
- Update this AGENTS.md whenever you add tests, new commands, or modify architecture-critical behavior.
- Work in the `dev` branch by default; do not merge into `main` without explicit permission from the project owner.
- Thanks for keeping the bot stable—please double-check the README/OPENCODE_PROMPT when in doubt.
