import { Markup } from 'telegraf';

export const profileKb = () => Markup.inlineKeyboard([
  [
    Markup.button.callback('🖼 Модель фото', 'profile_img_model'),
    Markup.button.callback('🎬 Модель видео', 'profile_vid_model'),
  ],
  [
    Markup.button.callback('🖼 Формат фото', 'profile_img_format'),
    Markup.button.callback('🖼 Качество фото', 'profile_img_quality'),
  ],
  [
    Markup.button.callback('🎬 Длительность видео', 'profile_vid_dur'),
    Markup.button.callback('🎬 Формат видео', 'profile_vid_aspect'),
  ],
]);
