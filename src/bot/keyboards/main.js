import { Markup } from 'telegraf';

const buildKeyboard = () =>
  Markup.keyboard([
    ['🤖 GPT'],
    ['🎨 Генерация изображений', '🎬 Создание видео'],
    ['👤 Профиль', '💳 Купить генерации'],
  ]).resize().persistent();

export const mainReplyKeyboard = () => buildKeyboard();
export const mainMenu = async () => buildKeyboard();
