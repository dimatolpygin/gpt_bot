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

# ─── 2. SSH КЛЮЧ ────────────────────────────────────────────────────────────

echo -e "${YELLOW}[2/6] Настройка SSH ключа для GitHub...${NC}"
if [ ! -f ~/.ssh/id_ed25519 ]; then
    ssh-keygen -t ed25519 -C "deploy" -f ~/.ssh/id_ed25519 -N "" > /dev/null 2>&1
fi

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Добавьте этот ключ в GitHub:                                   ║"
echo "║  GitHub → Settings → SSH and GPG keys → New SSH key            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
cat ~/.ssh/id_ed25519.pub
echo ""
read -p "После добавления ключа нажмите Enter..."

ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
TEST=$(ssh -T git@github.com 2>&1)
if echo "$TEST" | grep -q "successfully authenticated"; then
    echo -e "${GREEN}✅ GitHub SSH подключен${NC}"
else
    echo -e "${RED}❌ Ошибка SSH. Проверьте что ключ добавлен в GitHub${NC}"
    exit 1
fi

# ─── 3. КЛОНИРОВАНИЕ ────────────────────────────────────────────────────────

echo -e "${YELLOW}[3/6] Клонирование репозитория...${NC}"
rm -rf /root/gpt-telegram-bot
git clone git@github.com:dimatolpygin/gpt_bot.git /root/gpt-telegram-bot > /dev/null 2>&1
cd /root/gpt-telegram-bot
npm install > /dev/null 2>&1
echo -e "${GREEN}✅ Репозиторий клонирован${NC}"

# ─── 4. ENV ФАЙЛ ────────────────────────────────────────────────────────────

echo -e "${YELLOW}[4/6] Настройка переменных окружения...${NC}"
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

# ─── 5. NGINX + SSL ─────────────────────────────────────────────────────────

echo -e "${YELLOW}[5/6] Настройка Nginx и SSL...${NC}"

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

# ─── 6. ЗАПУСК БОТА ─────────────────────────────────────────────────────────

echo -e "${YELLOW}[6/6] Запуск бота...${NC}"
cd /root/gpt-telegram-bot
pm2 start src/index.js --name gpt-bot
pm2 save
pm2 startup > /dev/null 2>&1

echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║              ✅ Бот успешно развёрнут!                          ║"
echo "║                                                                  ║"
echo "║  Домен:  https://${DOMAIN}                                      ║"
echo "║  Логи:   pm2 logs gpt-bot                                       ║"
echo "║  Статус: pm2 status                                             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

pm2 logs gpt-bot --lines 20 --nostream
