import { supabase } from './supabase.js';

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

export const adminUpdatePrice = async (actionKey, tokens) => {
  const { data, error } = await supabase
    .from('token_prices')
    .update({ tokens })
    .eq('action_key', actionKey)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const adminListTariffs = async () => {
  const { data, error } = await supabase
    .from('bot_tariffs')
    .select('id, name, description, tokens, price_rub, stars, sort_order, is_active')
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
