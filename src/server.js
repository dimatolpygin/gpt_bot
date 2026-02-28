import express    from 'express';
import crypto     from 'crypto';
import path       from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { redis } from './services/redis.js';
import { getBot } from './services/botInstance.js';
import { getConvById, getMessages, getTemplates, getTemplateById } from './services/supabase.js';

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

// Template selection from Gallery WebApp
app.post('/api/template-select', async (req, res) => {
  const { templateId, initData } = req.body;
  const user = validateInitData(initData);
  if (!user) return res.status(403).json({ ok: false, error: 'Invalid auth' });
  const uid = user.id;

  try {
    const tpl = await getTemplateById(templateId);
    if (!tpl) return res.status(404).json({ ok: false, error: 'Template not found' });

    const nbKeys = ['state','model','mode','resol','size','photos','template_mode','template_prompt','template_name'];
    for (const k of nbKeys) await redis.del(`nb:${uid}:${k}`);

    await redis.set(`nb:${uid}:template_prompt`, tpl.promt        || '', 'EX', 3600);
    await redis.set(`nb:${uid}:template_name`,   tpl.name_batton  || '', 'EX', 3600);
    await redis.set(`nb:${uid}:template_mode`,   'template',           'EX', 3600);
    await redis.set(`nb:${uid}:mode`,            'img2img',            'EX', 600);
    await redis.set(`nb:${uid}:state`,           'await_photo',        'EX', 600);

    const bot = getBot();
    const lines = [
      `✅ Шаблон: <b>${tpl.name_batton}</b>`,
      tpl.caption ? `<i>${tpl.caption}</i>` : null,
      '',
      '📸 Отправь своё фото для создания образа:',
    ].filter(l => l !== null);
    const caption = lines.join('\n');
    const kb = { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'nb_cancel' }]] };
    const msgOpts = { caption, parse_mode: 'HTML', reply_markup: kb };

    if (tpl.LINK) {
      await bot.telegram.sendPhoto(uid, tpl.LINK, msgOpts)
        .catch(() => bot.telegram.sendMessage(uid, caption, { parse_mode: 'HTML', reply_markup: kb }));
    } else {
      await bot.telegram.sendMessage(uid, caption, { parse_mode: 'HTML', reply_markup: kb });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/template-select]', err.message);
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
