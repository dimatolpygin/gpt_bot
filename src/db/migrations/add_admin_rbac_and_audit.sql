-- Admin RBAC, bans, and audit log

CREATE TABLE IF NOT EXISTS public.bot_admins (
  admin_id    BIGINT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'moderator')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_admins_role ON public.bot_admins(role);
CREATE INDEX IF NOT EXISTS idx_bot_admins_active ON public.bot_admins(is_active);

CREATE TABLE IF NOT EXISTS public.bot_bans (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES public.bot_users(telegram_id) ON DELETE CASCADE,
  reason      TEXT NOT NULL DEFAULT '',
  banned_by   BIGINT REFERENCES public.bot_users(telegram_id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_bans_active_user
  ON public.bot_bans(user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_bot_bans_user ON public.bot_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_bans_active ON public.bot_bans(is_active);
CREATE INDEX IF NOT EXISTS idx_bot_bans_created ON public.bot_bans(created_at DESC);

CREATE TABLE IF NOT EXISTS public.bot_admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    BIGINT NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  before_json JSONB,
  after_json  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON public.bot_admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON public.bot_admin_audit_log(entity);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.bot_admin_audit_log(created_at DESC);
