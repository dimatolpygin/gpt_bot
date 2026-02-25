import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

const sb = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

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
    .select('role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
};
