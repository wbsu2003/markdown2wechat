// This function is serialized into a browser; keep it self-contained.
export function scanArticle(root, options = {}) {
  const doc = root.ownerDocument || root;
  const win = doc.defaultView;
  const limit = options.limit || 2500;
  const blockSelector = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,figcaption,section,div,pre';
  const elements = [root, ...root.querySelectorAll('*')].filter(el => el.nodeType === 1);
  const results = [];
  const seen = new Set();
  let measured = 0;
  const reference = root.getBoundingClientRect?.();
  const left = reference && reference.width ? reference.left : 0;
  const right = reference && reference.width ? reference.right : win.innerWidth;

  function location(el) {
    const indexed = el.closest('[data-blockidx]');
    const raw = indexed?.getAttribute('data-blockidx');
    const blockIndex = raw !== null && raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
    return {
      tag: el.tagName.toLowerCase(),
      elementIndex: elements.indexOf(el),
      blockIndex,
      paragraph: blockIndex === null ? null : blockIndex + 1,
      excerpt: options.includeText === false ? undefined : el.textContent.replace(/\s+/g, ' ').trim().slice(0, 70),
    };
  }
  function add(el, rule, severity, detail) {
    const key = elements.indexOf(el) + ':' + rule;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ ...location(el), rule, severity, ...detail });
  }
  function inHorizontalScroller(el) {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const style = win.getComputedStyle(parent);
      if (/auto|scroll/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth + 2) return true;
      if (parent === root) break;
    }
    return false;
  }
  for (const el of elements.slice(0, limit)) {
    const style = win.getComputedStyle(el);
    const bounds = el.getBoundingClientRect();
    if (!el.isConnected || style.display === 'none' ||
        (style.visibility === 'hidden' && !options.includeHiddenLayout) || !el.getClientRects().length) continue;
    const font = parseFloat(style.fontSize);
    const lineHeight = parseFloat(style.lineHeight);
    const text = el.textContent.trim();
    if (el.matches('span[leaf]') && el.querySelector(blockSelector)) {
      add(el, 'block-inside-leaf', 'risk', { message: 'span[leaf] 包含块级元素，违反官方结构规范。' });
    }
    if (el.tagName === 'IMG' && (!el.complete || !el.naturalWidth)) {
      add(el, 'image-unloaded', 'check', {
        message: '图片尚未加载或加载失败；无法确认最终尺寸，不等于图片本身违规。',
        hasSizeHint: !!(el.getAttribute('data-w') || el.getAttribute('width') || el.style.width),
        width: bounds.width, height: bounds.height,
      });
    }
    if (bounds.width > 0 && (bounds.left < left - 2 || bounds.right > right + 2) && !inHorizontalScroller(el)) {
      add(el, 'horizontal-overflow', 'check', {
        message: '元素超出当前容器，需核对窄屏显示；滚动容器的子元素已排除。',
        width: bounds.width, containerWidth: right - left,
        overflowLeft: Math.max(0, left - bounds.left), overflowRight: Math.max(0, bounds.right - right),
      });
    }
    if (!text || !el.matches(blockSelector)) continue;
    // Skip large structural ancestors: their descendant fragment count is not a line count either.
    const directText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!directText && el.querySelector(blockSelector)) continue;
    measured++;
    const range = doc.createRange();
    range.selectNodeContents(el);
    const allRects = [...range.getClientRects()];
    const visible = allRects.filter(r => r.width > 0 && r.height > 0);
    if (!visible.length) continue;
    const bbox = Math.max(...allRects.map(r => r.bottom)) - Math.min(...allRects.map(r => r.top));
    // Diagnostic grouping only: mixed fonts/baselines can affect this estimate. Never call it official.
    const rows = [];
    for (const rect of visible.sort((a, b) => a.top - b.top)) {
      const center = (rect.top + rect.bottom) / 2;
      const hit = rows.find(row => Math.abs(row.center - center) <= Math.min(row.height, rect.height) * 0.45);
      if (!hit) rows.push({ center, height: rect.height });
    }
    const metrics = {
      fontSize: font, lineHeight: Number.isFinite(lineHeight) ? lineHeight : style.lineHeight,
      fragments: allRects.length, estimatedRows: rows.length,
      bbox, fragmentAverage: bbox / allRects.length, threshold: font * 0.95,
    };
    const multiline = rows.length > 1 || (el.innerText || '').split('\n').filter(s => s.trim()).length > 1;
    if (Number.isFinite(lineHeight) && lineHeight < font) {
      add(el, 'line-height-below-font', multiline ? 'risk' : 'check', {
        message: multiline
          ? '计算行高小于字号且疑似多行，存在真实叠字风险；请核对视觉结果。'
          : '计算行高小于字号，但当前疑似单行；官方排除单行场景，不能直接认定违规。',
        ...metrics,
      });
    }
    if (allRects.length > 1 && bbox / allRects.length < font * 0.95) {
      add(el, 'historical-fragment-model', 'suspected', {
        message: '命中历史矩形计数模型；这是疑似误报线索，不是当前微信后台判定结果。',
        ...metrics,
      });
    }
  }
  return {
    schemaVersion: 1, viewportWidth: win.innerWidth, containerWidth: right - left,
    scannedElements: Math.min(elements.length, limit), measuredBlocks: measured,
    truncated: elements.length > limit,
    summary: {
      risks: results.filter(x => x.severity === 'risk').length,
      checks: results.filter(x => x.severity === 'check').length,
      suspected: results.filter(x => x.severity === 'suspected').length,
    },
    findings: results,
    caveat: '本报告不是微信官方检测。CSS 风险、历史模型命中均需结合粘贴/保存后的页面及手机预览核验。',
  };
}

