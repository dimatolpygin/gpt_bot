import express    from 'express';
import crypto     from 'crypto';
import path       from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { redis } from './services/redis.js';
import { getBot } from './services/botInstance.js';
import { getConvById, getMessages, getTemplates, getTemplateById } from './services/supabase.js';
import { adminListContent, adminUpdateContent,
         adminListPrices,  adminUpdatePrice,
         adminListTariffs, adminUpdateTariff,
         resolveAdminRole, roleAtLeast, logAdminAction,
         adminListUsers, adminBanUser, adminUnbanUser,
         adminResetUserSettings, adminDeleteUserDialogs,
         adminAdjustTokens, adminListTokenTransactions,
         adminReorderTariffs, adminTopReferrers,
         adminUserReferrals, adminListPurchases,
         adminListAudit, adminListAdmins, adminUpsertAdmin,
         adminDeleteAdmin,
         adminFindUser } from './services/supabase_admin.js';

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

// ─── Admin WebApp & API ─────────────────────────────────────────────
const requireAdmin = async (req, res, minRole = 'moderator') => {
  const { initData } = req.body || {};
  const user = validateInitData(initData);
  if (!user) {
    res.status(403).json({ ok: false, error: 'Invalid auth' });
    return null;
  }

  let role = 'none';
  try {
    role = await resolveAdminRole(user.id);
  } catch (err) {
    console.error('[Admin] role resolve error:', err.message);
    res.status(500).json({ ok: false, error: 'Role resolve failed' });
    return null;
  }

  if (!roleAtLeast(role, minRole)) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return null;
  }

  return { user, role };
};

const parsePage = (raw) => Math.max(0, parseInt(raw, 10) || 0);
const parseLimit = (raw, fallback = 20, max = 100) => {
  const value = parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
};

const clearUserRedisState = async (userId) => {
  const uid = parseInt(userId, 10);
  if (!uid) return;
  const keys = [
    `u:${uid}:conv`,
    `u:${uid}:page`,
    `u:${uid}:busy`,
    `u:${uid}:model`,
    `u:${uid}:websearch`,
    `think:${uid}`,
  ];

  const nbPattern = `nb:${uid}:*`;
  const vidPattern = `vid:${uid}:*`;
  const [nbKeys, vidKeys] = await Promise.all([
    redis.keys(nbPattern),
    redis.keys(vidPattern),
  ]);

  const all = [...keys, ...nbKeys, ...vidKeys];
  if (all.length) await redis.del(...all);
};

app.get('/admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src', 'webapp', 'admin.html'));
});

app.post('/api/admin/content/list', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const items = await adminListContent();
    res.json({ ok:true, items });
  } catch (err) {
    console.error('[API admin content list]', err.message);
    res.status(500).json({ ok:false, error:err.message });
  }
});

app.post('/api/admin/content/update', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'owner');
    if (!auth) return;
    const { key, text } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, error:'key required' });
    const before = (await adminListContent()).find(x => x.key === key) || null;
    const row = await adminUpdateContent(key, text || '');
    await logAdminAction({
      adminId: auth.user.id,
      action: 'update_content',
      entity: 'bot_content',
      entityId: key,
      before,
      after: row,
    });
    res.json({ ok:true, row });
  } catch (err) {
    console.error('[API admin content update]', err.message);
    res.status(500).json({ ok:false, error:err.message });
  }
});

app.post('/api/admin/prices/list', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const items = await adminListPrices();
    res.json({ ok:true, items });
  } catch (err) {
    console.error('[API admin prices list]', err.message);
    res.status(500).json({ ok:false, error:err.message });
  }
});

app.post('/api/admin/prices/update', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'owner');
    if (!auth) return;
    const { actionKey, tokens, active } = req.body || {};
    if (!actionKey) return res.status(400).json({ ok:false, error:'actionKey required' });
    const before = (await adminListPrices()).find(x => x.action_key === actionKey) || null;
    const row = await adminUpdatePrice(actionKey, { tokens, active });
    await logAdminAction({
      adminId: auth.user.id,
      action: 'update_price',
      entity: 'token_prices',
      entityId: actionKey,
      before,
      after: row,
    });
    res.json({ ok:true, row });
  } catch (err) {
    console.error('[API admin prices update]', err.message);
    res.status(500).json({ ok:false, error:err.message });
  }
});

