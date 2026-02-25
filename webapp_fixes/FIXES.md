# FIXES — WebApp Server Startup

## Корневая причина
`startServer()` вызывается ПОСЛЕ `await bot.launch()`.
`bot.launch()` в Telegraf блокирует поток (long polling), поэтому Express никогда не стартует.

## Изменения

### src/index.js
**ДО:**
```js
await bot.launch();
await startServer(); // ← никогда не достигается
```

**ПОСЛЕ:**
```js
try {
  await startServer();
} catch (err) {
  console.error('[WebApp] Failed to start:', err);
  process.exit(1);
}

await bot.launch(); // блокирующий вызов — всегда последний
```

### src/server.js
- Добавлен try/catch вокруг всей функции startServer()
- app.listen обёрнут в Promise для корректного await
- Добавлены console.log на каждом этапе для диагностики
- Проверены ESM-импорты (import вместо require)

## Команды для диагностики
```bash
# Проверить установленные пакеты
npm list express ioredis @supabase/supabase-js telegraf

# Проверить порт (Windows PowerShell)
netstat -aon | findstr :3000

# Запуск с дополнительным логированием
NODE_DEBUG=net node src/index.js
```

## После фикса — проверить WebApp
1. Запустить бота локально
2. Убедиться, что Cloudflare Tunnel видит порт 3000 (не 502)
3. Открыть WebApp через Telegram — проверить HMAC валидацию
4. Проверить тёмную/светлую тему

## Следующие шаги
- [ ] Деплой на VPS через Docker
- [ ] Заменить Cloudflare Tunnel на постоянный домен
- [ ] Финальное тестирование с 8-10 пользователями
