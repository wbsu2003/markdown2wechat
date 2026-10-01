import { scanCapturedBundleLineHeight } from '../tools/wechat-bundle-line-height.mjs';
import { test, expect } from '@playwright/test';
import { scanArticle, installWechatProbe, consoleProbeSource } from '../tools/article-diagnostics.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const styles = '<style>body{margin:0}p{font-size:15px;line-height:27px;margin:0}</style>';
const scan = page => page.locator('body').evaluate(scanArticle);

test('diagnostic distinguishes fragment-model suspicion from real low line-height', async ({ page }) => {
  await page.setContent(styles + '<p data-blockidx="4">通过 <strong>SSH</strong> 登录。</p><p style="line-height:8px">第一行<br>第二行</p>');
  const report = await scan(page);
  const suspicion = report.findings.find(f => f.rule === 'historical-fragment-model' && f.paragraph === 5);
  expect(suspicion?.severity).toBe('suspected');
  expect(suspicion.estimatedRows).toBe(1);
  expect(report.findings.some(f => f.rule === 'line-height-below-font' && f.severity === 'risk')).toBe(true);
  expect(report.findings.some(f => f.rule === 'line-height-below-font' && f.paragraph === 5)).toBe(false);
});

test('plain paragraphs are not suspected and a single low-height line is not declared a violation', async ({ page }) => {
  await page.setContent(styles + '<p>通过 SSH 登录。</p><p style="line-height:8px">只有一行</p>');
  const report = await scan(page);
  expect(report.summary.suspected).toBe(0);
  expect(report.summary.risks).toBe(0);
  expect(report.findings.find(f => f.rule === 'line-height-below-font')?.severity).toBe('check');
});

test('zero-height explicit multi-line text is still diagnosed despite coincident rectangles', async ({ page }) => {
  await page.setContent(styles + '<p style="line-height:0">第一行<br>第二行</p>');
  expect((await scan(page)).findings.find(f => f.rule === 'line-height-below-font')?.severity).toBe('risk');
});

test('offline image dimensions, leaf structure, overflow and legitimate scrolling are distinguished', async ({ page }) => {
  await page.setContent(styles + '<span leaf><code>inline code</code></span><span leaf><section>错误结构</section></span>' +
    '<img src="data:invalid" data-w="600"><section style="width:100px;overflow-x:auto"><p style="width:1500px">滚动内容</p></section>' +
    '<p style="width:1600px">溢出内容</p>');
  const report = await scan(page);
  expect(report.findings.filter(f => f.rule === 'block-inside-leaf')).toHaveLength(1);
  expect(report.findings.find(f => f.rule === 'image-unloaded')?.hasSizeHint).toBe(true);
  expect(report.findings.filter(f => f.rule === 'horizontal-overflow').map(f => f.excerpt)).toEqual(['溢出内容']);
});

test('probe records transient zero-based paragraph markers without treating them as violations', async ({ page }) => {
  await page.setContent(styles + '<div class="ProseMirror" contenteditable="true"><p>正文</p></div>');
  const articleBefore = await page.locator('.ProseMirror').innerHTML();
  await page.evaluate(({ install, scan }) => {
    (0, eval)('(' + install + ')')((0, eval)('(' + scan + ')'), { seconds: 30 });
  }, { install: installWechatProbe.toString(), scan: scanArticle.toString() });
  await page.evaluate(() => {
    const copy = document.createElement('section');
    copy.id = 'temporary-copy';
    copy.style.cssText = 'position:absolute;left:-10000px;width:375px';
    copy.innerHTML = '<p data-blockidx="4" data-violation-id="handle-only">通过 <strong>SSH</strong> 登录。</p>';
    document.body.append(copy);
  });
  await expect.poll(() => page.evaluate(() => window.__md2wxDiagnostic.report().observedParagraphs.length)).toBe(1);
  await page.locator('#temporary-copy').evaluate(el => el.remove());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.observedParagraphs[0]).toMatchObject({ documentIndex: 0, blockIndex: 4, paragraph: 5 });
  expect(data.samples.some(s => s.findings.some(f => f.paragraph === 5))).toBe(true);
  expect(data.stopped).toBe(true);
  expect(await page.locator('.ProseMirror').innerHTML()).toBe(articleBefore);
  expect(data.markerCaveat).toContain('不能当成违规清单');
});

