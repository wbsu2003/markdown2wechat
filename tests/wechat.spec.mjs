import { scanCapturedBundleLineHeight } from '../tools/wechat-bundle-line-height.mjs';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pageHtml } from '../src/page.js';

let server, baseURL;
const vendors = {
  '/vendor/marked.js': readFileSync(new URL('../src/vendor/marked.umd.js.txt', import.meta.url)),
  '/vendor/highlight.js': readFileSync(new URL('../src/vendor/highlight.min.js.txt', import.meta.url)),
};
const sample = [
  '# 标题', '', '## 小标题', '',
  '通过 **SSH** 登录，执行 `echo hi`，*注意* ~~旧命令~~ [文档](https://example.com/?a=1&b=2)。', '',
  '> 引用 **重点**', '',
  '3. 第一项 **加粗**', '4. 第二项', '   - 嵌套 `代码`', '',
  '| 功能 | 说明 |', '| --- | --- |', '| **复制** | `HTML` |', '',
  '![图注](https://example.com/test.svg)', '',
  '```yaml', 'services:', '  app: value', '\timage: "a < b & c"', '', '  last: true', '```',
].join('\n');

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const vendor = vendors[req.url];
    res.setHeader('Content-Type', vendor ? 'application/javascript' : 'text/html; charset=utf-8');
    res.end(vendor || pageHtml('test', '20261001'));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="320"></svg>',
  }));
  await page.goto(baseURL);
});

async function setMarkdown(page, markdown) {
  await page.locator('#editor').fill(markdown);
  await page.waitForTimeout(200);
}
async function captureClipboard(page, method = 'async') {
  await page.evaluate(method => {
    window.copied = null;
    window.ClipboardItem = class {
      constructor(blobs) {
        if (method === 'throw') throw new Error('unsupported ClipboardItem');
        this.blobs = blobs;
      }
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: method === 'legacy' ? undefined : {
      write(items) {
        if (method === 'reject') return new Promise((resolve, reject) => { window.rejectCopy = reject; });
        return Promise.all([items[0].blobs['text/html'].text(), items[0].blobs['text/plain'].text()])
          .then(([html, text]) => { window.copied = { html, text }; });
      },
    } });
    document.execCommand = cmd => {
      if (cmd !== 'copy') return false;
      const data = new DataTransfer();
      const event = new ClipboardEvent('copy', { clipboardData: data, cancelable: true, bubbles: true });
      document.dispatchEvent(event);
      window.copied = { html: data.getData('text/html'), text: data.getData('text/plain') };
      return event.defaultPrevented;
    };
  }, method);
}

// This is the previously observed backend heuristic, NOT an official validator.
async function geometry(page) {
  return page.locator('#preview > section > p').first().evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    const bbox = Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top));
    const font = parseFloat(getComputedStyle(el).fontSize);
    return { rects: rects.length, average: bbox / rects.length, threshold: font * 0.95 };
  });
}

for (const width of [375, 585, 677]) {
  test(`inline simplification reduces observed false-positive geometry at ${width}px`, async ({ page }) => {
    await setMarkdown(page, '通过 **SSH** 登录。');
    await page.locator('.phone').evaluate((el, width) => { el.style.maxWidth = 'none'; el.style.width = width + 'px'; }, width);
    const before = await geometry(page);
    expect(before.average).toBeLessThan(before.threshold);
    await page.locator('#renderMode').selectOption('simple');
    const after = await geometry(page);
    expect(after.rects).toBe(1);
    expect(after.average).toBeGreaterThan(after.threshold);
    await setMarkdown(page, ('一段含 **加粗** 和 `代码` 的多行正文。').repeat(12));
    expect((await geometry(page)).rects).toBeGreaterThan(1);
    const multiline = await geometry(page);
    expect(multiline.average).toBeGreaterThan(multiline.threshold);
  });
}

