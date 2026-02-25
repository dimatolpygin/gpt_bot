-- Run this SQL in Supabase SQL Editor before starting the bot

-- ── Users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username    TEXT,
  first_name  TEXT,
  last_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Conversations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         SERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'Новый диалог',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_user    ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);

-- ── Messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(created_at ASC);

-- ── Row Level Security ────────────────────────────────────────────────
-- The bot uses a service key so RLS is optional, but good practice.
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by bot)
CREATE POLICY "service_all_users"         ON users         FOR ALL USING (true);
CREATE POLICY "service_all_conversations" ON conversations FOR ALL USING (true);
CREATE POLICY "service_all_messages"      ON messages      FOR ALL USING (true);
