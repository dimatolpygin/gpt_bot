import { getContent } from '../../services/content.js';
import { mainReplyKeyboard } from '../keyboards/main.js';
import { gptMenu }           from '../keyboards/gptMenu.js';
import { nbModelKb }         from '../keyboards/imageMenuKb.js';
import { vidModelKb }        from '../keyboards/videoMenuKb.js';

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

  // /start
  bot.command('start', async (ctx) => {
    const { text, image_url } = await getContent('main_menu', '👋 Привет!');
    const extra = { reply_markup: mainReplyKeyboard().reply_markup, parse_mode: 'HTML' };
    if (image_url) {
      await ctx.replyWithPhoto(image_url, { ...extra, caption: text });
    } else {
      await ctx.reply(text, extra);
    }
  });

  // ReplyKeyboard — кнопка GPT
  bot.hears('🤖 GPT', async (ctx) => {
    const kb = await gptMenu(ctx.from.id);
    await sendWithContent(ctx, 'gpt_menu', kb, '🤖 GPT');
  });

  // ReplyKeyboard — кнопка Генерация изображений
  bot.hears('🎨 Генерация изображений', async (ctx) => {
    await sendWithContent(ctx, 'nb_menu', nbModelKb());
  });

  // ReplyKeyboard — кнопка Создание видео
  bot.hears('🎬 Создание видео', async (ctx) => {
    await sendWithContent(ctx, 'vid_menu', vidModelKb());
  });

  // action main_menu
  bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('👇 Используйте кнопки меню ниже')
      .catch(() => ctx.reply('👇 Используйте кнопки меню ниже'));
  });

  // action nb_menu
  bot.action('nb_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await editWithContent(ctx, 'nb_menu', nbModelKb());
  });

  // action vid_menu
  bot.action('vid_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await editWithContent(ctx, 'vid_menu', vidModelKb());
  });
};
