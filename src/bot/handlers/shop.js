import { getTariffs, savePurchase } from '../../services/supabase.js';
import { creditTokens } from '../../services/tokens.js';
import { config } from '../../config/index.js';

const hasYooKassa = !!(config.YOOKASSA_SHOP_ID && config.YOOKASSA_SECRET_KEY && config.YOOKASSA_RETURN_URL);

export const setupShop = (bot) => {

  // ── Главное меню покупки — выбор способа оплаты ──────────────────
  bot.hears('💳 Купить генерации', async (ctx) => {
    let tariffs;
    try {
      tariffs = await getTariffs();
    } catch (e) {
      return ctx.reply('❌ Не удалось загрузить тарифы. Попробуйте позже.');
    }

    if (!tariffs.length) {
      return ctx.reply('😔 Тарифы временно недоступны.');
    }

    const lines = tariffs.map(t =>
      `${t.name}\n` +
      `💰 ${t.tokens} токенов\n` +
      `⭐ Telegram Stars: ${t.stars}\n` +
      `💵 Оплата картой/СБП (RUB): ${t.price_rub}`
    ).join('\n\n');

    const payMethodsRow = [
      { text: '⭐ Telegram Stars', callback_data: 'pay_method:stars' },
      { text: '🇷🇺 ЮKassa (карта/СБП)', callback_data: 'pay_method:yookassa' },
    ];

    await ctx.reply(
      `🛒 *Пополнение токенов*\n\nВыберите способ оплаты, затем тариф:\n\n${lines}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            payMethodsRow,
          ],
        },
      }
    );
  });

  // ── Выбор способа оплаты ─────────────────────────────────────────
  bot.action(/^pay_method:(stars|yookassa)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const method = ctx.match[1];

    let tariffs;
    try {
      tariffs = await getTariffs();
    } catch (e) {
      return ctx.reply('❌ Не удалось загрузить тарифы. Попробуйте позже.');
    }

    if (!tariffs.length) {
      return ctx.reply('😔 Тарифы временно недоступны.');
    }

    const methodLabel = method === 'stars'
      ? '⭐ Telegram Stars'
      : '🇷🇺 ЮKassa (карта/СБП)';

    const lines = tariffs.map(t => {
      if (method === 'stars') {
        return `${t.name}\n💰 ${t.tokens} токенов — ${t.stars} ⭐`;
      }
      return `${t.name}\n💰 ${t.tokens} токенов — ${t.price_rub} ₽`;
    }).join('\n\n');

    const buttons = tariffs.map(t => ([{
      text: method === 'stars'
        ? `${t.name} — ${t.stars} ⭐`
        : `${t.name} — ${t.price_rub} ₽`,
      callback_data: `buy_${method}:${t.id}`,
    }]));

    await ctx.editMessageText(
      `🛒 *Пополнение токенов*\n\nСпособ оплаты: *${methodLabel}*\n\nВыберите тариф:\n\n${lines}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }
    ).catch(() => ctx.reply(
      `🛒 *Пополнение токенов*\n\nСпособ оплаты: *${methodLabel}*\n\nВыберите тариф:\n\n${lines}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }
    ));
  });

  // ── Покупка через Stars ──────────────────────────────────────────
  bot.action(/^buy_stars:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const tariffId = parseInt(ctx.match[1]);

    let tariffs;
    try {
      tariffs = await getTariffs();
    } catch (e) {
      return ctx.reply('❌ Ошибка загрузки тарифа.');
    }

    const tariff = tariffs.find(t => t.id === tariffId);
    if (!tariff) return ctx.reply('❌ Тариф не найден.');

    await ctx.replyWithInvoice({
      title:          tariff.name,
      description:    tariff.description || `${tariff.tokens} токенов для генераций`,
      payload:        `tariff_${tariff.id}_${ctx.from.id}`,
      provider_token: '',
      currency:       'XTR',
      prices:         [{ label: tariff.name, amount: tariff.stars }],
    });
  });

  // ── Покупка через YooKassa — заглушка ────────────────────────────
  bot.action(/^buy_yookassa:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const tariffId = parseInt(ctx.match[1]);

    let tariffs;
    try {
      tariffs = await getTariffs();
    } catch (e) {
      return ctx.reply('❌ Ошибка загрузки тарифа.');
    }

    const tariff = tariffs.find(t => t.id === tariffId);
    if (!tariff) return ctx.reply('❌ Тариф не найден.');

    return ctx.reply('Здесь будет ваша платёжка');
  });

  // ── pre_checkout_query обрабатывается в index.js ДО authMiddleware ─
  bot.on('successful_payment', async (ctx) => {
    const sp       = ctx.message.successful_payment;
    const payload  = sp.invoice_payload;
    const chargeId = sp.telegram_payment_charge_id;
    const match    = payload.match(/^tariff_(\d+)_(\d+)$/);
    if (!match) return;

    const tariffId = parseInt(match[1]);
    const userId   = ctx.from.id;

    let tariffs;
    try {
      tariffs = await getTariffs();
    } catch (e) {
      return ctx.reply('⚠️ Оплата получена, но ошибка тарифа. Обратитесь в поддержку.');
    }

    const tariff = tariffs.find(t => t.id === tariffId);
    if (!tariff) {
      return ctx.reply('⚠️ Оплата получена, но тариф не найден. Обратитесь в поддержку.');
    }

    await creditTokens(userId, tariff.tokens, `💳 Покупка: ${tariff.name} (${tariff.stars} ⭐)`);

    await savePurchase({
      user_id:         userId,
      tariff_id:       tariff.id,
      tariff_name:     tariff.name,
      tokens_credited: tariff.tokens,
      stars_paid:      tariff.stars,
      charge_id:       chargeId,
      payload,
    });

    await ctx.reply(
      `✅ *Оплата прошла успешно!*\n\n` +
      `Тариф: *${tariff.name}*\n` +
      `Начислено: *${tariff.tokens} 🪙*\n\n` +
      `Приятного использования! 🚀`,
      { parse_mode: 'Markdown' }
    );
  });
};
