#!/bin/bash

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔══════════════════════════════════════╗"
echo "║     🤖 Установка GPT Telegram Bot    ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# ─── 1. СИСТЕМНЫЕ ЗАВИСИМОСТИ ───────────────────────────────────────────────

echo -e "${YELLOW}[1/6] Установка зависимостей...${NC}"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - > /dev/null 2>&1
apt install -y nodejs nginx certbot python3-certbot-nginx redis-server > /dev/null 2>&1
npm install -g pm2 > /dev/null 2>&1
systemctl enable redis-server > /dev/null 2>&1
systemctl start redis-server > /dev/null 2>&1
echo -e "${GREEN}✅ Зависимости установлены${NC}"

# ─── 2. КЛОНИРОВАНИЕ ────────────────────────────────────────────────────────

echo -e "${YELLOW}[2/6] Клонирование репозитория...${NC}"
rm -rf /root/gpt-telegram-bot
git clone https://github.com/dimatolpygin/gpt_bot.git /root/gpt-telegram-bot > /dev/null 2>&1
cd /root/gpt-telegram-bot
npm install > /dev/null 2>&1
echo -e "${GREEN}✅ Репозиторий клонирован${NC}"

# ─── 3. ENV ФАЙЛ ────────────────────────────────────────────────────────────

echo -e "${YELLOW}[3/6] Настройка переменных окружения...${NC}"
echo ""
echo "Заполните данные (Enter — пропустить необязательное):"
echo ""

read -p "BOT_TOKEN (токен от @BotFather): " BOT_TOKEN
read -p "OPENAI_API_KEY (sk-...): " OPENAI_API_KEY
read -p "OPENAI_MODEL (по умолчанию gpt-4o): " OPENAI_MODEL
OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o}
read -p "SUPABASE_URL (https://xxxx.supabase.co): " SUPABASE_URL
read -p "SUPABASE_KEY (anon key): " SUPABASE_KEY
read -p "REDIS_URL (по умолчанию redis://localhost:6379): " REDIS_URL
REDIS_URL=${REDIS_URL:-redis://localhost:6379}
read -p "ДОМЕН (например anastasia-kwork.ru): " DOMAIN
read -p "EMAIL для SSL сертификата: " EMAIL
read -p "ALLOWED_USERS (Telegram ID через запятую, или Enter чтобы пропустить): " ALLOWED_USERS

cat > /root/gpt-telegram-bot/.env << EOF
BOT_TOKEN=${BOT_TOKEN}
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=${OPENAI_MODEL}

SUPABASE_URL=${SUPABASE_URL}
SUPABASE_KEY=${SUPABASE_KEY}

REDIS_URL=${REDIS_URL}

PORT=3000
WEBAPP_URL=https://${DOMAIN}

ALLOWED_USERS=${ALLOWED_USERS}
EOF

echo -e "${GREEN}✅ .env файл создан${NC}"

# ─── 4. NGINX + SSL ─────────────────────────────────────────────────────────

echo -e "${YELLOW}[4/6] Настройка Nginx и SSL...${NC}"

cat > /etc/nginx/sites-available/${DOMAIN} << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
nginx -t > /dev/null 2>&1 && systemctl restart nginx

certbot --nginx -d ${DOMAIN} \
  --email ${EMAIL} \
  --agree-tos \
  --non-interactive > /dev/null 2>&1

echo -e "${GREEN}✅ Nginx и SSL настроены${NC}"

# ─── 5. ЗАПУСК БОТА ─────────────────────────────────────────────────────────

echo -e "${YELLOW}[5/6] Запуск бота...${NC}"
cd /root/gpt-telegram-bot
pm2 start src/index.js --name gpt-bot
pm2 save
pm2 startup > /dev/null 2>&1
echo -e "${GREEN}✅ Бот запущен${NC}"

# ─── 6. АВТООБНОВЛЕНИЕ ЧЕРЕЗ CRON ───────────────────────────────────────────

echo -e "${YELLOW}[6/6] Настройка автообновления...${NC}"

cat > /root/update.sh << 'UPDATEEOF'
#!/bin/bash
cd /root/gpt-telegram-bot
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] Обновление бота..."
    git pull origin main
    npm install --production
    pm2 restart gpt-bot --update-env
    echo "[$(date)] ✅ Бот обновлён"
else
    echo "[$(date)] Обновлений нет"
fi
UPDATEEOF

chmod +x /root/update.sh

# Запуск каждые 5 минут
(crontab -l 2>/dev/null; echo "*/5 * * * * /root/update.sh >> /root/update.log 2>&1") | crontab -

echo -e "${GREEN}✅ Автообновление настроено (каждые 5 минут)${NC}"

# ─── ФИНАЛ ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║              ✅ Бот успешно развёрнут!                          ║"
echo "║                                                                  ║"
echo "║  Домен:        https://${DOMAIN}                                ║"
echo "║  Логи бота:    pm2 logs gpt-bot                                 ║"
echo "║  Статус:       pm2 status                                       ║"
echo "║  Лог апдейтов: tail -f /root/update.log                        ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

pm2 logs gpt-bot --lines 20 --nostream
