import { getContent } from '../../services/content.js';
import { mainReplyKeyboard } from '../keyboards/main.js';
import { gptMenu }           from '../keyboards/gptMenu.js';
import { nbModelKb }         from '../keyboards/imageMenuKb.js';
import { vidModelKb }        from '../keyboards/videoMenuKb.js';
import { initUserTokens, getBalance, formatBalance, creditTokens, getReferralBonus } from '../../services/tokens.js';
import { getUserById, getReferralByReferee, createReferral } from '../../services/supabase.js';

const sendWithContent = async (ctx, key, kb, fallback = '') => {
  const { text, image_url } = await getContent(key, fallback);
  const extra = { parse_mode: 'HTML', reply_markup: kb.reply_markup };
  if (image_url) {
    await ctx.replyWithPhoto(image_url, { ...extra, caption: text });
  } else {
    await ctx.reply(text, extra);
  }
};

const editWithContent = async (ctx, key, kb, fallback = '') => {
  const { text, image_url } = await getContent(key, fallback);
  const extra = { parse_mode: 'HTML', reply_markup: kb.reply_markup };
  if (image_url) {
    await ctx.editMessageMedia(
      { type: 'photo', media: image_url, caption: text, parse_mode: 'HTML' }, extra
    ).catch(() => ctx.replyWithPhoto(image_url, { ...extra, caption: text }));
  } else {
    await ctx.editMessageText(text, extra).catch(() => ctx.reply(text, extra));
  }
};

export const setupStart = (bot) => {

  bot.command('start', async (ctx) => {
    const uid = ctx.from.id;
    const text   = ctx.message.text || '';
    const parts  = text.split(/\s+/);
    const param  = parts[1] || '';

    await initUserTokens(uid);

    // ── Реферальная логика ──────────────────────────────────────────
    if (param.startsWith('ref_')) {
      const refIdRaw = param.replace('ref_', '');
      const refId    = parseInt(refIdRaw, 10);
      if (refId && refId !== uid) {
        const already = await getReferralByReferee(uid);
        if (!already) {
          const refUser = await getUserById(refId);
          if (refUser) {
            const bonus = await getReferralBonus();
            if (bonus > 0) {
              const refRow = await createReferral({ referrerId: refId, refereeId: uid, tokens: bonus });
              if (refRow) {
                await creditTokens(refId, bonus, `👥 Реферал: @${ctx.from.username || uid}`);
                await ctx.telegram.sendMessage(
                  refId,
                  `👥 <b>Новый реферал!</b>\n\n` +
                  `Пользователь: <code>${ctx.from.first_name || ''} ${ctx.from.last_name || ''}</code> (@${ctx.from.username || 'без ника'})\n` +
                  `Бонус: <b>${bonus} 🪙</b>`,
                  { parse_mode: 'HTML' }
                ).catch(() => {});
              }
            }
          }
        }
      }
    }

    const balance = await getBalance(uid);
    const { text: mainText, image_url } = await getContent('main_menu', '👋 Привет!');
    const annotatedText = `${mainText}\n\n💰 Ваш баланс: ${formatBalance(balance)}`;
    const extra = { reply_markup: mainReplyKeyboard().reply_markup, parse_mode: 'HTML' };
    if (image_url) {
      await ctx.replyWithPhoto(image_url, { ...extra, caption: annotatedText });
    } else {
      await ctx.reply(annotatedText, extra);
    }
  });

  bot.hears('🤖 GPT', async (ctx) => {
    const kb = await gptMenu(ctx.from.id);
    await sendWithContent(ctx, 'gpt_menu', kb, '🤖 GPT');
  });

  bot.hears('🎨 Генерация изображений', async (ctx) => {
    await sendWithContent(ctx, 'nb_menu', await nbModelKb());
  });

  bot.hears('🎬 Создание видео', async (ctx) => {
    await sendWithContent(ctx, 'vid_menu', await vidModelKb());
  });

  bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('👇 Используйте кнопки меню ниже')
      .catch(() => ctx.reply('👇 Используйте кнопки меню ниже'));
  });

  bot.action('nb_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await editWithContent(ctx, 'nb_menu', await nbModelKb());
  });

  bot.action('vid_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await editWithContent(ctx, 'vid_menu', await vidModelKb());
  });
};