test('console probe is standalone, automatically stops and can be reinstalled', async ({ page }) => {
  await page.setContent(styles + '<div class="ProseMirror"><p>正文</p></div>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  expect(await page.evaluate(() => window.__md2wxDiagnostic.report().samples.length)).toBe(1);
  await page.evaluate(() => window.__md2wxDiagnostic.stop());
  await page.evaluate(({ install, scan }) => {
    (0, eval)('(' + install + ')')((0, eval)('(' + scan + ')'), { seconds: 1 });
  }, { install: installWechatProbe.toString(), scan: scanArticle.toString() });
  await expect.poll(() => page.evaluate(() => window.__md2wxDiagnostic.report().stopped)).toBe(true);
});

test('empty page produces an explicit no-content result rather than claiming the article passed', async ({ page }) => {
  await page.setContent('<p>not an editor</p>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.samples).toEqual([]);
});

test('probe discovers generic editable bodies and same-origin iframe editors', async ({ page }) => {
  await page.setContent(styles + '<div contenteditable="true"><p>没有 ProseMirror 类名的正文</p></div><iframe></iframe>');
  await page.locator('iframe').evaluate(frame => {
    frame.contentDocument.body.innerHTML = '<p>旧版 iframe 正文</p>';
    frame.contentDocument.designMode = 'on';
  });
  const before = await page.locator('body').innerHTML();
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.samples.map(s => s.root.excerpt)).toEqual(expect.arrayContaining(['没有 ProseMirror 类名的正文', '旧版 iframe 正文']));
  expect(data.samples.some(s => s.documentIndex === 1)).toBe(true);
  expect(await page.locator('body').innerHTML()).toBe(before);
});

test('probe retains synchronously removed checker markers without inventing detached geometry', async ({ page }) => {
  await page.setContent(styles + '<div class="ProseMirror"><p>占位正文</p></div>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(async () => {
    const copy = document.createElement('section');
    copy.innerHTML = '<p data-blockidx="75" style="width:700px">待定位的宽度段落</p>';
    document.body.append(copy);
    copy.remove();
    await Promise.resolve();
    return window.__md2wxDiagnostic.stop();
  });
  expect(data.observedParagraphs).toEqual([{ phaseId: 0, documentIndex: 0, blockIndex: 75, paragraph: 76 }]);
  expect(data.paragraphEvidence[0]).toMatchObject({ paragraph: 76, excerpt: '待定位的宽度段落', connectedWhenCaptured: false });
  expect(data.samples.every(s => s.findings.every(f => f.paragraph !== 76))).toBe(true);
});

test('stop drains pending marker changes even if the attribute was immediately removed', async ({ page }) => {
  await page.setContent(styles + '<p id="temporary">短暂标记正文</p>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(() => {
    const p = document.getElementById('temporary');
    p.setAttribute('data-blockidx', '4');
    p.removeAttribute('data-blockidx');
    return window.__md2wxDiagnostic.stop();
  });
  expect(data.paragraphEvidence[0]).toMatchObject({ paragraph: 5, excerpt: '短暂标记正文' });
  expect(data.markerCaveat).toContain('不能当成违规清单');
});

