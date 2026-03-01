import { supabase } from './supabase.js';

const defaults = {
  img_model:   'nb1',
  img_format:  '1:1',
  img_quality: '1k',
  vid_model:   'seedance1',
  vid_duration: 5,
  vid_aspect:  '16:9',
};

export const getUserSettings = async (userId) => {
  const { data } = await supabase
    .from('bot_user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  return { ...defaults, ...(data || {}) };
};

export const updateUserSettings = async (userId, patch) => {
  const payload = { user_id: userId, ...patch, updated_at: new Date().toISOString() };
  const { data } = await supabase
    .from('bot_user_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();
  return data || payload;
};