test('simple mode is opt-in, reversible, and preserves content and code indentation', async ({ page }) => {
  await setMarkdown(page, sample);
  await expect(page.locator('#preview img')).toHaveAttribute('data-w', '600');
  const original = await page.locator('#preview').innerHTML();
  await expect(page.locator('#compatNote')).toBeHidden();
  await page.locator('#renderMode').selectOption('simple');
  await expect(page.locator('#compatNote')).toBeVisible();
  await expect(page.locator('#preview strong, #preview em, #preview del, #preview a, #preview code, #preview pre')).toHaveCount(0);
  await expect(page.locator('#preview')).toContainText('〔已删除：旧命令〕');
  await expect(page.locator('#preview')).toContainText('文档（https://example.com/?a=1&b=2）');
  await expect(page.locator('#preview ol')).toHaveAttribute('start', '3');
  await expect(page.locator('#preview blockquote')).toContainText('引用 重点');
  await expect(page.locator('#preview table')).toHaveCount(1);
  await expect(page.locator('#preview img')).toHaveAttribute('data-ratio', '0.5333');
  const lines = page.locator('#preview p').filter({ hasText: 'app: value' });
  expect(await lines.textContent()).toBe('\u00a0\u00a0app:\u00a0value');
  const escaped = page.locator('#preview p').filter({ hasText: 'image:' });
  expect(await escaped.textContent()).toBe('\u00a0'.repeat(4) + 'image:\u00a0"a\u00a0<\u00a0b\u00a0&\u00a0c"');
  expect(await escaped.locator('xpath=..').locator(':scope > p').count()).toBe(5);
  await expect(escaped.locator('xpath=..').locator('p > br')).toHaveCount(1);
  await expect(page.locator('#editor')).toHaveValue(sample);
  await page.locator('#renderMode').selectOption('styled');
  await expect(page.locator('#preview img')).toHaveAttribute('data-w', '600');
  expect(await page.locator('#preview').innerHTML()).toBe(original);
});

test('headings remain safe against editor font defaults in all modes', async ({ page }) => {
  await page.addStyleTag({ content: 'h1 {font-size:30px} h2 {font-size:22.5px} h3 {font-size:20px}' });
  await setMarkdown(page, sample);
  for (const mode of ['styled', 'color', 'simple']) {
    await page.locator('#renderMode').selectOption(mode);
    const bad = await page.locator('#preview [style]').evaluateAll(nodes => nodes.filter(el => {
      const s = getComputedStyle(el);
      return el.textContent.trim() && parseFloat(s.lineHeight) <= parseFloat(s.fontSize);
    }).map(el => el.outerHTML));
    expect(bad).toEqual([]);
  }
});

for (const method of ['async', 'legacy', 'throw']) {
  test(`clipboard ${method} copies latest rendered content, not Markdown source`, async ({ page }) => {
    await captureClipboard(page, method);
    await setMarkdown(page, '旧正文');
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.value = '# 新标题\n\n这是 **最新** 正文。';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('copyBtn').click();
    });
    await expect.poll(() => page.evaluate(() => window.copied)).not.toBeNull();
    const payload = await page.evaluate(() => window.copied);
    expect(payload.html).toContain('<strong');
    expect(payload.html).not.toContain('旧正文');
    expect(payload.text).toContain('这是 最新 正文。');
    expect(payload.text).not.toMatch(/#|\*\*/);
    expect(payload.html).toBe(await page.locator('#preview').innerHTML());
    await expect(page.locator('body > div[style*="-10000px"]')).toHaveCount(0);
  });
}

test('async rejection falls back to the original snapshot even after editing and switching mode', async ({ page }) => {
  await setMarkdown(page, '原来 **这份** 正文');
  await captureClipboard(page, 'reject');
  const original = await page.locator('#preview').innerHTML();
  await page.locator('#copyBtn').click();
  await setMarkdown(page, '后来这份正文');
  await page.locator('#renderMode').selectOption('simple');
  await page.evaluate(() => window.rejectCopy(new Error('permission denied')));
  await expect.poll(() => page.evaluate(() => window.copied?.html)).toBe(original);
});

test('simple clipboard matches preview; loaded image dimensions and notice boundaries are preserved', async ({ page }) => {
  await setMarkdown(page, sample);
  await page.locator('#renderMode').selectOption('simple');
  await expect(page.locator('#preview img')).toHaveAttribute('data-w', '600');
  const html = await page.locator('#preview').innerHTML();
  await captureClipboard(page);
  await page.locator('#copyBtn').click();
  await expect.poll(() => page.evaluate(() => window.copied?.html)).toBe(html);
  expect((await page.evaluate(() => window.copied)).text).not.toContain('不保证通过');
});

test('front matter only does not copy the empty placeholder', async ({ page }) => {
  await captureClipboard(page);
  await setMarkdown(page, '---\ntitle: metadata only\n---\n');
  await page.locator('#copyBtn').click();
  expect(await page.evaluate(() => window.copied)).toBeNull();
  await expect(page.locator('#toast')).toHaveText('没有可复制的正文');
});


