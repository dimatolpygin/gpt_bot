import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

const sb = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
export { sb as supabase };

// ─── Users ───────────────────────────────────────────────────────────

export const upsertUser = async (tgUser) => {
  const { data, error } = await sb.from('bot_users').upsert({
    telegram_id: tgUser.id,
    username:    tgUser.username   ?? null,
    first_name:  tgUser.first_name ?? null,
    last_name:   tgUser.last_name  ?? null,
    updated_at:  new Date().toISOString(),
  }, { onConflict: 'telegram_id' }).select().single();
  if (error) throw error;
  return data;
};

// ─── Conversations ────────────────────────────────────────────────────

export const getConversations = async (userId, page, limit) => {
  const from = page * limit;
  const { data, error, count } = await sb
    .from('bot_conversations')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw error;
  return { conversations: data, total: count };
};

export const getConvById = async (convId, userId) => {
  const { data, error } = await sb
    .from('bot_conversations')
    .select('*')
    .eq('id', convId)
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data;
};

export const createConv = async (userId, title = 'Новый диалог') => {
  const { data, error } = await sb
    .from('bot_conversations')
    .insert({ user_id: userId, title })
    .select().single();
  if (error) throw error;
  return data;
};

export const updateConvTitle = async (convId, title) => {
  const { error } = await sb
    .from('bot_conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', convId);
  if (error) throw error;
};

export const deleteConv = async (convId, userId) => {
  const { error } = await sb
    .from('bot_conversations')
    .delete()
    .eq('id', convId)
    .eq('user_id', userId);
  if (error) throw error;
};

const touchConv = (convId) =>
  sb.from('bot_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', convId);

// ─── Messages ─────────────────────────────────────────────────────────

export const addMessage = async (convId, role, content, model = null) => {
  const { data, error } = await sb
    .from('bot_messages')
    .insert({ conversation_id: convId, role, content, model })
    .select().single();
  if (error) throw error;
  await touchConv(convId);
  return data;
};

export const getMessages = async (convId, limit = 50) => {
  const { data, error } = await sb
    .from('bot_messages')
    .select('role, content, model, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
};

export const getUserPrompts = async (userId) => {
  const { data, error } = await sb
    .from('user_prompts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const addUserPrompt = async (userId, name, content) => {
  const { data, error } = await sb
    .from('user_prompts')
    .insert({ user_id: userId, name, content })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const setActivePrompt = async (userId, promptId) => {
  const { error: resetErr } = await sb
    .from('user_prompts')
    .update({ is_active: false })
    .eq('user_id', userId);
  if (resetErr) throw resetErr;
  if (!promptId) return;
  const { error } = await sb
    .from('user_prompts')
    .update({ is_active: true })
    .eq('id', promptId)
    .eq('user_id', userId);
  if (error) throw error;
};

export const deleteUserPrompt = async (userId, promptId) => {
  const { error } = await sb
    .from('user_prompts')
    .delete()
    .eq('id', promptId)
    .eq('user_id', userId);
  if (error) throw error;
};

export const getActivePrompt = async (userId) => {
  const { data, error } = await sb
    .from('user_prompts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();
  if (error && error.code !== 'PGRST116') {
    console.error('[Prompt] getActivePrompt error:', error.message);
  }
  console.log('[Prompt] getActivePrompt result for', userId, ':', data ? data.name : 'null');
  return data || null;
};

// ─── Шаблоны ───────────────────────────────────────────────────────

export const getTemplates = async () => {
  const { data, error } = await sb
    .from('buttons')
    .select('id, topic, topic_id, gender, emoji, name_batton, caption, "LINK"')
    .eq('ACTIVE', true)
    .order('topic_id', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data || []).map(t => ({
    id:      t.id,
    topic:   t.topic   || 'Без категории',
    topicid: t.topic_id || 0,
    gender:  t.gender  || 'all',
    emoji:   t.emoji   || '',
    name:    t.name_batton || '',
    caption: t.caption || '',
    image:   t.LINK    || '',
  }));
};

export const getTemplateById = async (id) => {
  const { data, error } = await sb
    .from('buttons')
    .select('*')
    .eq('id', id)
    .eq('ACTIVE', true)
    .single();
  if (error) throw error;
  return data;
};
// ─── ДОБАВИТЬ В КОНЕЦ ФАЙЛА services/supabase.js ─────────────────────────────

// ── Тарифы ───────────────────────────────────────────────────────────────────
export const getTariffs = async () => {
  const { data, error } = await sb
    .from('bot_tariffs')
    .select('id, name, description, tokens, stars, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
};

// ── Покупки ───────────────────────────────────────────────────────────────────
export const savePurchase = async ({ user_id, tariff_id, tariff_name, tokens_credited, stars_paid, charge_id, payload }) => {
  const { error } = await sb.from('bot_purchases').insert({
    user_id,
    tariff_id,
    tariff_name,
    tokens_credited,
    stars_paid,
    charge_id,
    payload,
    status: 'completed',
  });
  if (error) console.error('[Shop] savePurchase error:', error.message);
};

export const getPurchaseHistory = async (userId, limit = 10) => {
  const { data, error } = await sb
    .from('bot_purchases')
    .select('tariff_name, tokens_credited, stars_paid, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

// ─── Реферальная система ────────────────────────────────────────────────

export const getUserById = async (userId) => {
  const { data, error } = await sb
    .from('bot_users')
    .select('*')
    .eq('telegram_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') return null;
  return data || null;
};

export const getReferralByReferee = async (refereeId) => {
  const { data, error } = await sb
    .from('bot_referrals')
    .select('*')
    .eq('referee_id', refereeId)
    .single();
  if (error && error.code !== 'PGRST116') return null;
  return data || null;
};

export const createReferral = async ({ referrerId, refereeId, tokens }) => {
  if (referrerId === refereeId) return null;
  try {
    const { data, error } = await sb
      .from('bot_referrals')
      .insert({
        referrer_id:    referrerId,
        referee_id:     refereeId,
        tokens_awarded: tokens,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('[Referrals] createReferral error:', e.message);
    return null;
  }
};

export const countReferrals = async (referrerId) => {
  const { count, error } = await sb
    .from('bot_referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', referrerId);
  if (error) throw error;
  return count || 0;
};
