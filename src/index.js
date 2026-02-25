import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config }        from './config/index.js';
import { redis }         from './services/redis.js';
import { upsertUser }    from './services/supabase.js';
import { authMiddleware } from './bot/middleware/auth.js';
import { setupHandlers } from './bot/handlers/index.js';
import { startServer }  from './server.js';

// ── Validate env ──────────────────────────────────────────────────────
['BOT_TOKEN', 'OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'].forEach(k => {
  if (!config[k]) throw new Error(`Missing env: ${k}`);
});

function buildAgent() {
  if (process.env.SOCKS5_PROXY) return new SocksProxyAgent(process.env.SOCKS5_PROXY);
  if (process.env.HTTPS_PROXY) return new HttpsProxyAgent(process.env.HTTPS_PROXY);
  return undefined;
}

const bot = new Telegraf(config.BOT_TOKEN, {
  telegram: { agent: buildAgent() },
  handlerTimeout: 10 * 60 * 1000,
});

// ── Middlewares ───────────────────────────────────────────────────────
bot.use(authMiddleware);

bot.use(async (ctx, next) => {
  if (ctx.from) await upsertUser(ctx.from).catch(console.error);
  return next();
});

// ── Handlers ──────────────────────────────────────────────────────────
setupHandlers(bot);

// ── Global error handler ──────────────────────────────────────────────
bot.catch((err, ctx) => {
  if (err?.name === 'TimeoutError' || err?.message?.includes('timed out')) {
    console.warn(`[Bot] handler timeout (${ctx.updateType})`);
    return;
  }
  console.error(`[Bot] unhandled error (${ctx.updateType}):`, err);
  ctx.reply('❌ Внутренняя ошибка. Попробуйте позже.').catch(() => {});
});

// ── Launch ────────────────────────────────────────────────────────────
try {
  await startServer();
  console.log('🌐 WebApp server started');
} catch (err) {
  console.error('[WebApp] Failed to start server:', err);
  process.exit(1);
}

await bot.launch({ allowedUpdates: ['message', 'callback_query'] });
console.log('🤖 Bot is running');

process.once('SIGINT',  () => { bot.stop('SIGINT');  redis.quit(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); redis.quit(); });
