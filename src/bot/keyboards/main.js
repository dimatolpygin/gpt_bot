import { Markup } from 'telegraf';

// Экспортируем тексты кнопок — используется в handlers для фильтрации
export const MENU_BUTTON_TEXTS = [
  '🤖 GPT',
  '🎨 Генерация изображений',
  '🎬 Создание видео',
  '👤 Профиль',
  '💳 Купить генерации',
];

const buildKeyboard = () =>
  Markup.keyboard([
    ['🤖 GPT'],
    ['🎨 Генерация изображений', '🎬 Создание видео'],
    ['👤 Профиль', '💳 Купить генерации'],
  ]).resize().persistent();

export const mainReplyKeyboard = () => buildKeyboard();
export const mainMenu = async () => buildKeyboard();
