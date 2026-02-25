// =============================================
// src/server.js — PATCH (startServer function)
// =============================================
import express from 'express';
import { createHmac } from 'crypto';
// добавь остальные импорты из своего server.js

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- HMAC валидация Telegram initData ---
function validateTelegramWebAppData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return expectedHash === hash;
}

// --- Маршруты ---
app.get('/webapp', (req, res) => {
  res.sendFile('index.html', { root: './src/webapp' });
});

app.get('/api/history', async (req, res) => {
  try {
    const { initData, conversationId } = req.query;
    if (!validateTelegramWebAppData(initData, process.env.BOT_TOKEN)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }
    // ... твоя логика получения истории из Supabase ...
    res.json({ messages: [] });
  } catch (err) {
    console.error('[API] /api/history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Главная функция запуска ---
export async function startServer() {
  console.log('[WebApp] Initializing Express...');

  return new Promise((resolve, reject) => {
    const port = process.env.PORT || 3000;
    const server = app.listen(port, (err) => {
      if (err) {
        console.error('[WebApp] listen error:', err);
        return reject(err);
      }
      console.log(`[WebApp] Express listening on port ${port}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[WebApp] Port ${port} already in use! Kill the process or change PORT in .env`);
      }
      reject(err);
    });
  });
}