// Self-contained read-only probe. Observes user paste events; never writes the clipboard or article.
export function installWechatProbe(scan, options = {}) {
  if (window.__md2wxDiagnostic?.stop) window.__md2wxDiagnostic.stop();
  const seconds = Math.max(1, Math.min(options.seconds || 90, 300));
  let reports = new Map(), markers = new Set(), paragraphEvidence = new Map(), dialogMessages = new Set();
  let evidenceNodes = new Map();
  const observers = [];
  const documents = new Map();
  let errors = new Set();
  const completedPhases = [];
  const pasteListeners = [];
  let baselineRoots = new WeakMap(), baselineMarkers = new WeakMap(), baselineDialogs = new Map();
  const observed = new WeakSet();
  const rootIds = new WeakMap();
  const manualRoots = new Set();
  let timer, debounce, interval, stopped = false;
  let nextDocId = 0, nextRootId = 0;
  const startedAt = new Date().toISOString();
  let phase = { id: 0, label: '安装时 / 未分组', trigger: 'initial', startedAt, endedAt: null, paste: null };
  let awaitingPaste = false;
  const editorSelector = '.ProseMirror, #js_content, .rich_media_content, .edui-body-container, ' +
    '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
  const excerpt = node => node.textContent.replace(/\s+/g, ' ').trim().slice(0, 70);

  function fingerprint(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16) + ':' + text.length;
  }
  function pasteSummary(event) {
    const html = event.clipboardData?.getData('text/html') || '';
    const text = event.clipboardData?.getData('text/plain') || '';
    return {
      capturedAt: new Date().toISOString(), htmlLength: html.length, textLength: text.length,
      fingerprint: fingerprint(html || text), excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 70),
      // Heuristic tag counts, not an HTML parser or a compatibility verdict.
      tagCounts: Object.fromEntries(['strong', 'em', 'code', 'pre', 'span', 'a', 'img'].map(tag =>
        [tag, (html.match(new RegExp('<' + tag + '(?:\\s|>)', 'gi')) || []).length])),
      caveat: '只记录本次粘贴输入的摘要，不保存完整 HTML；标签计数仅为线索。编辑区可能还含之前的正文。',
    };
  }
  function outermost(roots) {
    const unique = [...new Set(roots)];
    return unique.filter(root => !unique.some(other => other !== root && other.contains(root)));
  }
  function collectDocuments(doc) {
    if (!documents.has(doc)) documents.set(doc, nextDocId++);
    for (const iframe of doc.querySelectorAll('iframe')) {
      try {
        if (iframe.contentDocument) collectDocuments(iframe.contentDocument);
        else errors.add('部分 iframe 不可读取或尚未加载；可能是跨域页面。');
      } catch { errors.add('部分跨域 iframe 不可读取。'); }
    }
  }
  function rememberMarker(node, documentIndex, raw = node.getAttribute('data-blockidx')) {
    if (!/^\d+$/.test(raw || '')) return;
    if (baselineMarkers.get(node) === fingerprint(node.outerHTML)) return;
    // A marker can be copied onto every inline descendant. Keep the whole paragraph,
    // not whichever descendant MutationObserver happened to visit last.
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.getAttribute('data-blockidx') === raw) return rememberMarker(parent, documentIndex, raw);
    }
    const blockIndex = Number(raw);
    const key = documentIndex + ':' + blockIndex;
    markers.add(key);
    // Detached nodes retain text/attributes, but their geometry is NOT a valid layout sample.
    const images = [...(node.matches('img') ? [node] : []), ...node.querySelectorAll('img')];
    const evidence = {
      phaseId: phase.id, capturedAt: new Date().toISOString(),
      documentIndex, blockIndex, paragraph: blockIndex + 1, tag: node.tagName.toLowerCase(),
      excerpt: excerpt(node), connectedWhenCaptured: node.isConnected,
      inlineStyle: (node.getAttribute('style') || '').slice(0, 400),
      inlineNodes: node.querySelectorAll('strong,b,em,i,code,a,span').length,
      imageCount: images.length,
      images: images.slice(0, 5).map(img => ({
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        widthAttribute: img.getAttribute('width'), heightAttribute: img.getAttribute('height'),
        dataWidth: img.getAttribute('data-w'), dataRatio: img.getAttribute('data-ratio'),
        inlineStyle: (img.getAttribute('style') || '').slice(0, 400),
        // Attribute hints survive hidden/detached checker copies; no image URLs are recorded.
      })),
    };
    const previous = paragraphEvidence.get(key);
    const previousNode = evidenceNodes.get(key);
    if (previousNode !== node && previousNode?.contains(node)) return;
    if (!previous || evidence.connectedWhenCaptured || !previous.connectedWhenCaptured) {
      paragraphEvidence.set(key, evidence);
      evidenceNodes.set(key, node);
    }
  }
  function rememberTree(tree, documentIndex) {
    if (tree.nodeType !== 1) return false;
    const nodes = [...(tree.matches('[data-blockidx]') ? [tree] : []), ...tree.querySelectorAll('[data-blockidx]')];
    if (nodes.length > 2500) errors.add('临时节点标记超过 2500 个，仅保留部分证据。');
    for (const node of nodes.slice(0, 2500)) rememberMarker(node, documentIndex);
    return nodes.length > 0;
  }
  function consumeMutations(records, documentIndex) {
    let relevant = false;
    for (const record of records) {
      if (record.type === 'attributes') {
        baselineMarkers.delete(record.target);
        rememberMarker(record.target, documentIndex);
        // Handles markers added and removed in the same task before the observer is called.
        if (record.attributeName === 'data-blockidx' && record.oldValue !== null) {
          rememberMarker(record.target, documentIndex, record.oldValue);
        }
        relevant = true;
      } else {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          relevant = rememberTree(node, documentIndex) || relevant;
        }
      }
    }
    return relevant;
  }
  function recordRoot(root, documentIndex, source) {
    if (!root.isConnected || !root.textContent.trim()) return;
    if (baselineRoots.get(root) === fingerprint(root.innerHTML)) return;
    try {
      // visibility:hidden checker sandboxes DO have layout; display:none/detached nodes do not.
      const hiddenCheckerLayout = source === 'temporary-markers';
      const result = scan(root, { includeHiddenLayout: hiddenCheckerLayout });
      if (!result.measuredBlocks && !result.findings.length) return;
      if (!rootIds.has(root)) rootIds.set(root, nextRootId++);
      const key = documentIndex + ':' + rootIds.get(root) + ':' + Math.round(result.containerWidth);
      const rootInfo = {
        tag: root.tagName.toLowerCase(), id: root.id || '', className: String(root.className || '').slice(0, 150),
        contentEditable: root.getAttribute('contenteditable'), hiddenLayoutIncluded: hiddenCheckerLayout, textLength: root.textContent.trim().length,
        excerpt: excerpt(root), inlineNodes: root.querySelectorAll('strong,b,em,i,code,a,span').length,
      };
      if (reports.size >= 60 && !reports.has(key)) { errors.add('本阶段正文快照超过 60 份，后续新节点未完整采集。'); return; }
      // Latest state wins within a paste phase, even when simplification lowers the finding count.
      reports.set(key, { phaseId: phase.id, documentIndex, source, root: rootInfo, capturedAt: new Date().toISOString(), ...result });
    } catch (e) { errors.add('扫描失败：' + e.message); }
  }
  function capture() {
    if (stopped) return;
    collectDocuments(document);
    for (const [doc, documentIndex] of documents) {
      if (!doc.documentElement) continue;
      if (!observed.has(doc)) {
        const observer = new MutationObserver(records => {
          // Inspect added AND removed subtrees immediately. A debounced document query misses
          // checker clones that are appended and removed synchronously during paste.
          const relevant = consumeMutations(records, documentIndex);
          if (relevant) capture();
          else if (!debounce) debounce = setTimeout(() => { debounce = null; capture(); }, 80);
        });
        observer.observe(doc.documentElement, {
          subtree: true, childList: true, attributes: true, attributeOldValue: true,
          attributeFilter: ['data-blockidx', 'data-violation-id'],
        });
        observers.push({ observer, documentIndex });
        observed.add(doc);
        const onPaste = event => {
          if (stopped) return;
          const summary = pasteSummary(event);
          if (awaitingPaste) {
            phase.paste = summary; phase.trigger = 'manual+paste'; awaitingPaste = false;
          } else beginPhase('粘贴 ' + (completedPhases.length + 1), summary);
        };
        doc.addEventListener('paste', onPaste, true);
        pasteListeners.push({ doc, onPaste });
      }
      const marked = [...doc.querySelectorAll('[data-blockidx]')];
      const indexedRoots = new Set();
      for (const node of marked) {
        rememberMarker(node, documentIndex);
        indexedRoots.add(node.parentElement || node);
      }
      // Keep checker roots separate from editor roots so an outer editor cannot swallow a
      // temporary clone and lose its paragraph mapping/measurement reference.
      for (const root of outermost(indexedRoots)) recordRoot(root, documentIndex, 'temporary-markers');
      const roots = [...doc.querySelectorAll(editorSelector)];
      if ((doc.designMode || '').toLowerCase() === 'on' && doc.body) roots.push(doc.body);
      const outerRoots = outermost(roots);
      for (const root of outerRoots) recordRoot(root, documentIndex, 'editor');
      for (const root of manualRoots) if (root.ownerDocument === doc) recordRoot(root, documentIndex, 'manual');
      for (const dialog of doc.querySelectorAll('[role="dialog"], .weui-desktop-dialog, .weui-desktop-dialog__wrp')) {
        if (dialog.getClientRects().length && /内容结构检测|line-height|文字重叠/.test(dialog.textContent)) {
          const message = dialog.textContent.replace(/\s+/g, ' ').trim();
          if (baselineDialogs.get(dialog) === message) continue;
          baselineDialogs.delete(dialog);
          if (message.length > 30000) errors.add('检测弹窗文字过长，已截断；告警清单可能不全。');
          if (dialogMessages.size < 30) dialogMessages.add(message.slice(0, 30000));
          else if (!dialogMessages.has(message)) errors.add('检测弹窗快照超过 30 份，后续变化未完整采集。');
        }
      }
    }
    for (const dialog of baselineDialogs.keys()) {
      if (!dialog.isConnected || !dialog.getClientRects().length) baselineDialogs.delete(dialog);
    }
  }
  function phaseReport() {
    const officialWarnings = new Map();
    for (const message of dialogMessages) {
      for (const match of message.matchAll(/第\s*(\d+)\s*段([\s\S]*?)(?=第\s*\d+\s*段|$)/g)) {
        const paragraph = Number(match[1]);
        const rules = [];
        if (/line-height-overlapping|行高小于字体|文字重叠/.test(match[2])) rules.push('line-height-overlapping');
        if (/#(?:\d+\.)*\d+\s*width\b|不同屏幕下宽度差异/.test(match[2])) rules.push('width');
        if (!rules.length) rules.push('unknown');
        for (const rule of rules) officialWarnings.set(paragraph + ':' + rule, {
          phaseId: phase.id, paragraph, rule, detail: match[2].trim().slice(0, 500), source: 'dialog-text',
        });
      }
    }
    const samples = [...reports.values()];
    const warnings = [...officialWarnings.values()].sort((a, b) => a.paragraph - b.paragraph);
    const maxMeasuredBlocks = Math.max(0, ...samples.map(s => s.measuredBlocks));
    const maxTextLength = Math.max(0, ...samples.map(s => s.root.textLength));
    const evidence = [...paragraphEvidence.values()];
    const unmapped = [...new Set(warnings.map(w => w.paragraph))].filter(n => !evidence.some(e => e.paragraph === n));
    const qualityWarnings = [...errors];
    const insufficient = !samples.length || (warnings.length > 0 && maxMeasuredBlocks < 3 && maxTextLength < 200);
    if (insufficient) qualityWarnings.push('未采到足够正文；局部扫描为 0 不代表文章通过。请在粘贴前运行探针，或用 inspect($0) 手动指定正文容器。');
    if (unmapped.length) qualityWarnings.push('部分后台告警缺少正文段号映射，不能据此确定对应文字或根因。');
    if (!phase.endedAt) qualityWarnings.push('采集尚未结束，当前仅为中间快照。');
    if (!dialogMessages.size) qualityWarnings.push('本阶段未采到检测弹窗；不代表官方检测通过。');
    if (samples.some(s => s.truncated)) qualityWarnings.push('部分正文扫描达到元素上限，结果不完整。');
    return {
      ...phase, samples,
      quality: { status: insufficient ? 'insufficient' : unmapped.length || errors.size ? 'partial' : 'captured',
        maxMeasuredBlocks, maxTextLength, unmappedWarningParagraphs: unmapped, warnings: qualityWarnings },
      observedParagraphs: [...markers].map(key => {
        const [documentIndex, blockIndex] = key.split(':').map(Number);
        return { phaseId: phase.id, documentIndex, blockIndex, paragraph: blockIndex + 1 };
      }),
      paragraphEvidence: evidence,
      markerCaveat: 'data-blockidx / data-violation-id 仅表示被测节点，不能当成违规清单；已移除节点的摘录不能用于量测布局。',
      officialWarnings: warnings,
      dialogMessages: [...dialogMessages], errors: [...errors],
      privacy: '仅本地诊断，不上传数据、不修改剪贴板；报告含最多 70 字的段落/粘贴摘录、局部样式、图片尺寸提示和检测弹窗文字，不保存完整粘贴 HTML，分享前请检查。',
    };
  }
  function report() {
    const phases = [...completedPhases, phaseReport()];
    const current = phases[phases.length - 1];
    return {
      schemaVersion: 3, startedAt, stopped, phases,
      samples: phases.flatMap(p => p.samples),
      observedParagraphs: phases.flatMap(p => p.observedParagraphs),
      paragraphEvidence: phases.flatMap(p => p.paragraphEvidence),
      officialWarnings: phases.flatMap(p => p.officialWarnings),
      dialogMessages: [...new Set(phases.flatMap(p => p.dialogMessages))],
      quality: current.quality, errors: [...new Set(phases.flatMap(p => p.errors))],
      phaseCaveat: '按粘贴事件分组；汇总清单不能当作最后一次检测结果。未采到弹窗不代表通过，同一草稿连续粘贴时编辑区可能包含前次正文。',
      markerCaveat: current.markerCaveat, privacy: current.privacy,
    };
  }
  function beginPhase(label, paste = null) {
    if (stopped) throw new Error('采集已停止，请重新运行探针后再粘贴。');
    if (completedPhases.length >= 20) { errors.add('粘贴分组超过 20 次，后续事件未分组。'); return phase.id; }
    // Drain pending previous-paste changes before switching state.
    for (const { observer, documentIndex } of observers) consumeMutations(observer.takeRecords(), documentIndex);
    capture();
    phase.endedAt = new Date().toISOString();
    completedPhases.push(phaseReport());
    baselineRoots = new WeakMap(); baselineMarkers = new WeakMap(); baselineDialogs = new Map();
    for (const doc of documents.keys()) {
      for (const root of doc.querySelectorAll(editorSelector)) baselineRoots.set(root, fingerprint(root.innerHTML));
      if ((doc.designMode || '').toLowerCase() === 'on' && doc.body) baselineRoots.set(doc.body, fingerprint(doc.body.innerHTML));
      for (const node of doc.querySelectorAll('[data-blockidx]')) {
        baselineMarkers.set(node, fingerprint(node.outerHTML));
        if (node.parentElement) baselineRoots.set(node.parentElement, fingerprint(node.parentElement.innerHTML));
      }
      for (const dialog of doc.querySelectorAll('[role="dialog"], .weui-desktop-dialog, .weui-desktop-dialog__wrp')) {
        if (dialog.getClientRects().length) baselineDialogs.set(dialog, dialog.textContent.replace(/\s+/g, ' ').trim());
      }
    }
    evidenceNodes = new Map();
    reports = new Map(); markers = new Set(); paragraphEvidence = new Map(); dialogMessages = new Set(); errors = new Set();
    phase = { id: completedPhases.length, label: String(label || '手动分组').slice(0, 60),
      trigger: paste ? 'paste' : 'manual', startedAt: phase.endedAt, endedAt: null, paste };
    awaitingPaste = !paste;
    console.info('[md2wx] 开始阶段 ' + phase.id + '：' + phase.label);
    return phase.id;
  }
  function stop() {
    if (!stopped) {
      for (const { observer, documentIndex } of observers) consumeMutations(observer.takeRecords(), documentIndex);
      capture();
    }
    stopped = true;
    if (!phase.endedAt) phase.endedAt = new Date().toISOString();
    clearTimeout(timer); clearTimeout(debounce); clearInterval(interval);
    observers.forEach(({ observer }) => observer.disconnect());
    pasteListeners.forEach(({ doc, onPaste }) => doc.removeEventListener('paste', onPaste, true));
    evidenceNodes.clear(); // Evidence is serialized; release references to detached checker trees.
    const data = report();
    console.info('[md2wx] 只读诊断结束。完整报告：', data);
    console.table(data.phases.map(p => ({ phase: p.id, label: p.label, pasteHTML: p.paste?.htmlLength,
      officialWarnings: p.officialWarnings.length, samples: p.samples.length, quality: p.quality.status })));
    console.table(data.officialWarnings);
    console.table(data.samples.flatMap(sample => sample.findings.map(f => ({
      paragraph: f.paragraph, severity: f.severity, rule: f.rule,
      fontSize: f.fontSize, lineHeight: f.lineHeight, fragments: f.fragments,
      estimatedRows: f.estimatedRows, excerpt: f.excerpt,
    }))));
    data.quality.warnings.forEach(message => console.warn('[md2wx] ' + message));
    return data;
  }
  function inspect(root) {
    if (!root || root.nodeType !== 1 || !root.ownerDocument?.defaultView) {
      throw new Error('请在 Elements 面板选中正文容器，再运行 __md2wxDiagnostic.inspect($0)。');
    }
    collectDocuments(root.ownerDocument);
    manualRoots.add(root);
    const documentIndex = documents.get(root.ownerDocument);
    baselineRoots.delete(root);
    for (const node of root.querySelectorAll('[data-blockidx]')) baselineMarkers.delete(node);
    baselineMarkers.delete(root);
    rememberTree(root, documentIndex);
    recordRoot(root, documentIndex, 'manual');
    return report();
  }
  function download() {
    // Download is a final snapshot, not an incomplete report captured mid-run.
    const data = stop();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'wechat-diagnostic.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.__md2wxDiagnostic = { report, stop, download, inspect, beginPhase };
  capture();
  interval = setInterval(capture, 1000);
  timer = setTimeout(stop, seconds * 1000);
  console.info('[md2wx] 已开始只读诊断，' + seconds + ' 秒后自动输出。请在复制粘贴/触发结构检测之前运行；不要发布文章。');
  console.info('[md2wx] 自动按每次粘贴分组；也可手动 beginPhase(排版名称)。下载并结束：__md2wxDiagnostic.download()');
  return window.__md2wxDiagnostic;
}

export function consoleProbeSource() {
  return '// Markdown2WeChat read-only diagnostics; no network requests.\n' +
    '(' + installWechatProbe.toString() + ')(' + scanArticle.toString() + ');\n';
}