test('simple images fill every tested content width and preserve the 596x595 screenshot ratio', async ({ page }, testInfo) => {
  await page.route('https://example.com/raidrive.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="596" height="595"></svg>',
  }));
  await setMarkdown(page, '以 RaiDrive 为例\n\n![](https://example.com/raidrive.svg)\n\n在资源管理器中打开');
  const images = page.locator('#preview img');
  await expect(images).toHaveAttribute('data-w', '596');
  await page.locator('#renderMode').selectOption('simple');
  await expect(images).toHaveAttribute('data-w', '596');
  const measurements = [];
  for (const width of [375, 585, 677]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#preview').evaluate((el, width) => {
      el.style.cssText = 'position:fixed;top:0;left:0;width:' + width + 'px;height:auto;overflow:visible;';
    }, width);
    const geometry = await images.evaluate(img => ({
      width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height,
      containerWidth: img.parentElement.getBoundingClientRect().width,
      declaredWidth: img.style.width, declaredHeight: img.style.height,
      dataWidth: img.getAttribute('data-w'), ratio: img.getAttribute('data-ratio'),
    }));
    measurements.push(geometry);
    expect(geometry.declaredWidth).toBe('100%');
    expect(geometry.declaredHeight).toBe('auto');
    expect(geometry.width).toBeCloseTo(geometry.containerWidth, 1);
    expect(geometry.height / geometry.width).toBeCloseTo(595 / 596, 3);
    expect(geometry.dataWidth).toBe('596');
    expect(geometry.ratio).toBe('0.9983');
  }
  await testInfo.attach('responsive-image-measurements', {
    body: JSON.stringify(measurements, null, 2), contentType: 'application/json',
  });
  // Original styling remains intrinsic-size-capped; switching back must be reversible.
  await page.locator('#renderMode').selectOption('styled');
  await expect(images).toHaveAttribute('data-w', '596');
  expect(await images.evaluate(img => img.getBoundingClientRect().width)).toBeCloseTo(596, 1);
  expect(measurements[2].width).toBeGreaterThan(596);
  await page.locator('#renderMode').selectOption('simple');
  // Restore normal layout before clicking: the measurement overlay covers the toolbar.
  await page.locator('#preview').evaluate(el => el.removeAttribute('style'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await captureClipboard(page);
  await page.locator('#copyBtn').click();
  await expect.poll(() => page.evaluate(() => window.copied?.html)).not.toBeUndefined();
  expect(await page.evaluate(() => window.copied.html)).toContain('width:100%;height:auto;');
});

test('unloaded simple image keeps responsive CSS without inventing intrinsic size metadata', async ({ page }) => {
  await page.route('https://example.com/unavailable.png', route => route.abort());
  await setMarkdown(page, '![](https://example.com/unavailable.png)');
  await page.locator('#renderMode').selectOption('simple');
  const metadata = await page.locator('#preview img').evaluate(img => ({
    width: img.style.width, height: img.style.height, naturalWidth: img.naturalWidth,
    dataWidth: img.getAttribute('data-w'), ratio: img.getAttribute('data-ratio'),
  }));
  expect(metadata).toEqual({ width: '100%', height: 'auto', naturalWidth: 0, dataWidth: null, ratio: null });
});


