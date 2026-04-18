export function isImageRequest(text) {
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
