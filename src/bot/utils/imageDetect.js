export function isImageRequest(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const patterns = [
    /нарисуй/, /нарисовать/, /сгенерируй\s*(мне)?\s*(картинку|изображение|фото|рисунок|арт)/,
    /создай\s*(мне)?\s*(картинку|изображение|фото|рисунок|арт)/,
    /сделай\s*(мне)?\s*(картинку|изображение|фото|рисунок)/,
    /покажи\s*(мне)?\s*(картинку|изображение|рисунок)/,
    /draw\s+me/, /generate\s+(an?\s+)?(image|picture|photo|art|illustration)/,
    /create\s+(an?\s+)?(image|picture|photo|art)/,
    /make\s+(an?\s+)?(image|picture|photo)/,
  ];
  return patterns.some(p => p.test(t));
}

export function detectImageSize(text) {
  if (!text) return '1024x1024';
  const t = text.toLowerCase();
  if (t.includes('вертикал') || t.includes('портрет') || t.includes('portrait')) {
    return '1024x1536';
  }
  if (t.includes('горизонт') || t.includes('широк') || t.includes('landscape') || t.includes('wide')) {
    return '1536x1024';
  }
  return '1024x1024';
}
