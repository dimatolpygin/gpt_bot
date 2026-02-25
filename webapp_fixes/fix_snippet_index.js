// =============================================
// src/index.js — PATCH (только изменённый блок)
// =============================================
// НАЙДИ в своём index.js вызов startServer() и bot.launch()
// и замени на следующий порядок:

import { startServer } from './server.js';
import { bot } from './bot/index.js'; // путь может отличаться

async function main() {
  // 1. Redis / Supabase инициализация (если есть) — оставь как есть

  // 2. WebApp сервер — ПЕРВЫМ, до bot.launch()
  try {
    await startServer();
    console.log('🌐 WebApp server started on port', process.env.PORT || 3000);
  } catch (err) {
    console.error('[WebApp] Failed to start server:', err);
    process.exit(1); // падаем явно, не молча
  }

  // 3. Telegram Bot — ПОСЛЕДНИМ (блокирует event loop)
  await bot.launch();
  console.log('🤖 Bot launched');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
