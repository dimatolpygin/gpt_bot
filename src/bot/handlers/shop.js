import { getTariffs, savePurchase } from '../../services/supabase.js';
import { creditTokens } from '../../services/tokens.js';

export const setupShop = (bot) => {

  // ── Показ тарифов ─────────────────────────────────────────────────
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
      `${t.name}\n💰 ${t.tokens} токенов — ${t.stars} ⭐`
    ).join('\n\n');

    const buttons = tariffs.map(t => ([{
      text: `${t.name} — ${t.stars} ⭐`,
      callback_data: `buy:${t.id}`,
    }]));

    await ctx.reply(
      `🛒 *Пополнение токенов*\n\nВыберите тариф:\n\n${lines}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }
    );
  });

  // ── Нажата кнопка тарифа → Stars инвойс ──────────────────────────
  bot.action(/^buy:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const tariffId = parseInt(ctx.match[1]);

    let tariffs;
    try {
      tariffs = await getTariffs();
    } catch (e) {
      return ctx.reply('❌ Ошибка загрузки тарифа.');
    }

    const tariff = tariffs.find(t => t.id === tariffId);
    if (!tariff) return ctx.reply('❌ Тариф не найден.');

    // provider_token: '' обязателен для Telegram Stars (XTR)
    await ctx.replyWithInvoice({
      title:          tariff.name,
      description:    tariff.description || `${tariff.tokens} токенов для генераций`,
      payload:        `tariff_${tariff.id}_${ctx.from.id}`,
      provider_token: '',
      currency:       'XTR',
      prices:         [{ label: tariff.name, amount: tariff.stars }],
    });
  });

  // ── Pre-checkout — отвечаем немедленно (лимит 10 сек) ────────────
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch (e) {
      console.error('[Shop] pre_checkout_query error:', e.message);
    }
  });

  // ── Успешная оплата → начислить токены + записать покупку ─────────
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
