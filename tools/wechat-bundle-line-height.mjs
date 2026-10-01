// Versioned reproduction of ONLY Ir/De from the public bundle referenced by a
// historical real-browser checker stack. Not the entire/current official validator.
// Keep self-contained: Playwright serializes this function into the article frame.
export function scanCapturedBundleLineHeight(root) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const tags = new Set(['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'a']);
  const candidates = [];
  for (const node of root.querySelectorAll('*')) {
    if (!tags.has(node.tagName.toLowerCase())) continue;
    // Critical: fully wrapped text and naked text mixed with tokens are NOT equivalent.
    if (![...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim().length > 0)) continue;
    const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
    if (!text.length) continue;
    const style = win.getComputedStyle(node);
    const fontSize = parseFloat(style.fontSize);
    const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(style.lineHeight);
    const range = doc.createRange();
    range.selectNodeContents(node);
    const lineCount = [...range.getClientRects()].filter(rect => rect.height > 0).length;
    const contentHeight = range.getBoundingClientRect().height;
    const overlapping = Number.isFinite(lineHeight) && lineHeight === 0 ||
      lineCount >= 2 && contentHeight / lineCount < fontSize * 0.95;
    const marker = node.closest('[data-blockidx]')?.getAttribute('data-blockidx');
    candidates.push({
      tag: node.tagName.toLowerCase(), text: text.slice(0, 60),
      paragraph: marker && /^\d+$/.test(marker) ? Number(marker) + 1 : null,
      fontSize, lineHeight, lineCount, contentHeight,
      elementHeight: node.getBoundingClientRect().height, overlapping,
    });
  }
  return {
    version: '4da8090c',
    source: 'https://res.wx.qq.com/mpres/zh_CN/htmledition/js/default~media/appmsg_edit_v2_gray~media/get_article_structure_tmpl_fe.4da8090c.js',
    scope: 'Ir/De Range line-height fallback only; historical bundle, NOT a live WeChat verdict',
    candidates, warnings: candidates.filter(candidate => candidate.overlapping),
  };
}
