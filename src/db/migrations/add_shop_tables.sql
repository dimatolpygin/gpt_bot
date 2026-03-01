-- ════════════════════════════════════════════
-- Таблица тарифов
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bot_tariffs (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  tokens      INTEGER NOT NULL,
  price_rub   INTEGER NOT NULL DEFAULT 0,
  stars       INTEGER NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_bot_tariffs_updated_at
BEFORE UPDATE ON bot_tariffs
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Начальные тарифы
INSERT INTO bot_tariffs (name, description, tokens, price_rub, stars, sort_order) VALUES
('🥉 Старт',   '100 токенов — идеально для знакомства',   100,  99,  50,  1),
('🥈 Базовый', '300 токенов — оптимальный выбор',          300,  249, 125, 2),
('🥇 Про',     '700 токенов — для активных пользователей', 700,  499, 250, 3),
('💎 Макс',    '1500 токенов — максимальный пакет',        1500, 899, 450, 4);

-- ════════════════════════════════════════════
-- Таблица истории покупок
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bot_purchases (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES bot_users(telegram_id) ON DELETE CASCADE,
  tariff_id        INTEGER REFERENCES bot_tariffs(id) ON DELETE SET NULL,
  tariff_name      TEXT NOT NULL,
  tokens_credited  INTEGER NOT NULL,
  stars_paid       INTEGER NOT NULL,
  charge_id        TEXT UNIQUE,              -- telegram_payment_charge_id (для возвратов)
  payload          TEXT,
  status           TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_user ON public.bot_purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created ON public.bot_purchases (created_at DESC);