app.post('/api/admin/tariffs/list', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const items = await adminListTariffs();
    res.json({ ok:true, items });
  } catch (err) {
    console.error('[API admin tariffs list]', err.message);
    res.status(500).json({ ok:false, error:err.message });
  }
});

app.post('/api/admin/tariffs/update', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'owner');
    if (!auth) return;
    const { id, patch } = req.body || {};
    const tid = parseInt(id, 10);
    if (!tid) return res.status(400).json({ ok:false, error:'id required' });
    const before = (await adminListTariffs()).find(x => x.id === tid) || null;
    const row = await adminUpdateTariff(tid, patch || {});
    await logAdminAction({
      adminId: auth.user.id,
      action: 'update_tariff',
      entity: 'bot_tariffs',
      entityId: String(tid),
      before,
      after: row,
    });
    res.json({ ok:true, row });
  } catch (err) {
    console.error('[API admin tariffs update]', err.message);
    res.status(500).json({ ok:false, error:err.message });
  }
});

app.post('/api/admin/tariffs/reorder', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'owner');
    if (!auth) return;
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: 'items required' });
    }
    await adminReorderTariffs(items);
    await logAdminAction({
      adminId: auth.user.id,
      action: 'reorder_tariffs',
      entity: 'bot_tariffs',
      entityId: null,
      before: null,
      after: items,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API admin tariffs reorder]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/tokens/adjust', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;

    const { userId, username, amount, reason } = req.body || {};
    let targetId = parseInt(userId, 10);
    if (!targetId && username) {
      const found = await adminFindUser({ username });
      if (!found) return res.status(404).json({ ok: false, error: 'User not found' });
      targetId = found.telegram_id;
    }
    if (!targetId) return res.status(400).json({ ok: false, error: 'userId or username required' });

    const { before, after } = await adminAdjustTokens({
      userId: targetId,
      amount,
      reason,
      actionKey: 'admin_adjust',
    });

    await logAdminAction({
      adminId: auth.user.id,
      action: 'adjust_tokens',
      entity: 'user_tokens',
      entityId: String(targetId),
      before,
      after,
    });

    res.json({ ok: true, user_id: targetId, before, after });
  } catch (err) {
    console.error('[API admin tokens adjust]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/tokens/history', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;

    const { userId, page, limit, type, fromDate, toDate } = req.body || {};
    const result = await adminListTokenTransactions({
      userId: userId ? parseInt(userId, 10) : null,
      page: parsePage(page),
      limit: parseLimit(limit, 30, 200),
      type: type || 'all',
      fromDate: fromDate || null,
      toDate: toDate || null,
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[API admin tokens history]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/users/list', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;
    const { query, page, limit } = req.body || {};
    const result = await adminListUsers({ query: query || '', page: parsePage(page), limit: parseLimit(limit, 20, 100) });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[API admin users list]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/users/ban', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;
    const { userId, reason } = req.body || {};
    const uid = parseInt(userId, 10);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required' });

    const row = await adminBanUser({ userId: uid, reason: reason || '', adminId: auth.user.id });
    await logAdminAction({
      adminId: auth.user.id,
      action: 'ban_user',
      entity: 'bot_bans',
      entityId: String(uid),
      before: null,
      after: row,
    });

    const bot = getBot();
    await bot?.telegram.sendMessage(uid, `🚫 Ваш аккаунт заблокирован администратором.${reason ? `\nПричина: ${reason}` : ''}`).catch(() => {});

    res.json({ ok: true, row });
  } catch (err) {
    console.error('[API admin users ban]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/users/unban', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;
    const { userId } = req.body || {};
    const uid = parseInt(userId, 10);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required' });

    const rows = await adminUnbanUser({ userId: uid });
    await logAdminAction({
      adminId: auth.user.id,
      action: 'unban_user',
      entity: 'bot_bans',
      entityId: String(uid),
      before: rows,
      after: { is_active: false },
    });

    const bot = getBot();
    await bot?.telegram.sendMessage(uid, '✅ Доступ к боту восстановлен.').catch(() => {});

    res.json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('[API admin users unban]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/users/reset-settings', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;
    const { userId } = req.body || {};
    const uid = parseInt(userId, 10);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required' });

    await adminResetUserSettings(uid);
    await clearUserRedisState(uid);
    await logAdminAction({
      adminId: auth.user.id,
      action: 'reset_user_settings',
      entity: 'bot_user_settings',
      entityId: String(uid),
      before: null,
      after: { reset: true },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[API admin users reset-settings]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/users/delete-dialogs', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;
    const { userId } = req.body || {};
    const uid = parseInt(userId, 10);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required' });

    await adminDeleteUserDialogs(uid);
    await clearUserRedisState(uid);
    await logAdminAction({
      adminId: auth.user.id,
      action: 'delete_user_dialogs',
      entity: 'bot_conversations',
      entityId: String(uid),
      before: null,
      after: { deleted: true },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[API admin users delete-dialogs]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/referrals/top', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;
    const { limit } = req.body || {};
    const items = await adminTopReferrers({ limit: parseLimit(limit, 20, 200) });
    res.json({ ok: true, items });
  } catch (err) {
    console.error('[API admin referrals top]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/referrals/user', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;
    const { userId, page, limit } = req.body || {};
    const uid = parseInt(userId, 10);
    if (!uid) return res.status(400).json({ ok: false, error: 'userId required' });
    const result = await adminUserReferrals({ userId: uid, page: parsePage(page), limit: parseLimit(limit, 50, 200) });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[API admin referrals user]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/purchases/list', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'moderator');
    if (!auth) return;
    const { page, limit, userId, status, fromDate, toDate } = req.body || {};
    const result = await adminListPurchases({
      page: parsePage(page),
      limit: parseLimit(limit, 50, 200),
      userId: userId ? parseInt(userId, 10) : null,
      status: status || null,
      fromDate: fromDate || null,
      toDate: toDate || null,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[API admin purchases list]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/audit/list', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'owner');
    if (!auth) return;
    const { page, limit } = req.body || {};
    const result = await adminListAudit({ page: parsePage(page), limit: parseLimit(limit, 30, 200) });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[API admin audit list]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/admins/list', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'owner');
    if (!auth) return;
    const items = await adminListAdmins();
    res.json({ ok: true, items });
  } catch (err) {
    console.error('[API admin admins list]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/admins/upsert', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'owner');
    if (!auth) return;
    const { adminId, role, isActive } = req.body || {};
    const aid = parseInt(adminId, 10);
    if (!aid) return res.status(400).json({ ok: false, error: 'adminId required' });
    if (!['owner', 'moderator'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'role must be owner|moderator' });
    }

    const before = (await adminListAdmins()).find(x => x.admin_id === aid) || null;
    const row = await adminUpsertAdmin({ adminId: aid, role, isActive: isActive !== false });
    await logAdminAction({
      adminId: auth.user.id,
      action: 'upsert_admin',
      entity: 'bot_admins',
      entityId: String(aid),
      before,
      after: row,
    });

    res.json({ ok: true, row });
  } catch (err) {
    console.error('[API admin admins upsert]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/admins/delete', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res, 'owner');
    if (!auth) return;
    const { adminId } = req.body || {};
    const aid = parseInt(adminId, 10);
    if (!aid) return res.status(400).json({ ok: false, error: 'adminId required' });

    const before = (await adminListAdmins()).find(x => x.admin_id === aid) || null;
    const deleted = await adminDeleteAdmin(aid);
    await logAdminAction({
      adminId: auth.user.id,
      action: 'delete_admin',
      entity: 'bot_admins',
      entityId: String(aid),
      before,
      after: { deleted: deleted.length || 0 },
    });

    res.json({ ok: true, deleted: deleted.length || 0 });
  } catch (err) {
    console.error('[API admin admins delete]', err.message);
    res.status(500).json({ ok: false, error: err.message });
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
