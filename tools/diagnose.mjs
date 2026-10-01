import { scanCapturedBundleLineHeight } from './wechat-bundle-line-height.mjs';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { scanArticle, consoleProbeSource } from './article-diagnostics.mjs';

const args = process.argv.slice(2);
const outputDir = path.resolve('reports');
const usage = 'Usage: npm run diagnose -- --probe | --html article.html | --markdown article.md';
if (args.length === 1 && args[0] === '--probe') {
  await mkdir(outputDir, { recursive: true });
  const filename = path.join(outputDir, 'wechat-console-probe.js');
  await writeFile(filename, consoleProbeSource());
  console.log('已生成只读后台诊断脚本：' + filename);
  console.log('在粘贴文章之前，先在微信编辑器 Console 运行脚本，90 秒内粘贴文章并触发结构检测；每次粘贴自动分组。');
  console.log('报告只留在当前浏览器；结束并下载：__md2wxDiagnostic.download()；请核对报告 quality 字段。');
} else if (args.length === 2 && ['--html', '--markdown'].includes(args[0])) {
  await diagnose(args[0], args[1]);
} else {
  console.log(usage);
  process.exitCode = 2;
}

async function diagnose(mode, filename) {
  // Read input before launching a browser, so an invalid path fails without side effects.
  const source = await readFile(path.resolve(filename), 'utf8');
  let channel = process.env.PLAYWRIGHT_CHANNEL;
  if (!channel && process.platform === 'win32') {
    try {
      await access('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
      channel = 'msedge';
    } catch { /* Fall back to installed Playwright Chromium. */ }
  }
  const browser = await chromium.launch({ headless: true, channel });
  const samples = [];
  try {
    const context = await browser.newContext({
      // In HTML mode imported scripts/event handlers must never execute.
      javaScriptEnabled: mode === '--markdown', serviceWorkers: 'block',
    });
    const page = await context.newPage();
    // All external resources are disabled: no article/image URLs leave this computer.
    await context.route('**/*', route => route.abort());
    if (mode === '--markdown') {
      const { pageHtml } = await import('../src/page.js');
      const marked = await readFile(new URL('../src/vendor/marked.umd.js.txt', import.meta.url), 'utf8');
      const highlight = await readFile(new URL('../src/vendor/highlight.min.js.txt', import.meta.url), 'utf8');
      await page.route('http://md2wx-diagnostic.local/**', route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: pageHtml('diagnostic', '') });
        if (pathname === '/vendor/marked.js') return route.fulfill({ contentType: 'application/javascript', body: marked });
        if (pathname === '/vendor/highlight.js') return route.fulfill({ contentType: 'application/javascript', body: highlight });
        return route.abort();
      });
      await page.goto('http://md2wx-diagnostic.local/');
      // Raw HTML in Markdown is escaped for this offline run. Only the built-in renderer runs;
      // source scripts, event handlers and iframes cannot be injected into the diagnostic page.
      await page.evaluate(source => {
        window.marked.use({ renderer: {
          html(token) {
            return token.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          },
        } });
        document.getElementById('editor').value = source;
      }, source);
    } else {
      await page.setContent(source, { waitUntil: 'domcontentloaded' });
    }
    for (const renderMode of mode === '--markdown' ? ['styled', 'color', 'simple'] : ['imported-html']) {
      if (mode === '--markdown') {
        // Render the latest source synchronously, without waiting for the editor debounce.
        await page.evaluate(value => {
          const select = document.getElementById('renderMode');
          select.value = value;
          select.dispatchEvent(new Event('change'));
        }, renderMode);
      }
      for (const width of [375, 585, 677]) {
        await page.setViewportSize({ width, height: 900 });
        const root = mode === '--markdown' ? '#preview' : 'body';
        if (mode === '--markdown') {
          // Measure the article at the requested content width, not inside a desktop split pane.
          await page.locator('#preview').evaluate((el, width) => {
            el.style.cssText += ';position:fixed;top:0;left:0;width:' + width + 'px;height:auto;overflow:visible;background:white;';
          }, width);
        }
        const report = await page.locator(root).evaluate(scanArticle);
        const capturedBundleFallback = await page.locator(root).evaluate(scanCapturedBundleLineHeight);
        samples.push({ renderMode, width, ...report, capturedBundleFallback });
      }
    }
  } finally {
    await browser.close();
  }
  await mkdir(outputDir, { recursive: true });
  const output = path.join(outputDir, 'article-diagnostic.json');
  await writeFile(output, JSON.stringify({
    generatedAt: new Date().toISOString(), sourceName: path.basename(filename),
    note: '离线检查：外部图片/样式被禁用；Markdown 中手写 HTML 被转义。手写 HTML 的布局请用 --html 检查导出的 HTML。此处结果需在实际页面复核。',
    samples,
  }, null, 2));
  console.table(samples.map(s => ({
    mode: s.renderMode, width: s.width, blocks: s.measuredBlocks,
    risks: s.summary.risks, checks: s.summary.checks, suspected: s.summary.suspected,
    capturedFallback: s.capturedBundleFallback.warnings.length, truncated: s.truncated,
  })));
  console.log('完整本地报告（含段落摘录，分享前请检查）：' + output);
  console.log('注意：疑似误报 ≠ 当前微信后台违规；本工具不会登录、修改或发布文章。');
}
