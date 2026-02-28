export const config = {
  BOT_TOKEN:         process.env.BOT_TOKEN,
  OPENAI_API_KEY:    process.env.OPENAI_API_KEY,
  OPENAI_MODEL:      process.env.OPENAI_MODEL || 'gpt-4o',
  SUPABASE_URL:      process.env.SUPABASE_URL,
  SUPABASE_KEY:      process.env.SUPABASE_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  REDIS_URL:         process.env.REDIS_URL || 'redis://localhost:6379',
  PORT:              process.env.PORT || 3000,
  WEBAPP_URL:        process.env.WEBAPP_URL || 'http://localhost:3000',
  APP_URL:           process.env.APP_URL || 'http://localhost:3000',
  DIALOGS_PER_PAGE:  5,
  MAX_HISTORY:       50,          // messages sent to OpenAI as context
  STREAM_THROTTLE:   800,         // ms between Telegram message edits
  PROCESSING_TTL:    90,          // seconds — Redis key TTL for "typing" lock
  ALLOWED_USERS:     process.env.ALLOWED_USERS
    ? process.env.ALLOWED_USERS.split(',').map(s => parseInt(s.trim())).filter(Boolean)
    : [],
  WAVESPEED_API_KEY: process.env.WAVESPEED_API_KEY || '',
};