test('dialog warnings are deduplicated and tiny placeholder scans are explicitly insufficient', async ({ page }) => {
  await page.setContent(styles + '<div class="ProseMirror"><p>请输入正文</p></div>' +
    '<div role="dialog"><div class="weui-desktop-dialog">内容结构检测 ' +
    '第 3 段 行高小于字体大小，且存在多行文本（参考文档#2.3.2 line-height-overlapping） 定位 ' +
    '第 76 段 不同屏幕下宽度差异（参考文档#1.4 width） 定位 取消 继续插入</div></div>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.schemaVersion).toBe(3);
  expect(data.officialWarnings).toHaveLength(2);
  expect(data.officialWarnings[1]).toMatchObject({ paragraph: 76, rule: 'width', source: 'dialog-text' });
  expect(data.samples[0].summary.risks).toBe(0);
  expect(data.quality.status).toBe('insufficient');
  expect(data.quality.unmappedWarningParagraphs).toEqual([3, 76]);
  expect(data.quality.warnings.join('')).toContain('不代表文章通过');
});

test('manual root selection works after automatic capture stops and download finalizes the report', async ({ page }) => {
  await page.setContent(styles + '<article id="unrecognized"><p>手动选中的正文</p></article>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  await page.evaluate(() => window.__md2wxDiagnostic.stop());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.inspect(document.querySelector('article')));
  expect(data.samples[0]).toMatchObject({ source: 'manual', root: { id: 'unrecognized', excerpt: '手动选中的正文' } });
  expect(data.stopped).toBe(true);
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => window.__md2wxDiagnostic.download());
  const download = await downloadPromise;
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(saved.stopped).toBe(true);
  expect(saved.quality.status).toBe('insufficient');
  expect(saved.quality.warnings.join('')).not.toContain('采集尚未结束');
});

test('one capture separates styled and simple pastes with reused roots and paragraph numbers', async ({ page }) => {
  await page.setContent(styles + '<div contenteditable="true" id="editor"></div>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  async function paste(simple) {
    return page.evaluate(simple => {
      const editor = document.getElementById('editor');
      document.querySelector('[role="dialog"]')?.remove();
      const html = simple ? '<p data-blockidx="4">通过 SSH 登录。</p>' : '<p data-blockidx="4">通过 <strong>SSH</strong> 登录。</p>';
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', html);
      clipboardData.setData('text/plain', '通过 SSH 登录。');
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData });
      editor.dispatchEvent(event);
      editor.innerHTML = html;
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.textContent = simple ? '内容结构检测 未发现问题' : '内容结构检测 第 5 段 行高小于字体大小 #2.3.2 line-height-overlapping';
      document.body.append(dialog);
      return event.defaultPrevented;
    }, simple);
  }
  expect(await paste(false)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__md2wxDiagnostic.report().phases.at(-1).officialWarnings.length)).toBe(1);
  expect(await paste(true)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__md2wxDiagnostic.report().phases.at(-1).samples.length)).toBe(1);
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  const pasted = data.phases.filter(p => p.trigger === 'paste');
  expect(pasted).toHaveLength(2);
  expect(pasted.map(p => p.officialWarnings.length)).toEqual([1, 0]);
  expect(pasted.map(p => p.paste.tagCounts.strong)).toEqual([1, 0]);
  expect(pasted[0].paste.fingerprint).not.toBe(pasted[1].paste.fingerprint);
  expect(pasted[0].samples[0].summary.suspected).toBeGreaterThan(0);
  expect(pasted[1].samples[0].summary.suspected).toBe(0);
  expect(pasted[0].paragraphEvidence.find(e => e.paragraph === 5).inlineNodes).toBe(1);
  expect(pasted[1].paragraphEvidence.find(e => e.paragraph === 5).inlineNodes).toBe(0);
  expect(pasted.every(p => p.endedAt)).toBe(true);
  expect(data.phaseCaveat).toContain('不能当作最后一次检测结果');
});

test('latest state replaces a higher-risk snapshot even when text length is unchanged', async ({ page }) => {
  await page.setContent(styles + '<div class="ProseMirror"><p>通过 <strong>SSH</strong> 登录。</p></div>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  expect(await page.evaluate(() => window.__md2wxDiagnostic.report().samples[0].summary.suspected)).toBeGreaterThan(0);
  await page.locator('.ProseMirror').evaluate(el => { el.innerHTML = '<p>通过 SSH 登录。</p>'; });
  await expect.poll(() => page.evaluate(() => window.__md2wxDiagnostic.report().samples[0].summary.suspected)).toBe(0);
  await page.evaluate(() => window.__md2wxDiagnostic.stop());
});

test('nested marker parents are grouped rather than exhausting the snapshot budget', async ({ page }) => {
  await page.setContent(styles + '<div class="rich_media_content">' + Array.from({ length: 90 }, (_, i) =>
    `<section data-blockidx="${i}"><p data-blockidx="${i + 90}">段落 ${i}</p></section>`).join('') + '</div>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.observedParagraphs).toHaveLength(180);
  expect(data.samples).toHaveLength(1);
  expect(data.errors).toEqual([]);
});

test('image-only paragraph evidence retains width hints without claiming hidden geometry', async ({ page }) => {
  await page.setContent('<section style="display:none"><p data-blockidx="75"><img width="800" data-w="800" data-ratio="0.6" style="width:800px;max-width:100%"></p></section>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.samples).toEqual([]);
  const evidence = data.paragraphEvidence.find(e => e.paragraph === 76);
  expect(evidence).toMatchObject({ imageCount: 1, excerpt: '', images: [{ widthAttribute: '800', dataWidth: '800', dataRatio: '0.6' }] });
  expect(evidence.images[0]).not.toHaveProperty('bounds');
});

test('manual phases exclude a previous open dialog but retain identical warnings from a new dialog', async ({ page }) => {
  await page.setContent(styles + '<div contenteditable="true"><p>原有正文</p></div><div role="dialog">内容结构检测 第 5 段 文字重叠</div>');
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  await page.evaluate(() => window.__md2wxDiagnostic.beginPhase('简洁'));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__md2wxDiagnostic.report().phases.at(-1).officialWarnings)).toEqual([]);
  await page.evaluate(() => {
    const editor = document.querySelector('[contenteditable]');
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<p>第二次输入</p>');
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
    editor.innerHTML = '<p>第二次输入</p>';
    const old = document.querySelector('[role="dialog"]');
    const next = old.cloneNode(true);
    old.replaceWith(next);
  });
  await expect.poll(() => page.evaluate(() => window.__md2wxDiagnostic.report().phases.at(-1).officialWarnings.length)).toBe(1);
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.phases).toHaveLength(2);
  expect(data.phases[1]).toMatchObject({ label: '简洁', trigger: 'manual+paste' });
  expect(data.officialWarnings.map(w => w.phaseId)).toEqual([0, 1]);
});

