import express    from 'express';
import crypto     from 'crypto';
import path       from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { getConvById, getMessages, getTemplates } from './services/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
app.use(express.json());

// Serve WebApp static
app.use('/webapp', express.static(path.join(__dirname, 'webapp')));

// Gallery WebApp
app.get('/gallery', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src', 'webapp', 'gallery.html'));
});

// Templates API
app.get('/api/templates', async (req, res) => {
  try {
    const templates = await getTemplates();
    res.json({ ok: true, data: templates });
  } catch (err) {
    console.error('[API /templates]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Validate Telegram WebApp initData ────────────────────────────────────────
function validateInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash   = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataStr = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secret  = crypto.createHmac('sha256', 'WebAppData')
                          .update(config.BOT_TOKEN).digest();
    const computed = crypto.createHmac('sha256', secret)
                           .update(dataStr).digest('hex');

    if (computed !== hash) return null;

    const userStr = params.get('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch { return null; }
}

// ── GET /api/history ─────────────────────────────────────────────────────────
app.post('/api/history', async (req, res) => {
  try {
    const { convId, initData } = req.body;

    if (!convId || !initData) {
      return res.status(400).json({ error: 'Нет convId или initData' });
    }

    const user = validateInitData(initData);
    if (!user) return res.status(403).json({ error: 'Неверная подпись Telegram' });

    const conv = await getConvById(parseInt(convId), user.id);
    if (!conv) return res.status(404).json({ error: 'Диалог не найден' });

    const messages = await getMessages(parseInt(convId), 500);
    return res.json({ title: conv.title, messages });

  } catch (e) {
    console.error('[API] error:', e.message);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
});

export const startServer = async () => {
  const port = config.PORT || 3000;
  const webappUrl = config.WEBAPP_URL.replace(/\/+$/, '') + '/webapp';
  console.log('[WebApp] Initializing Express...');
  try {
    await new Promise((resolve, reject) => {
      const server = app.listen(port, (err) => {
        if (err) return reject(err);
        console.log(`[WebApp] Express listening on port ${port}`);
        resolve();
      });
      server.on('error', (err) => reject(err));
    });
    console.log(`[WebApp] WebApp server ready at ${webappUrl}`);
  } catch (err) {
    console.error('[WebApp] Startup error:', err);
    throw err;
  }
};
