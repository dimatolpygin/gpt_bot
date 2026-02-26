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

# ─── СБОР ДАННЫХ ────────────────────────────────────────────────────────────

echo "Заполните данные для установки:"
echo ""

read -p "BOT_TOKEN (токен от @BotFather): " BOT_TOKEN
read -p "OPENAI_API_KEY (sk-...): " OPENAI_API_KEY
read -p "OPENAI_MODEL (Enter = gpt-4o): " OPENAI_MODEL
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o}"
read -p "SUPABASE_URL (https://xxxx.supabase.co): " SUPABASE_URL
read -p "SUPABASE_KEY (anon key): " SUPABASE_KEY
read -p "REDIS_URL (Enter = redis://localhost:6379): " REDIS_URL
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
read -p "ДОМЕН (например anastasia-kwork.ru): " DOMAIN
read -p "EMAIL для SSL сертификата: " EMAIL
read -p "ALLOWED_USERS (Telegram ID через запятую, или Enter чтобы пропустить): " ALLOWED_USERS

echo ""
echo -e "${YELLOW}Данные приняты, начинаю установку...${NC}"
echo ""

# ─── 1. СИСТЕМНЫЕ ЗАВИСИМОСТИ ───────────────────────────────────────────────

echo -e "${YELLOW}[1/5] Установка зависимостей...${NC}"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - > /dev/null 2>&1
DEBIAN_FRONTEND=noninteractive apt install -y nodejs nginx certbot python3-certbot-nginx redis-server > /dev/null 2>&1
npm install -g pm2 > /dev/null 2>&1
systemctl enable redis-server > /dev/null 2>&1
systemctl start redis-server > /dev/null 2>&1
echo -e "${GREEN}✅ Зависимости установлены${NC}"

# ─── 2. КЛОНИРОВАНИЕ ────────────────────────────────────────────────────────

echo -e "${YELLOW}[2/5] Клонирование репозитория...${NC}"
rm -rf /root/gpt-telegram-bot
git clone https://github.com/dimatolpygin/gpt_bot.git /root/gpt-telegram-bot > /dev/null 2>&1
cd /root/gpt-telegram-bot
npm install > /dev/null 2>&1
echo -e "${GREEN}✅ Репозиторий клонирован${NC}"

# ─── 3. ENV ФАЙЛ ────────────────────────────────────────────────────────────

echo -e "${YELLOW}[3/5] Создание .env файла...${NC}"

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

# ─── 4. NGINX (только HTTP) ─────────────────────────────────────────────────

echo -e "${YELLOW}[4/5] Настройка Nginx и SSL...${NC}"

# Удалить дефолтный конфиг
rm -f /etc/nginx/sites-enabled/default

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

ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
nginx -t > /dev/null 2>&1 && systemctl restart nginx

# Получить SSL через standalone (не через nginx плагин)
systemctl stop nginx
certbot certonly --standalone \
  -d "${DOMAIN}" \
  --email "${EMAIL}" \
  --agree-tos \
  --non-interactive > /dev/null 2>&1
SSL_EXIT=$?
systemctl start nginx

if [ $SSL_EXIT -ne 0 ]; then
    echo -e "${RED}❌ Не удалось получить SSL сертификат. Проверьте что домен указывает на этот сервер.${NC}"
    echo -e "${YELLOW}Бот будет работать по HTTP. Для HTTPS запустите вручную:${NC}"
    echo "certbot --nginx -d ${DOMAIN} --email ${EMAIL} --agree-tos --non-interactive"
else
    # Обновить nginx конфиг с SSL
    cat > /etc/nginx/sites-available/${DOMAIN} << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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
    nginx -t > /dev/null 2>&1 && systemctl restart nginx
    echo -e "${GREEN}✅ Nginx и SSL настроены${NC}"
fi

# ─── 5. ЗАПУСК + АВТООБНОВЛЕНИЕ ─────────────────────────────────────────────

echo -e "${YELLOW}[5/5] Запуск бота и настройка автообновления...${NC}"

cd /root/gpt-telegram-bot
pm2 start src/index.js --name gpt-bot > /dev/null 2>&1
pm2 save > /dev/null 2>&1
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root > /dev/null 2>&1

cat > /root/update.sh << 'UPDATEEOF'
#!/bin/bash
cd /root/gpt-telegram-bot
git fetch origin main > /dev/null 2>&1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] Обновление бота..."
    git pull origin main
    npm install --production
    pm2 restart gpt-bot --update-env
    echo "[$(date)] ✅ Бот обновлён"
fi
UPDATEEOF

chmod +x /root/update.sh
(crontab -l 2>/dev/null | grep -v update.sh; echo "*/5 * * * * /root/update.sh >> /root/update.log 2>&1") | crontab -

echo -e "${GREEN}✅ Бот запущен, автообновление активно (каждые 5 минут)${NC}"

# ─── ФИНАЛ ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           ✅ Бот успешно развёрнут!                         ║"
echo "║                                                              ║"
echo "║  Домен:        https://${DOMAIN}"
echo "║  Логи бота:    pm2 logs gpt-bot                             ║"
echo "║  Статус:       pm2 status                                   ║"
echo "║  Лог апдейтов: tail -f /root/update.log                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

pm2 logs gpt-bot --lines 20 --nostream