for (const mode of ['html', 'markdown']) {
  test(`offline ${mode} CLI reads the supplied article and does not run article scripts`, async ({}, testInfo) => {
    test.setTimeout(90000);
    const dir = testInfo.outputPath('offline-run');
    await mkdir(dir, { recursive: true });
    const input = path.join(dir, 'input.' + (mode === 'html' ? 'html' : 'md'));
    const attack = '<script>document.body.innerHTML="EXECUTED_UNTRUSTED_SCRIPT"</script>';
    const article = mode === 'html'
      ? styles + '<p data-blockidx="9">fixture-html <strong>SSH</strong></p>' + attack
      : '# fixture-markdown\n\n通过 **SSH** 登录，执行 `echo hi`。\n\n' + attack;
    await writeFile(input, article);
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../tools/diagnose.mjs', import.meta.url)), '--' + mode, input], {
      cwd: dir, env: process.env, timeout: 80000,
    });
    const data = JSON.parse(await readFile(path.join(dir, 'reports/article-diagnostic.json'), 'utf8'));
    expect(data.samples).toHaveLength(mode === 'html' ? 3 : 9);
    if (mode === 'html') {
      expect(data.samples.every(s => s.findings.some(f => f.paragraph === 10 && f.excerpt.startsWith('fixture-html')))).toBe(true);
    } else {
      expect(data.samples.filter(s => s.renderMode === 'color')).toHaveLength(3);
      // A disabled renderer previously left the built-in demo in place. Catch that regression explicitly.
      expect(data.samples.filter(s => s.renderMode === 'styled').every(s => s.summary.suspected > 0)).toBe(true);
      expect(data.samples.filter(s => s.renderMode === 'simple').every(s => s.summary.suspected === 0)).toBe(true);
      expect(data.samples.every(s => s.measuredBlocks === 3)).toBe(true);
    }
  });
}


test('image root paragraph records its own size hints without leaking image URLs', async ({ page }) => {
  await page.setContent('<section hidden></section>');
  await page.evaluate(() => {
    const img = document.createElement('img');
    img.setAttribute('data-blockidx', '114');
    img.setAttribute('width', '596');
    img.setAttribute('height', '595');
    img.setAttribute('data-w', '596');
    img.setAttribute('data-ratio', '0.9983');
    img.style.cssText = 'width:596px;height:594.987px;max-width:100%';
    img.src = 'data:invalid,private-image-source';
    document.querySelector('section').append(img);
  });
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.samples).toEqual([]);
  const evidence = data.paragraphEvidence.find(e => e.paragraph === 115);
  expect(evidence).toMatchObject({
    tag: 'img', imageCount: 1, excerpt: '',
    images: [{ widthAttribute: '596', heightAttribute: '595', dataWidth: '596', dataRatio: '0.9983' }],
  });
  expect(evidence.images[0].inlineStyle).toContain('width: 596px');
  expect(evidence.images[0]).not.toHaveProperty('bounds');
  expect(JSON.stringify(evidence)).not.toContain('private-image-source');
});

