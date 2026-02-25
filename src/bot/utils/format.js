export function mdToHtml(text) {
  if (!text) return '';

  let result = text;

  const codeBlocks = [];
  result = result.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escHtml(code.trim())}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  const inlineCodes = [];
  result = result.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escHtml(code)}</code>`);
    return `%%INLINECODE_${idx}%%`;
  });

  result = escHtml(result);

  result = result.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => codeBlocks[i]);
  result = result.replace(/%%INLINECODE_(\d+)%%/g, (_, i) => inlineCodes[i]);

  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  result = result.replace(/(^|\s)\*([^\*\n]+)\*($|\s)/g, '$1<i>$2</i>$3');
  result = result.replace(/__(.+?)__/g, '<b>$1</b>');
  result = result.replace(/(^|\s)_([^_\n]+)_($|\s)/g, '$1<i>$2</i>$3');
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');

  result = result.replace(/^### (.+)$/gm, '<b>$1</b>');
  result = result.replace(/^## (.+)$/gm, '<b>$1</b>');
  result = result.replace(/^# (.+)$/gm, '<b>$1</b>');

  result = result.replace(/^---+$/gm, '──────────────');
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return result;
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
