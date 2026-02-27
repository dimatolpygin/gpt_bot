import { Markup } from 'telegraf';

export const mainMenu = async () => {
  const rows = [
    [Markup.button.callback('🤖 GPT', 'menu_gpt')],
    [Markup.button.callback('🎨 Генерация изображений', 'nb_menu')],
    [Markup.button.callback('🎬 Создание видео', 'vid_menu')],
  ];

  return Markup.inlineKeyboard(rows);
};