test('captured bundle fallback uses its exact direct-text candidate gate, not every inline span', async ({ page }) => {
  await page.setContent(styles + `
    <p data-blockidx="0">通过 <strong>SSH</strong> 登录。</p>
    <p data-blockidx="1"><span style="color:black">通过 <strong>SSH</strong> 登录。</span></p>
    <p data-blockidx="2"><strong>整段强调</strong></p>
    <p data-blockidx="3"><span style="color:red">image:</span><span> litepan:latest</span></p>
    <p data-blockidx="4">纯文本</p>
    <p data-blockidx="5" style="line-height:0">零行高</p>
    <p data-blockidx="6" style="line-height:8px"><span>第一行<br>第二行</span></p>
    <table><tr><th data-blockidx="7">不在候选集 <strong>文本</strong></th></tr></table>`);
  const subset = await page.locator('body').evaluate(scanCapturedBundleLineHeight);
  expect(subset.version).toBe('4da8090c');
  expect(subset.candidates.map(c => c.paragraph)).toEqual([1, 5, 6]);
  expect(subset.warnings.map(c => c.paragraph)).toEqual([1, 6]);
  // The captured fallback misses even genuinely overlapping fully wrapped text.
  // The independent CSS/geometry scan must still catch it: passing this subset is NOT proof of safety.
  const report = await scan(page);
  expect(report.findings.some(f => f.paragraph === 7 && f.rule === 'line-height-below-font' && f.severity === 'risk')).toBe(true);
});

test('probe measures hidden connected checker layout without measuring display-none or detached nodes', async ({ page }) => {
  await page.setContent(styles + `
    <section id="checker" style="position:fixed;left:-9999px;visibility:hidden;width:375px">
      <p data-blockidx="4">通过 <strong>SSH</strong> 登录。</p>
    </section>
    <section id="display-none" style="display:none"><p data-blockidx="5">没有布局</p></section>`);
  const before = await page.locator('body').innerHTML();
  expect((await page.locator('#checker').evaluate(scanArticle)).measuredBlocks).toBe(0);
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  const sample = data.samples.find(s => s.root.id === 'checker');
  expect(sample).toMatchObject({ source: 'temporary-markers', measuredBlocks: 1, containerWidth: 375,
    root: { hiddenLayoutIncluded: true } });
  expect(sample.findings.some(f => f.paragraph === 5)).toBe(true);
  expect(data.samples.some(s => s.root.id === 'display-none')).toBe(false);
  expect(await page.locator('body').innerHTML()).toBe(before);
  const detached = await page.evaluate(source => {
    const root = document.querySelector('#checker').cloneNode(true);
    return (0, eval)('(' + source + ')')(root, { includeHiddenLayout: true });
  }, scanArticle.toString());
  expect(detached.measuredBlocks).toBe(0);
  expect(detached.findings).toEqual([]);
});

test('marker evidence prefers the whole same-index paragraph and refreshes across phases and replacements', async ({ page }) => {
  await page.setContent(styles + `<section id="checker" style="visibility:hidden">
    <p data-blockidx="2">完整的 <strong data-blockidx="2">彩色 <span data-blockidx="2">STRM</span></strong> 段落</p>
  </section>`);
  await page.evaluate(source => (0, eval)(source), consoleProbeSource());
  const first = await page.evaluate(() => window.__md2wxDiagnostic.report());
  expect(first.paragraphEvidence).toHaveLength(1);
  expect(first.paragraphEvidence[0]).toMatchObject({ tag: 'p', excerpt: '完整的 彩色 STRM 段落', inlineNodes: 2 });
  await page.locator('#checker').evaluate(el => {
    el.innerHTML = '<p data-blockidx="2">替换后的 <span data-blockidx="2">完整段落</span></p>';
  });
  await expect.poll(() => page.evaluate(() => window.__md2wxDiagnostic.report().paragraphEvidence[0].excerpt)).toBe('替换后的 完整段落');
  await page.evaluate(() => window.__md2wxDiagnostic.beginPhase('下一次保色'));
  await page.locator('#checker').evaluate(el => {
    el.innerHTML = '<p data-blockidx="2">新阶段 <span data-blockidx="2">彩色内容</span></p>';
  });
  await expect.poll(() => page.evaluate(() => window.__md2wxDiagnostic.report().phases.at(-1).paragraphEvidence[0]?.excerpt)).toBe('新阶段 彩色内容');
  const data = await page.evaluate(() => window.__md2wxDiagnostic.stop());
  expect(data.phases[0].paragraphEvidence[0].excerpt).toBe('替换后的 完整段落');
  expect(data.phases[1].paragraphEvidence[0]).toMatchObject({ tag: 'p', phaseId: 1 });
});