test('color mode restores accents and links without changing the known simple fallback', async ({ page }) => {
  await setMarkdown(page, sample);
  await expect(page.locator('#preview img')).toHaveAttribute('data-w', '600');
  const original = await page.locator('#preview').innerHTML();
  await page.locator('#renderMode').selectOption('simple');
  await expect(page.locator('#preview img')).toHaveAttribute('data-w', '600');
  const simple = await page.locator('#preview').innerHTML();
  const simpleNotice = await page.locator('#compatNote').textContent();
  await page.locator('#renderMode').selectOption('color');
  await expect(page.locator('#compatNote')).toContainText('其他文章与微信后台版本仍需核验');
  await expect(page.locator('#preview strong').first()).toHaveCSS('color', 'rgb(239, 112, 96)');
  await expect(page.locator('#preview em')).toHaveCSS('font-style', 'italic');
  await expect(page.locator('#preview del')).toContainText('旧命令');
  await expect(page.locator('#preview a')).toHaveAttribute('href', 'https://example.com/?a=1&b=2');
  await expect(page.locator('#preview a')).toHaveCSS('color', 'rgb(87, 107, 149)');
  await expect(page.locator('#preview span').filter({ hasText: /^echo hi$/ })).toHaveCSS('color', 'rgb(239, 112, 96)');
  await expect(page.locator('#preview code, #preview pre, #preview h2 > span, #preview li > section')).toHaveCount(0);
  expect(await page.locator('#preview img').evaluate(el => el.style.width)).toBe('100%');
  const line = page.locator('#preview p').filter({ hasText: 'app: value' });
  expect((await line.textContent()).replaceAll(String.fromCharCode(160), ' ')).toBe('  app: value');
  const codeBlock = line.locator('xpath=..');
  await expect(codeBlock.locator('span span span')).toHaveCount(0);
  await expect(codeBlock.locator(':scope > p')).toHaveCount(5);
  await expect(codeBlock.locator('p > br')).toHaveCount(1);
  await expect(page.locator('#editor')).toHaveValue(sample);
  await page.locator('#renderMode').selectOption('simple');
  await expect(page.locator('#preview img')).toHaveAttribute('data-w', '600');
  expect(await page.locator('#preview').innerHTML()).toBe(simple);
  expect(await page.locator('#compatNote').textContent()).toBe(simpleNotice);
  await page.locator('#renderMode').selectOption('styled');
  await expect(page.locator('#preview img')).toHaveAttribute('data-w', '600');
  expect(await page.locator('#preview').innerHTML()).toBe(original);
  await expect(page.locator('#compatNote')).toBeHidden();
});

// Compare visible character colors, not just the presence of a few colored spans.
function characterColors(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const output = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const style = getComputedStyle(node.parentElement);
    for (const char of node.textContent) {
      if (char.trim()) output.push({ char, color: style.color, italic: style.fontStyle, weight: style.fontWeight });
    }
  }
  return output;
}

test('color mode keeps the original per-character code palette using paragraph text runs with flat tokens', async ({ page }) => {
  const source = ['// comment', 'const answer = 42;', '  console.log(`hello ${answer}`);', '', '/* first', '   second */'].join(String.fromCharCode(10));
  await setMarkdown(page, ['```javascript', source, '```'].join(String.fromCharCode(10)));
  const original = await page.locator('#preview pre code').evaluate(characterColors);
  expect(new Set(original.map(part => part.color)).size).toBeGreaterThan(3);
  await page.locator('#renderMode').selectOption('color');
  const rows = page.locator('#preview p');
  await expect(rows).toHaveCount(6);
  const block = rows.first().locator('xpath=..');
  expect(await block.evaluate(characterColors)).toEqual(original);
  expect(await rows.evaluateAll(nodes => nodes.map(el => el.textContent.replaceAll(String.fromCharCode(160), ' ')).join(String.fromCharCode(10)))).toBe(source);
  await expect(block.locator('span span span, pre, code')).toHaveCount(0);
  await expect(rows.first().locator('span')).toHaveCount(0);
  await expect(rows.first()).toHaveCSS('color', 'rgb(92, 99, 112)');
});

for (const method of ['async', 'legacy']) {
  test(`color mode ${method} clipboard keeps the same colors and readable text as the preview`, async ({ page }) => {
    await setMarkdown(page, sample);
    await page.locator('#renderMode').selectOption('color');
    await expect(page.locator('#preview img')).toHaveAttribute('data-w', '600');
    await captureClipboard(page, method);
    const html = await page.locator('#preview').innerHTML();
    const text = await page.locator('#preview').innerText();
    await page.locator('#copyBtn').click();
    await expect.poll(() => page.evaluate(() => window.copied?.html)).toBe(html);
    expect(await page.evaluate(() => window.copied.text)).toBe(text);
    expect(html).toContain('#ef7060');
    expect(html).toContain('width:100%;height:auto;');
  });
}

test('color mode unknown-language code stays escaped and preserves tabs and blank lines', async ({ page }) => {
  const source = ['<script>window.codeExecuted = true;</script>', String.fromCharCode(9) + 'a < b & c', '', 'last'].join(String.fromCharCode(10));
  await setMarkdown(page, ['```unknown-lang', source, '```'].join(String.fromCharCode(10)));
  await page.locator('#renderMode').selectOption('color');
  await expect(page.locator('#preview script, #preview pre, #preview code')).toHaveCount(0);
  expect(await page.evaluate(() => window.codeExecuted)).toBeUndefined();
  const rows = page.locator('#preview p');
  await expect(rows).toHaveCount(4);
  expect(await rows.evaluateAll(nodes => nodes.map(el => el.textContent.replaceAll(String.fromCharCode(160), ' ')).join(String.fromCharCode(10)))).toBe(source.replaceAll(String.fromCharCode(9), '    '));
});

