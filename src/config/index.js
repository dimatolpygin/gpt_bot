export const config = {
  BOT_TOKEN:         process.env.BOT_TOKEN,
  OPENAI_API_KEY:    process.env.OPENAI_API_KEY,
  OPENAI_MODEL:      process.env.OPENAI_MODEL || 'gpt-4o',
  SUPABASE_URL:      process.env.SUPABASE_URL,
  SUPABASE_KEY:      process.env.SUPABASE_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  REDIS_URL:         process.env.REDIS_URL || 'redis://localhost:6379',
  PORT:              process.env.PORT || 3000,
  WEBAPP_URL_RAW:    process.env.WEBAPP_URL || '',
  WEBAPP_URL:        process.env.WEBAPP_URL || 'http://localhost:3000',
  jsAPP_URL:         process.env.APP_URL || '',
  APP_URL_RAW:        process.env.APP_URL || '',
  APP_URL:           process.env.APP_URL || 'http://localhost:3000',
  DIALOGS_PER_PAGE:  5,
  MAX_HISTORY:       50,          // messages sent to OpenAI as context
  STREAM_THROTTLE:   800,         // ms between Telegram message edits
  PROCESSING_TTL:    90,          // seconds — Redis key TTL for "typing" lock
  ALLOWED_USERS:     process.env.ALLOWED_USERS
    ? process.env.ALLOWED_USERS.split(',').map(s => parseInt(s.trim())).filter(Boolean)
    : [],
  WAVESPEED_API_KEY: process.env.WAVESPEED_API_KEY || '',
  ADMIN_IDS:         process.env.ADMIN_IDS || '',
  YOOKASSA_SHOP_ID:   process.env.YOOKASSA_SHOP_ID   || '',
  YOOKASSA_SECRET_KEY:process.env.YOOKASSA_SECRET_KEY || '',
  YOOKASSA_RETURN_URL:process.env.YOOKASSA_RETURN_URL || '',
};
