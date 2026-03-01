import { supabase } from './supabase.js';

const ROLE_WEIGHT = {
  none:      0,
  moderator: 1,
  owner:     2,
};

const envAdminIds = (process.env.ADMIN_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(Boolean);

const isMissingTable = (error) => error?.code === '42P01';

export const roleAtLeast = (role, required) =>
  (ROLE_WEIGHT[role] || 0) >= (ROLE_WEIGHT[required] || 0);

export const resolveAdminRole = async (adminId) => {
  if (!adminId) return 'none';
  if (envAdminIds.includes(adminId)) return 'owner';

  const { data, error } = await supabase
    .from('bot_admins')
    .select('role, is_active')
    .eq('admin_id', adminId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return 'none';
    throw error;
  }
  if (!data?.role) return 'none';
  return data.role;
};

export const isUserBanned = async (userId) => {
  const { data, error } = await supabase
    .from('bot_bans')
    .select('id, reason, is_active, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }

  return data || null;
};

export const logAdminAction = async ({ adminId, action, entity, entityId = null, before = null, after = null }) => {
  const { error } = await supabase
    .from('bot_admin_audit_log')
    .insert({
      admin_id:   adminId,
      action,
      entity,
      entity_id:  entityId ? String(entityId) : null,
      before_json: before,
      after_json:  after,
    });

  if (error && !isMissingTable(error)) {
    console.error('[AdminAudit] log error:', error.message);
  }
};

export const adminListAudit = async ({ page = 0, limit = 30 }) => {
  const from = page * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('bot_admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (isMissingTable(error)) return { items: [], total: 0 };
    throw error;
  }
  return { items: data || [], total: count || 0 };
};

export const adminListAdmins = async () => {
  const { data, error } = await supabase
    .from('bot_admins')
    .select('admin_id, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  return data || [];
};

export const adminUpsertAdmin = async ({ adminId, role, isActive = true }) => {
  const payload = {
    admin_id:   adminId,
    role,
    is_active:  isActive,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('bot_admins')
    .upsert(payload, { onConflict: 'admin_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const adminListContent = async () => {
  const { data, error } = await supabase
    .from('bot_content')
    .select('*')
    .order('key', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const adminUpdateContent = async (key, text) => {
  const { data, error } = await supabase
    .from('bot_content')
    .upsert({ key, text }, { onConflict: 'key' })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const adminListPrices = async () => {
  const { data, error } = await supabase
    .from('token_prices')
    .select('*')
    .order('action_key', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const adminUpdatePrice = async (actionKey, patch) => {
  const payload = {};
  if (patch.tokens != null) payload.tokens = parseInt(patch.tokens, 10);
  if (patch.active != null) payload.active = !!patch.active;

  const { data, error } = await supabase
    .from('token_prices')
    .update(payload)
    .eq('action_key', actionKey)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const adminListTariffs = async () => {
  const { data, error } = await supabase
    .from('bot_tariffs')
    .select('id, name, description, tokens, price_rub, stars, sort_order, is_active, updated_at')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const adminUpdateTariff = async (id, patch) => {
  const { data, error } = await supabase
    .from('bot_tariffs')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const adminReorderTariffs = async (items) => {
  const updates = items.map(item =>
    supabase
      .from('bot_tariffs')
      .update({ sort_order: parseInt(item.sort_order, 10) || 0 })
      .eq('id', parseInt(item.id, 10))
  );
  const results = await Promise.all(updates);
  const failed = results.find(r => r.error);
  if (failed?.error) throw failed.error;
  return true;
};

export const adminFindUser = async ({ userId, username }) => {
  let query = supabase.from('bot_users').select('telegram_id, username, first_name, last_name, created_at, updated_at').limit(1);
  if (userId) query = query.eq('telegram_id', parseInt(userId, 10));
  else query = query.eq('username', username.replace('@', ''));
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
};

export const adminListUsers = async ({ page = 0, limit = 20, query = '' }) => {
  const from = page * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('bot_users')
    .select('telegram_id, username, first_name, last_name, created_at, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);

  const trimmed = (query || '').trim();
  if (trimmed) {
    if (/^\d+$/.test(trimmed)) q = q.eq('telegram_id', parseInt(trimmed, 10));
    else q = q.ilike('username', `%${trimmed.replace('@', '')}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  const userIds = (data || []).map(x => x.telegram_id);
  let bannedSet = new Set();

  if (userIds.length) {
    const { data: bans, error: banError } = await supabase
      .from('bot_bans')
      .select('user_id')
      .eq('is_active', true)
      .in('user_id', userIds);
    if (banError && !isMissingTable(banError)) throw banError;
    bannedSet = new Set((bans || []).map(b => b.user_id));
  }

  const users = (data || []).map(u => ({ ...u, is_banned: bannedSet.has(u.telegram_id) }));
  return { users, total: count || 0 };
};

export const adminBanUser = async ({ userId, reason = '', adminId }) => {
  await supabase
    .from('bot_bans')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('bot_bans')
    .insert({ user_id: userId, reason, banned_by: adminId, is_active: true })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const adminUnbanUser = async ({ userId }) => {
  const { data, error } = await supabase
    .from('bot_bans')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true)
    .select();

  if (error) throw error;
  return data || [];
};

export const adminResetUserSettings = async (userId) => {
  const { error } = await supabase
    .from('bot_user_settings')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
  return true;
};

export const adminDeleteUserDialogs = async (userId) => {
  const { error } = await supabase
    .from('bot_conversations')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
  return true;
};

const ensureUserTokensRow = async (userId) => {
  const { data, error } = await supabase
    .from('user_tokens')
    .select('user_id, balance, total_earned, total_spent')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: inserted, error: insError } = await supabase
    .from('user_tokens')
    .insert({ user_id: userId, balance: 0, total_earned: 0, total_spent: 0 })
    .select()
    .single();
  if (insError) throw insError;
  return inserted;
};

export const adminAdjustTokens = async ({ userId, amount, reason = '', actionKey = 'admin_adjust' }) => {
  const amt = parseInt(amount, 10);
  if (!Number.isFinite(amt) || amt === 0) throw new Error('amount must be non-zero integer');

  const row = await ensureUserTokensRow(userId);
  const current = row.balance || 0;
  const next = current + amt;
  if (next < 0) throw new Error('insufficient balance for debit');

  const patch = {
    balance: next,
    updated_at: new Date().toISOString(),
    total_earned: (row.total_earned || 0) + (amt > 0 ? amt : 0),
    total_spent: (row.total_spent || 0) + (amt < 0 ? Math.abs(amt) : 0),
  };

  const { data: updated, error: upErr } = await supabase
    .from('user_tokens')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single();
  if (upErr) throw upErr;

  const description = reason || (amt > 0 ? 'Админ начисление' : 'Админ списание');
  const { error: txErr } = await supabase
    .from('token_transactions')
    .insert({
      user_id: userId,
      amount: amt,
      action_key: actionKey,
      description,
      balance_after: next,
    });
  if (txErr) throw txErr;

  return { before: row, after: updated };
};

export const adminListTokenTransactions = async ({ userId, page = 0, limit = 30, type = 'all', fromDate = null, toDate = null }) => {
  const from = page * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('token_transactions')
    .select('id, user_id, amount, action_key, description, balance_after, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (userId) q = q.eq('user_id', userId);
  if (type === 'credit') q = q.gt('amount', 0);
  if (type === 'debit') q = q.lt('amount', 0);
  if (fromDate) q = q.gte('created_at', fromDate);
  if (toDate) q = q.lte('created_at', toDate);

  const { data, error, count } = await q;
  if (error) throw error;
  return { items: data || [], total: count || 0 };
};

export const adminTopReferrers = async ({ limit = 20 }) => {
  const { data, error } = await supabase
    .from('bot_referrals')
    .select('referrer_id, tokens_awarded');
  if (error) throw error;

  const byUser = new Map();
  for (const row of data || []) {
    const rec = byUser.get(row.referrer_id) || { referrer_id: row.referrer_id, referrals_count: 0, total_tokens_awarded: 0 };
    rec.referrals_count += 1;
    rec.total_tokens_awarded += row.tokens_awarded || 0;
    byUser.set(row.referrer_id, rec);
  }

  return [...byUser.values()]
    .sort((a, b) => b.referrals_count - a.referrals_count || b.total_tokens_awarded - a.total_tokens_awarded)
    .slice(0, limit);
};

export const adminUserReferrals = async ({ userId, page = 0, limit = 50 }) => {
  const from = page * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('bot_referrals')
    .select('id, referrer_id, referee_id, tokens_awarded, created_at', { count: 'exact' })
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { items: data || [], total: count || 0 };
};

export const adminListPurchases = async ({ page = 0, limit = 50, userId = null, status = null, fromDate = null, toDate = null }) => {
  const from = page * limit;
  const to = from + limit - 1;
  let q = supabase
    .from('bot_purchases')
    .select('id, user_id, tariff_name, tokens_credited, stars_paid, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (userId) q = q.eq('user_id', userId);
  if (status) q = q.eq('status', status);
  if (fromDate) q = q.gte('created_at', fromDate);
  if (toDate) q = q.lte('created_at', toDate);

  const { data, error, count } = await q;
  if (error) throw error;
  return { items: data || [], total: count || 0 };
};