for (const width of [375, 585, 677]) {
  test(`color text runs preserve mixed content and remove captured fallback hits at ${width}px`, async ({ page }) => {
    const markdown = [
      '## 标题 **强调**', '',
      '通过 **SSH** 登录，配置 `STRM`，打开 [项目 **文档**](https://example.com)。', '',
      '- 列表 **重点** 和 *斜体*', '',
      '| 项目 | 说明 |', '| --- | --- |', '| 混合 **文字** | `代码` 和文本 |', '',
      '```bash', 'mkdir -p /volume1/docker/litepan/{data,log,plugins,strm}',
      'cd /volume1/docker/litepan', '  -v $(pwd)/data:/app/data', '```', '',
      '```yaml', 'services:', '  app:', '    image: litepan:latest', '```',
    ].join(String.fromCharCode(10));
    // Render the previous color structure via the same renderer, omitting ONLY normalization.
    const unnormalized = pageHtml('test', '').replace('if (colorMode) normalizeColorTextRuns(preview);', '');
    await page.route(baseURL + '/', route => route.fulfill({ contentType: 'text/html', body: unnormalized }));
    await page.goto(baseURL);
    await setMarkdown(page, markdown);
    await page.locator('#renderMode').selectOption('color');
    const constrainWidth = () => page.locator('#preview').evaluate((el, width) => {
      el.style.cssText += ';position:fixed;left:0;top:0;width:' + width + 'px;';
    }, width);
    await constrainWidth();
    const before = await page.locator('#preview').evaluate(scanCapturedBundleLineHeight);
    expect(before.warnings.some(w => w.text.startsWith('通过'))).toBe(true);
    expect(before.warnings.some(w => w.text.startsWith('cd '))).toBe(true);
    const palette = await page.locator('#preview').evaluate(characterColors);
    const text = await page.locator('#preview').innerText();
    const dimensions = () => page.locator('#preview p, #preview h2, #preview li, #preview td').evaluateAll(nodes =>
      nodes.map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
    const bounds = await dimensions();
    await page.unroute(baseURL + '/');
    await page.goto(baseURL);
    await setMarkdown(page, markdown);
    await page.locator('#renderMode').selectOption('color');
    await constrainWidth();
    const after = await page.locator('#preview').evaluate(scanCapturedBundleLineHeight);
    expect(after.warnings).toEqual([]);
    expect(await page.locator('#preview').evaluate(characterColors)).toEqual(palette);
    expect(await page.locator('#preview').innerText()).toBe(text);
    expect(await dimensions()).toEqual(bounds);
    await expect(page.locator('#preview a')).toHaveAttribute('href', 'https://example.com');
    await captureClipboard(page);
    await page.locator('#copyBtn').click();
    await expect.poll(() => page.evaluate(() => window.copied?.html)).toBe(await page.locator('#preview').innerHTML());
  });
}

test('color normalization does not wrap images or block descendants in an inline text run', async ({ page }) => {
  await setMarkdown(page, [
    '<p>图前 <img src="https://example.com/pic.png"> 图后</p>', '',
    '<div>块前 <section>内部块</section> 块后</div>', '',
    '<p>普通纯文本</p>',
  ].join(String.fromCharCode(10)));
  await page.locator('#renderMode').selectOption('color');
  await expect(page.locator('#preview p > img')).toHaveCount(1);
  await expect(page.locator('#preview div > section')).toHaveCount(1);
  await expect(page.locator('#preview span img, #preview span section')).toHaveCount(0);
  await expect(page.locator('#preview p').filter({ hasText: '普通纯文本' }).locator('span')).toHaveCount(0);
});

for (const width of [375, 585, 677]) {
  test(`color H2 background fits text and wraps within ${width}px`, async ({ page }) => {
    await setMarkdown(page, ['## 简介', '', '## 更长一些的标题', '', '## 标题 **强调**', '', '## ' + '长标题内容'.repeat(30), '', '## ' + 'LongHeading'.repeat(30)].join('\n'));
    await page.locator('#renderMode').selectOption('color');
    await page.locator('#preview').evaluate((el, width) => {
      el.style.cssText += ';position:fixed;left:0;top:0;width:' + width + 'px;';
    }, width);
    const measure = root => Array.from(root.querySelectorAll('h2')).map(el => {
      const rect = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      return { width: rect.width, height: rect.height, textWidth: range.getBoundingClientRect().width,
        parentWidth: el.parentElement.getBoundingClientRect().width,
        overflow: el.scrollWidth > el.clientWidth + 1, display: getComputedStyle(el).display };
    });
    const bounds = await page.locator('#preview').evaluate(measure);
    expect(bounds[0].width).toBeLessThan(bounds[1].width);
    for (const item of bounds.slice(0, 3)) {
      expect(item.width).toBeLessThan(item.parentWidth);
      expect(Math.abs(item.width - item.textWidth - 45)).toBeLessThan(2);
    }
    for (const item of bounds) {
      expect(item.display).toBe('block');
      expect(item.width).toBeLessThanOrEqual(item.parentWidth + 1);
      expect(item.overflow).toBe(false);
    }
    expect(bounds[3].height).toBeGreaterThan(bounds[0].height);
    expect(bounds[4].height).toBeGreaterThan(bounds[0].height);
    expect((await page.locator('#preview').evaluate(scanCapturedBundleLineHeight)).warnings).toEqual([]);
    await captureClipboard(page);
    await page.locator('#copyBtn').click();
    await expect.poll(() => page.evaluate(() => window.copied?.html)).toBe(await page.locator('#preview').innerHTML());
    await page.locator('#preview').evaluate(el => { el.innerHTML = window.copied.html; });
    expect(await page.locator('#preview').evaluate(measure)).toEqual(bounds);
    await page.locator('#renderMode').selectOption('simple');
    const simple = await page.locator('#preview').evaluate(measure);
    expect(simple[0].width).toBe(simple[0].parentWidth);
  });
}

for (const width of [375, 585, 677]) {
  test(`color restores Mac code chrome and inline code styling at ${width}px`, async ({ page }) => {
    await setMarkdown(page, sample);
    await page.locator('#preview').evaluate((el, width) => {
      el.style.cssText += ';position:fixed;left:0;top:0;width:' + width + 'px;';
    }, width);
    const originalBar = page.locator('#preview pre').locator('xpath=preceding-sibling::section');
    const barHTML = await originalBar.evaluate(el => el.outerHTML);
    const originalBox = await originalBar.boundingBox();
    const properties = ['fontSize', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginLeft', 'marginRight', 'backgroundColor', 'borderRadius', 'color', 'fontFamily'];
    const inlineStyle = await page.locator('#preview p > code').first().evaluate((el, props) => Object.fromEntries(props.map(p => [p, getComputedStyle(el)[p]])), properties);
    const codePadding = await page.locator('#preview pre > code').evaluate(el => getComputedStyle(el).padding);
    const decoration = await page.locator('#preview pre').locator('xpath=..').evaluate(el => {
      const s = getComputedStyle(el); return [s.backgroundColor, s.borderRadius, s.boxShadow];
    });
    await page.locator('#renderMode').selectOption('color');
    const row = page.locator('#preview p').filter({ hasText: 'app: value' });
    const body = row.locator('xpath=..');
    const bar = body.locator('xpath=preceding-sibling::section');
    expect(await bar.evaluate(el => el.outerHTML)).toBe(barHTML);
    const box = await bar.boundingBox();
    expect(box.width).toBe(originalBox.width);
    expect(box.height).toBe(originalBox.height);
    expect(await body.evaluate(el => getComputedStyle(el).padding)).toBe(codePadding);
    expect(await body.locator('xpath=..').evaluate(el => {
      const s = getComputedStyle(el); return [s.backgroundColor, s.borderRadius, s.boxShadow];
    })).toEqual(decoration);
    const inline = page.locator('#preview span').filter({ hasText: /^echo hi$/ });
    expect(await inline.evaluate((el, props) => Object.fromEntries(props.map(p => [p, getComputedStyle(el)[p]])), properties)).toEqual(inlineStyle);
    const scan = await page.locator('#preview').evaluate(scanCapturedBundleLineHeight);
    expect(scan.warnings).toEqual([]);
    await captureClipboard(page);
    await page.locator('#copyBtn').click();
    await expect.poll(() => page.evaluate(() => window.copied?.html)).toBe(await page.locator('#preview').innerHTML());
    expect(await page.evaluate(() => window.copied.html)).toContain(barHTML);
    await page.locator('#renderMode').selectOption('simple');
    expect(await page.locator('#preview').innerText()).not.toContain('●');
  });
}
