-- Реферальная система (1 уровень)

CREATE TABLE IF NOT EXISTS public.bot_referrals (
  id             BIGSERIAL PRIMARY KEY,
  referrer_id    BIGINT NOT NULL REFERENCES bot_users(telegram_id) ON DELETE CASCADE,
  referee_id     BIGINT NOT NULL REFERENCES bot_users(telegram_id) ON DELETE CASCADE,
  tokens_awarded INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_referee UNIQUE (referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.bot_referrals (referrer_id);

INSERT INTO token_config (key, value, description)
VALUES ('referral_bonus', '50', 'Токены за приглашённого реферала')
ON CONFLICT (key) DO NOTHING;
