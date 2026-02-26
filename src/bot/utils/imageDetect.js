export function isImageRequest(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();

  const ruDirect = [
    'нарисуй', 'нарисовать', 'нарисуйте',
    'сгенерируй', 'сгенерировать', 'сгенерируйте',
    'создай', 'создать', 'создайте',
    'сделай', 'сделать', 'сделайте',
    'покажи', 'нужна картинка', 'хочу картинку',
    'хочу изображение', 'хочу рисунок', 'хочу арт',
    'генерируй', 'генерировать',
    'изобрази', 'изобразить',
    'напиши картину', 'нарисуй мне', 'сгенерируй мне',
    'создай мне', 'сделай мне',
  ];

  const enDirect = [
    'draw', 'generate image', 'generate a', 'generate an',
    'create image', 'create a image', 'create an image',
    'create picture', 'create a picture',
    'make image', 'make a image', 'make an image',
    'make picture', 'make a picture',
    'show me image', 'show me a picture',
    'paint', 'illustrate', 'render',
  ];

  const visualWords = [
    'картинку', 'картинка', 'картину', 'картина',
    'изображение', 'изображения',
    'рисунок', 'рисунки',
    'арт', 'artwork', 'иллюстрацию', 'иллюстрация',
    'фото', 'фотографию', 'фотку',
    'постер', 'обои', 'баннер', 'лого', 'логотип',
    'аватар', 'аватарку', 'обложку',
    'picture', 'image', 'photo', 'illustration', 'poster',
  ];

  for (const word of ruDirect) {
    if (t.startsWith(word) || t.includes(' ' + word) || t.includes(word + ' ')) {
      return true;
    }
  }

  for (const word of enDirect) {
    if (t.includes(word)) return true;
  }

  const hasCreateVerb = /создай|сделай|сгенерируй|нарисуй|покажи|генерируй|изобрази|draw|create|make|generate|render|paint|show/.test(t);
  const hasVisual = visualWords.some(v => t.includes(v));
  if (hasCreateVerb && hasVisual) return true;

  return false;
}

export function detectImageSize(text) {
  const t = text.toLowerCase();
  if (t.includes('9:16') || t.includes('9 на 16')) return '1024x1536';
  if (t.includes('16:9') || t.includes('16 на 9')) return '1536x1024';
  if (t.includes('1:1') || t.includes('1 на 1') || t.includes('квадрат')) return '1024x1024';
  if (t.includes('4:3') || t.includes('4 на 3')) return '1536x1024';
  if (t.includes('3:4') || t.includes('3 на 4')) return '1024x1536';

  if (t.includes('вертикал') || t.includes('портрет') || t.includes('portrait') || t.includes('сторис') || t.includes('story')) {
    return '1024x1536';
  }
  if (t.includes('горизонт') || t.includes('широк') || t.includes('landscape') || t.includes('wide') || t.includes('обои')) {
    return '1536x1024';
  }

  return '1024x1024';
}

export function getSizeLabel(size) {
  const labels = {
    '1024x1024': '1:1 (квадрат)',
    '1024x1536': '9:16 (вертикальный)',
    '1536x1024': '16:9 (горизонтальный)',
  };
  return labels[size] || size;
}
