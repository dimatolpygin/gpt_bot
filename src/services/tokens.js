import { supabase } from './supabase.js';

// ── Инициализация баланса (первый вход) ───────────────────
export const initUserTokens = async (userId) => {
  const { data: existing } = await supabase
    .from('user_tokens').select('user_id').eq('user_id', userId).single();
  if (existing) return;

  const { data: cfg } = await supabase
    .from('token_config').select('value').eq('key', 'start_balance').single();
  const startBalance = parseInt(cfg?.value || '100');

  await supabase.rpc('credit_tokens', {
    p_user_id:     userId,
    p_amount:      startBalance,
    p_description: `🎁 Стартовый бонус (${startBalance} 🪙)`,
  });
};

// ── Текущий баланс ────────────────────────────────────────
export const getBalance = async (userId) => {
  const { data } = await supabase
    .from('user_tokens').select('balance').eq('user_id', userId).single();
  return data?.balance ?? 0;
};

// ── Цена действия ─────────────────────────────────────────
export const getPrice = async (actionKey) => {
  const { data } = await supabase
    .from('token_prices')
    .select('tokens, label')
    .eq('action_key', actionKey)
    .eq('active', true)
    .single();
  return { tokens: data?.tokens ?? 1, label: data?.label ?? actionKey };
};

// ── Списать токены (атомарно через RPC) ───────────────────
// Returns: { ok, balance, spent, label } | { ok:false, balance, needed, label }
export const spendTokens = async (userId, actionKey) => {
  const { tokens: price, label } = await getPrice(actionKey);

  const { data, error } = await supabase.rpc('spend_tokens', {
    p_user_id:     userId,
    p_amount:      price,
    p_action_key:  actionKey,
    p_description: label,
  });

  if (error || !data) {
    const balance = await getBalance(userId);
    return { ok: false, balance, needed: price, label };
  }

  if (!data.ok) {
    return { ok: false, balance: data.balance ?? 0, needed: data.needed ?? price, label };
  }

  return { ok: true, balance: data.balance, spent: price, label };
};

// ── Пополнить баланс (админ / промокод) ───────────────────
export const creditTokens = async (userId, amount, description = '💳 Пополнение') => {
  const { data } = await supabase.rpc('credit_tokens', {
    p_user_id:     userId,
    p_amount:      amount,
    p_description: description,
  });
  return data;
};

// ── История транзакций ────────────────────────────────────
export const getHistory = async (userId, limit = 8) => {
  const { data } = await supabase
    .from('token_transactions')
    .select('amount, description, balance_after, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
};

// ── Форматировать баланс для отображения ─────────────────
export const formatBalance = (n) => `${n} 🪙`;

// ── Сообщение об ошибке нехватки токенов ─────────────────
export const notEnoughMsg = ({ balance, needed, label }) =>
  `❌ <b>Недостаточно токенов</b>\n\n` +
  `Действие: <i>${label}</i>\n` +
  `Нужно: <b>${needed} 🪙</b>\n` +
  `Ваш баланс: <b>${balance} 🪙</b>\n\n` +
  `Нажмите <b>💳 Купить генерации</b> в меню для пополнения.`;

// ─── Реферальный бонус ────────────────────────────────────────────────

export const getReferralBonus = async () => {
  const { data } = await supabase
    .from('token_config')
    .select('value')
    .eq('key', 'referral_bonus')
    .single();
  return parseInt(data?.value || '0', 10);
};
