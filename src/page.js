// 编辑器单页：左侧 Markdown 输入，右侧实时渲染公众号排版（带内联样式，复制即用）。
// 排版主题对照 mdnice 默认主题（参考文章实测提取）：正文 15px/1.8em 纯黑，
// 强调色 #ef7060，H2 黑底白字块，代码块 Atom One Dark + Mac 窗口三点。

const MAC_DOTS_B64 =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0NSIgaGVpZ2h0PSIxMyI+PGNpcmNsZSBjeD0iNi41IiBjeT0iNi41IiByPSI2IiBmaWxsPSIjZmY1ZjU2Ii8+PGNpcmNsZSBjeD0iMjIuNSIgY3k9IjYuNSIgcj0iNiIgZmlsbD0iI2ZmYmQyZSIvPjxjaXJjbGUgY3g9IjM4LjUiIGN5PSI2LjUiIHI9IjYiIGZpbGw9IiMyN2M5M2YiLz48L3N2Zz4=';

function pageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Markdown · 公众号排版</title>
<link rel="icon" href="data:,">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    color: #1f2328;
    background: #f6f7f9;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ===== 顶栏 ===== */
  .topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 52px;
    padding: 0 16px;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    flex: none;
  }
  .brand { display: flex; flex-direction: column; line-height: 1.2; min-width: 118px; }
  .brand b { font-size: 15px; letter-spacing: .5px; }
  .brand b em { font-style: normal; color: #07c160; }
  .brand small { font-size: 11px; color: #9ca3af; }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .toolbar::-webkit-scrollbar { display: none; }
  .toolbar .sep {
    width: 1px; height: 18px;
    background: #e5e7eb;
    margin: 0 6px;
    flex: none;
  }
  .tb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px; height: 30px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #4b5563;
    cursor: pointer;
    flex: none;
    transition: background .15s, color .15s;
  }
  .tb:hover { background: #eef1f4; color: #111; }
  .tb:active { background: #e3e7eb; }
  .tb svg { width: 16px; height: 16px; display: block; }
  .tb .tt { font-size: 12px; font-weight: 700; font-family: Georgia, 'Times New Roman', serif; }
  .tb .mono { font-family: Consolas, Menlo, monospace; font-size: 11px; font-weight: 700; }

  .actions { display: flex; align-items: center; gap: 12px; flex: none; }
  .stat { font-size: 12px; color: #9ca3af; }
  .primary {
    height: 32px;
    padding: 0 18px;
    border: none;
    border-radius: 6px;
    background: #07c160;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s;
  }
  .primary:hover { background: #06ad56; }

  /* ===== 左右分栏 ===== */
  .split { display: flex; flex: 1; min-height: 0; }
  .pane { min-width: 0; min-height: 0; }
  .editor-pane {
    width: 46%;
    background: #fff;
    display: flex;
    position: relative;
  }
  .editor-pane.dragging::after {
    content: '松开载入 Markdown 文件';
    position: absolute;
    inset: 8px;
    border: 2px dashed #07c160;
    border-radius: 10px;
    background: rgba(7, 193, 96, .06);
    color: #07c160;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  #editor {
    flex: 1;
    padding: 22px 24px 40vh;
    border: none;
    outline: none;
    resize: none;
    font-family: ui-monospace, 'Cascadia Code', 'SF Mono', Consolas, 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.75;
    color: #24292f;
    background: transparent;
    caret-color: #07c160;
  }
  .divider {
    width: 5px;
    background: #eceef1;
    cursor: col-resize;
    flex: none;
    transition: background .15s;
  }
  .divider:hover, .divider.on { background: #07c160; }
  .preview-pane {
    flex: 1;
    background: #f0f2f5;
    overflow-y: auto;
    padding: 24px 20px 60px;
  }
  .phone {
    max-width: 420px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 28px rgba(0,0,0,.06);
    overflow: hidden;
  }
  .phone-head {
    padding: 12px 18px;
    border-bottom: 1px solid #f0f0f0;
    font-size: 12px;
    color: #9ca3af;
    display: flex;
    justify-content: space-between;
  }
  #preview {
    padding: 20px 18px 36px;
    font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    overflow-wrap: break-word;
  }
  #preview pre { overflow-x: auto; }
  .empty-tip { color: #c0c4cc; font-size: 14px; text-align: center; padding: 60px 0; }

  /* ===== 弹层（插入图片/链接） ===== */
  .mask {
    position: fixed; inset: 0;
    background: rgba(17, 24, 39, .35);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .mask.show { display: flex; }
  .modal {
    width: 380px;
    background: #fff;
    border-radius: 12px;
    padding: 22px 24px;
    box-shadow: 0 12px 40px rgba(0,0,0,.18);
  }
  .modal h3 { font-size: 15px; margin-bottom: 16px; }
  .modal label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 12px; }
  .modal input {
    width: 100%;
    margin-top: 5px;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    outline: none;
  }
  .modal input:focus { border-color: #07c160; }
  .modal-btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
  .modal-btns .ghost {
    height: 32px; padding: 0 16px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    color: #4b5563;
    font-size: 13px;
    cursor: pointer;
  }

  .toast {
    position: fixed;
    bottom: 34px; left: 50%;
    transform: translateX(-50%) translateY(8px);
    background: #111827;
    color: #fff;
    padding: 9px 20px;
    border-radius: 8px;
    font-size: 13px;
    opacity: 0;
    pointer-events: none;
    transition: opacity .25s, transform .25s;
    z-index: 99;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* ===== 笔记库抽屉 ===== */
  .drawer {
    position: fixed;
    top: 52px; left: 0; bottom: 0;
    width: 320px;
    background: #fff;
    border-right: 1px solid #e5e7eb;
    box-shadow: 8px 0 24px rgba(0,0,0,.07);
    transform: translateX(-102%);
    transition: transform .2s ease;
    z-index: 40;
    display: flex;
    flex-direction: column;
  }
  .drawer.open { transform: none; }
  .drawer-head {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid #f0f0f0;
  }
  .drawer-head input {
    flex: 1;
    padding: 7px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    outline: none;
  }
  .drawer-head input:focus { border-color: #07c160; }
  .drawer-head button {
    padding: 0 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    color: #4b5563;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .drawer-head button:hover { background: #f6f7f9; }
  .drawer-list { flex: 1; overflow-y: auto; padding: 6px 0; }
  .vault-item { padding: 8px 16px; cursor: pointer; }
  .vault-item:hover { background: #f0faf4; }
  .vault-item b { display: block; font-size: 13px; font-weight: 600; color: #1f2328; }
  .vault-item span { display: block; font-size: 11px; color: #9ca3af; margin-top: 2px; word-break: break-all; }
  .drawer-empty { padding: 40px 20px; text-align: center; color: #c0c4cc; font-size: 13px; }

  @media (max-width: 860px) {
    .split { flex-direction: column; }
    .editor-pane { width: auto; height: 45%; }
    .divider { display: none; }
    .brand small { display: none; }
  }
</style>
</head>
<body>

<header class="topbar">
  <div class="brand">
    <b>MD <em>→</em> 公众号</b>
    <small>粘贴即用的公众号排版</small>
  </div>

  <div class="toolbar" id="toolbar">
    <button class="tb" data-act="h1" title="一级标题"><span class="tt">H1</span></button>
    <button class="tb" data-act="h2" title="二级标题"><span class="tt">H2</span></button>
    <button class="tb" data-act="h3" title="三级标题"><span class="tt">H3</span></button>
    <span class="sep"></span>
    <button class="tb" data-act="bold" title="加粗 (Ctrl+B)"><span class="tt" style="font-size:14px">B</span></button>
    <button class="tb" data-act="italic" title="斜体 (Ctrl+I)"><span class="tt" style="font-style:italic;font-size:14px">I</span></button>
    <button class="tb" data-act="strike" title="删除线"><span class="tt" style="text-decoration:line-through;font-size:14px">S</span></button>
    <button class="tb" data-act="icode" title="行内代码"><span class="mono">&lt;/&gt;</span></button>
    <span class="sep"></span>
    <button class="tb" data-act="quote" title="引用">
      <svg viewBox="0 0 16 16" fill="currentColor" stroke="none"><path d="M3 4.5C3 3.7 3.7 3 4.5 3H6c.6 0 1 .4 1 1v3.5c0 1.9-1 3.6-2.6 4.4-.4.2-.9 0-1-.4-.1-.3 0-.7.3-.9.8-.5 1.3-1.3 1.4-2.1H4.5C3.7 8.5 3 7.8 3 7V4.5zm6 0C9 3.7 9.7 3 10.5 3H12c.6 0 1 .4 1 1v3.5c0 1.9-1 3.6-2.6 4.4-.4.2-.9 0-1-.4-.1-.3 0-.7.3-.9.8-.5 1.3-1.3 1.4-2.1h-.6C9.7 8.5 9 7.8 9 7V4.5z"/></svg>
    </button>
    <button class="tb" data-act="ul" title="无序列表">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="3" cy="4" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/><line x1="6.5" y1="4" x2="13.5" y2="4"/><line x1="6.5" y1="8" x2="13.5" y2="8"/><line x1="6.5" y1="12" x2="13.5" y2="12"/></svg>
    </button>
    <button class="tb" data-act="ol" title="有序列表">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><text x="1.2" y="5.6" font-size="5" fill="currentColor" stroke="none" font-family="sans-serif">1</text><text x="1.2" y="10.1" font-size="5" fill="currentColor" stroke="none" font-family="sans-serif">2</text><text x="1.2" y="14.6" font-size="5" fill="currentColor" stroke="none" font-family="sans-serif">3</text><line x1="6.5" y1="4" x2="13.5" y2="4"/><line x1="6.5" y1="8.5" x2="13.5" y2="8.5"/><line x1="6.5" y1="13" x2="13.5" y2="13"/></svg>
    </button>
    <span class="sep"></span>
    <button class="tb" data-act="link" title="插入链接 (Ctrl+K)">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M9.5 5H11a3 3 0 0 1 0 6H9.5"/><path d="M6.5 11H5a3 3 0 0 1 0-6h1.5"/><line x1="5.5" y1="8" x2="10.5" y2="8"/></svg>
    </button>
    <button class="tb" data-act="image" title="插入图片">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.8" y="3" width="12.4" height="10" rx="1.5"/><circle cx="5.2" cy="6.4" r="1.1"/><path d="M2.5 11.5 6 8l2.5 2.5L11 8l2.8 3"/></svg>
    </button>
    <button class="tb" data-act="codeblock" title="插入代码块">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="1.5" y1="5.5" x2="14.5" y2="5.5"/><circle cx="3.6" cy="4" r=".65" fill="currentColor" stroke="none"/><circle cx="5.6" cy="4" r=".65" fill="currentColor" stroke="none"/><circle cx="7.6" cy="4" r=".65" fill="currentColor" stroke="none"/><path d="m5.5 8-1.7 1.7L5.5 11.4"/><path d="m10.5 8 1.7 1.7-1.7 1.7"/></svg>
    </button>
    <button class="tb" data-act="table" title="插入表格">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="1.5" y1="6.2" x2="14.5" y2="6.2"/><line x1="1.5" y1="9.9" x2="14.5" y2="9.9"/><line x1="8" y1="2.5" x2="8" y2="13.5"/></svg>
    </button>
    <button class="tb" data-act="hr" title="插入分割线">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="2" y1="8" x2="6" y2="8"/><circle cx="8" cy="8" r=".8" fill="currentColor" stroke="none"/><line x1="10" y1="8" x2="14" y2="8"/></svg>
    </button>
    <span class="sep"></span>
    <button class="tb" data-act="openfile" title="打开本地 Markdown 文件（也可直接拖拽文件到左侧）">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12.5v-8a1 1 0 0 1 1-1h3l1.5 1.8h5.5a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1z"/></svg>
    </button>
    <button class="tb" data-act="vault" title="Obsidian / 本地笔记库：授权目录后点选笔记直接载入">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.5 12.8 5 11.4 14 4.6 14 3.2 5z"/><path d="M8 1.5 6.8 8.2 8 14"/><path d="M3.2 5h9.6" opacity=".5"/></svg>
    </button>
    <button class="tb" data-act="sample" title="载入示例文档">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z"/><path d="M9.5 1.5V5H13"/><line x1="5.5" y1="8" x2="10.5" y2="8"/><line x1="5.5" y1="10.5" x2="10.5" y2="10.5"/></svg>
    </button>
    <button class="tb" data-act="clear" title="清空内容">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11"/><path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"/><path d="M4.5 4.5V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4.5"/><line x1="6.8" y1="7" x2="6.8" y2="11.5"/><line x1="9.2" y1="7" x2="9.2" y2="11.5"/></svg>
    </button>
  </div>

  <div class="actions">
    <span class="stat" id="stat">0 字</span>
    <button class="primary" id="copyBtn">复制到公众号</button>
  </div>
</header>

<main class="split">
  <section class="pane editor-pane" id="editorPane">
    <textarea id="editor" placeholder="在这里输入 Markdown…" spellcheck="false"></textarea>
  </section>
  <div class="divider" id="divider" title="拖动调整宽度"></div>
  <section class="pane preview-pane" id="previewPane">
    <div class="phone">
      <div class="phone-head"><span>公众号预览</span><span>所见即所得</span></div>
      <div id="preview"></div>
    </div>
  </section>
</main>

<div class="mask" id="mask">
  <div class="modal">
    <h3 id="modalTitle">插入图片</h3>
    <label id="modalUrlLabel">图片地址
      <input id="modalUrl" placeholder="https://…（建议使用图床外链）">
    </label>
    <label id="modalTextLabel">图注 / 描述
      <input id="modalText" placeholder="可选">
    </label>
    <div class="modal-btns">
      <button class="ghost" id="modalCancel">取消</button>
      <button class="primary" id="modalOk">插入</button>
    </div>
  </div>
</div>

<div class="drawer" id="drawer">
  <div class="drawer-head">
    <input id="vaultSearch" placeholder="搜索笔记标题或路径…">
    <button id="vaultSwitch" title="重新选择笔记库目录">换库</button>
  </div>
  <div class="drawer-list" id="vaultList"></div>
</div>

<input type="file" id="fileInput" accept=".md,.markdown,.txt" style="display:none">

<div class="toast" id="toast"></div>

<script src="/vendor/marked.js"><\/script>
<script src="/vendor/highlight.js"><\/script>
<script>
(function () {
  'use strict';

  /* ================= 公众号内联样式主题（参考 mdnice 默认主题实测值） ================= */
  var MAC_DOTS = 'data:image/svg+xml;base64,${MAC_DOTS_B64}';
  var CODE_FONT = "font-family:Consolas,Monaco,Menlo,monospace;";

  var S = {
    wrap: 'font-size:15px;color:#000000;line-height:1.8em;letter-spacing:0em;word-break:break-word;text-align:left;',
    p: 'color:#000000;font-size:15px;line-height:1.8em;letter-spacing:0em;text-align:left;text-indent:0em;margin:0;padding:8px 0;',
    h1o: 'margin:30px 0 15px;padding:0;display:block;',
    h1i: 'display:block;font-size:24px;color:#000000;line-height:1.5em;letter-spacing:0em;text-align:left;font-weight:bold;',
    h2o: 'margin:30px 0 15px;padding:0;display:block;text-align:left;',
    h2i: 'display:inline-block;font-size:18px;color:#ffffff;background-color:#212122;line-height:2.4em;letter-spacing:0em;padding:0 30px 0 15px;font-weight:bold;border-radius:0 0 40px 0;',
    h3o: 'margin:25px 0 12px;padding:0;display:block;',
    h3i: 'display:inline-block;font-size:16px;color:#000000;line-height:1.5em;font-weight:bold;border-left:3px solid #212122;padding-left:8px;',
    h4o: 'margin:20px 0 10px;padding:0;display:block;',
    h4i: 'display:block;font-size:15px;color:#000000;line-height:1.5em;font-weight:bold;',
    strong: 'color:#ef7060;font-weight:bold;',
    em: 'color:#ef7060;font-style:italic;',
    del: 'color:#999999;text-decoration:line-through;',
    codespan: 'color:#ef7060;font-size:14px;line-height:1.8em;letter-spacing:0em;background-color:rgba(27,31,35,0.05);padding:2px 4px;margin:0 2px;border-radius:4px;word-break:break-all;' + CODE_FONT,
    link: 'color:#576b95;text-decoration:none;border-bottom:1px solid rgba(87,107,149,0.35);',
    blockquote: 'margin:20px 0;padding:10px 10px 10px 20px;border-left:3px solid rgba(0,0,0,0.4);background-color:rgba(0,0,0,0.05);display:block;overflow-x:auto;',
    pre: 'margin:12px 0;padding:0;border-radius:5px;box-shadow:rgba(0,0,0,0.55) 0px 2px 10px;background-color:#282c34;background-image:url(MACDOTS);background-repeat:no-repeat;background-position:14px 13px;text-align:left;',
    code: 'display:block;overflow-x:auto;padding:16px;padding-top:36px;color:#abb2bf;font-size:12px;line-height:1.9;white-space:nowrap;-webkit-overflow-scrolling:touch;' + CODE_FONT,
    ulist: 'list-style-type:disc;margin:8px 0;padding-left:25px;color:#000000;',
    olist: 'list-style-type:decimal;margin:8px 0;padding-left:25px;color:#000000;',
    li: 'margin:5px 0;text-align:left;',
    liSec: 'margin:5px 0;color:#010101;font-size:15px;line-height:1.8em;letter-spacing:0em;font-weight:normal;',
    img: 'display:block;margin:10px auto 4px;max-width:100%;border-radius:4px;',
    figcap: 'display:block;text-align:center;font-size:13px;color:#888888;line-height:1.8em;margin:0 0 6px;',
    hr: 'margin:20px 0;border:none;border-top:1px solid rgba(0,0,0,0.1);height:1px;',
    tableWrap: 'margin:15px 0;overflow-x:auto;',
    table: 'border-collapse:collapse;text-align:left;font-size:14px;width:100%;',
    th: 'border:1px solid #cccccc;padding:5px 10px;min-width:85px;background-color:#f0f0f0;color:#000000;font-size:15px;line-height:1.5em;font-weight:bold;',
    td: 'border:1px solid #cccccc;padding:5px 10px;min-width:85px;color:#000000;font-size:15px;line-height:1.5em;'
  };
  S.pre = S.pre.replace('MACDOTS', MAC_DOTS);

  /* Atom One Dark：highlight.js class -> 内联颜色（微信会剥 class，必须内联化） */
  var HL = {
    'hljs-comment': 'color:#5c6370;font-style:italic;',
    'hljs-quote': 'color:#5c6370;font-style:italic;',
    'hljs-doctag': 'color:#c678dd;',
    'hljs-keyword': 'color:#c678dd;',
    'hljs-formula': 'color:#c678dd;',
    'hljs-section': 'color:#e06c75;',
    'hljs-name': 'color:#e06c75;',
    'hljs-selector-tag': 'color:#e06c75;',
    'hljs-deletion': 'color:#e06c75;',
    'hljs-subst': 'color:#e06c75;',
    'hljs-literal': 'color:#56b6c2;',
    'hljs-string': 'color:#98c379;',
    'hljs-regexp': 'color:#98c379;',
    'hljs-addition': 'color:#98c379;',
    'hljs-attribute': 'color:#98c379;',
    'hljs-attr': 'color:#d19a66;',
    'hljs-variable': 'color:#d19a66;',
    'hljs-template-variable': 'color:#d19a66;',
    'hljs-type': 'color:#d19a66;',
    'hljs-selector-class': 'color:#d19a66;',
    'hljs-selector-attr': 'color:#d19a66;',
    'hljs-selector-pseudo': 'color:#d19a66;',
    'hljs-number': 'color:#d19a66;',
    'hljs-symbol': 'color:#61aeee;',
    'hljs-bullet': 'color:#61aeee;',
    'hljs-link': 'color:#61aeee;',
    'hljs-meta': 'color:#61aeee;',
    'hljs-selector-id': 'color:#61aeee;',
    'hljs-title': 'color:#61aeee;',
    'function_': 'color:#61aeee;',
    'class_': 'color:#e6c07b;',
    'hljs-built_in': 'color:#e6c07b;',
    'hljs-emphasis': 'font-style:italic;',
    'hljs-strong': 'font-weight:bold;'
  };

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 代码高亮 -> 内联样式 + 微信兼容的换行/空格处理 */
  function highlightInline(code, lang) {
    var raw;
    try {
      if (lang && window.hljs.getLanguage(lang)) {
        raw = window.hljs.highlight(code, { language: lang }).value;
      } else if (lang) {
        raw = esc(code);
      } else {
        raw = window.hljs.highlightAuto(code).value;
      }
    } catch (e) {
      raw = esc(code);
    }
    var box = document.createElement('div');
    box.innerHTML = raw;
    // class -> style
    var nodes = box.querySelectorAll('[class]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var style = '';
      var cls = el.className.split(/\\s+/);
      for (var j = 0; j < cls.length; j++) {
        if (HL[cls[j]]) style += HL[cls[j]];
      }
      if (style) el.setAttribute('style', style);
      el.removeAttribute('class');
    }
    // 文本节点：\\n -> <br>，空格 -> nbsp（微信编辑器会吞 pre 里的原始换行与连续空格）
    convertWhitespace(box);
    return box.innerHTML;
  }

  function convertWhitespace(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.nodeType === 3) {
        var text = child.textContent.replace(/\\t/g, '    ');
        var parts = text.split('\\n');
        var frag = document.createDocumentFragment();
        for (var j = 0; j < parts.length; j++) {
          if (j > 0) frag.appendChild(document.createElement('br'));
          if (parts[j]) frag.appendChild(document.createTextNode(parts[j].replace(/ /g, '\\u00a0')));
        }
        child.parentNode.replaceChild(frag, child);
      } else if (child.nodeType === 1) {
        convertWhitespace(child);
      }
    }
  }

  /* ================= marked 渲染器：直接输出带内联样式的 HTML ================= */
  var renderer = {
    paragraph: function (token) {
      return '<p style="' + S.p + '">' + this.parser.parseInline(token.tokens) + '</p>';
    },
    heading: function (token) {
      var inner = this.parser.parseInline(token.tokens);
      var d = token.depth;
      if (d === 1) return '<h1 style="' + S.h1o + '"><span style="' + S.h1i + '">' + inner + '</span></h1>';
      if (d === 2) return '<h2 style="' + S.h2o + '"><span style="' + S.h2i + '">' + inner + '</span></h2>';
      if (d === 3) return '<h3 style="' + S.h3o + '"><span style="' + S.h3i + '">' + inner + '</span></h3>';
      return '<h4 style="' + S.h4o + '"><span style="' + S.h4i + '">' + inner + '</span></h4>';
    },
    blockquote: function (token) {
      return '<blockquote style="' + S.blockquote + '">' + this.parser.parse(token.tokens) + '</blockquote>';
    },
    code: function (token) {
      var lang = (token.lang || '').trim().split(/\\s+/)[0].toLowerCase();
      return '<pre style="' + S.pre + '"><code style="' + S.code + '">' +
        highlightInline(token.text, lang) + '</code></pre>';
    },
    codespan: function (token) {
      return '<code style="' + S.codespan + '">' + esc(token.text) + '</code>';
    },
    strong: function (token) {
      return '<strong style="' + S.strong + '">' + this.parser.parseInline(token.tokens) + '</strong>';
    },
    em: function (token) {
      return '<em style="' + S.em + '">' + this.parser.parseInline(token.tokens) + '</em>';
    },
    del: function (token) {
      return '<del style="' + S.del + '">' + this.parser.parseInline(token.tokens) + '</del>';
    },
    link: function (token) {
      var text = this.parser.parseInline(token.tokens);
      return '<a href="' + esc(token.href || '') + '" style="' + S.link + '">' + text + '</a>';
    },
    image: function (token) {
      var alt = token.text || '';
      var html = '<img src="' + esc(token.href || '') + '" alt="' + esc(alt) + '" style="' + S.img + '"/>';
      if (alt) html += '<span style="' + S.figcap + '">' + esc(alt) + '</span>';
      return html;
    },
    list: function (token) {
      var tag = token.ordered ? 'ol' : 'ul';
      var style = token.ordered ? S.olist : S.ulist;
      var start = token.ordered && token.start !== 1 && token.start !== '' ? ' start="' + token.start + '"' : '';
      var body = '';
      for (var i = 0; i < token.items.length; i++) {
        body += this.listitem(token.items[i]);
      }
      return '<' + tag + ' style="' + style + '"' + start + '>' + body + '</' + tag + '>';
    },
    listitem: function (item) {
      var inner = this.parser.parse(item.tokens);
      return '<li style="' + S.li + '"><section style="' + S.liSec + '">' + inner + '</section></li>';
    },
    hr: function () {
      return '<hr style="' + S.hr + '"/>';
    },
    table: function (token) {
      var html = '<section style="' + S.tableWrap + '"><table style="' + S.table + '"><thead><tr>';
      var i, j;
      for (i = 0; i < token.header.length; i++) {
        html += cell(this, token.header[i], S.th, 'th');
      }
      html += '</tr></thead><tbody>';
      for (i = 0; i < token.rows.length; i++) {
        html += '<tr>';
        for (j = 0; j < token.rows[i].length; j++) {
          html += cell(this, token.rows[i][j], S.td, 'td');
        }
        html += '</tr>';
      }
      html += '</tbody></table></section>';
      return html;
      function cell(self, c, style, tag) {
        var align = c.align ? 'text-align:' + c.align + ';' : '';
        return '<' + tag + ' style="' + style + align + '">' + self.parser.parseInline(c.tokens) + '</' + tag + '>';
      }
    }
  };

  window.marked.use({ gfm: true, breaks: true, renderer: renderer });

  /* ================= 实时渲染 ================= */
  var ed = document.getElementById('editor');
  var preview = document.getElementById('preview');
  var previewPane = document.getElementById('previewPane');
  var stat = document.getElementById('stat');
  var renderTimer = null;
  var saveTimer = null;
  var DRAFT_KEY = 'md2wx.draft';

  /* 剥离文档开头的 YAML front matter（Hexo/Jekyll 博客头），中间的 --- 分割线不受影响 */
  function stripFrontMatter(md) {
    return md.replace(/^\\uFEFF?[ \\t\\r\\n]*---[ \\t]*\\r?\\n[\\s\\S]*?\\r?\\n(?:---|\\.\\.\\.)[ \\t]*(?:\\r?\\n|$)/, '');
  }

  /* Obsidian 语法转通用 markdown：[[双链]] 文本化、![[附件]] 转提示。
     按代码围栏分段，只处理围栏外的内容（避免误伤 bash 的 [[ -f x ]] 等）。 */
  function obsidianize(md) {
    var parts = md.split(/(\\u0060\\u0060\\u0060[\\s\\S]*?\\u0060\\u0060\\u0060)/);
    for (var i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i]
        .replace(/!\\[\\[([^\\]|]+?)(?:\\|[^\\]]*)?\\]\\]/g, '\\u0060[本地附件: $1，请上传图床后替换]\\u0060')
        .replace(/\\[\\[([^\\]|]+?)\\|([^\\]]+?)\\]\\]/g, '$2')
        .replace(/\\[\\[([^\\]]+?)\\]\\]/g, '$1');
    }
    return parts.join('');
  }

  function renderNow() {
    var md = ed.value;
    stat.textContent = md.length + ' 字';
    md = obsidianize(stripFrontMatter(md));
    if (!md.trim()) {
      preview.innerHTML = '<div class="empty-tip">左侧输入 Markdown，这里实时预览</div>';
      return;
    }
    var html;
    try {
      html = window.marked.parse(md);
    } catch (e) {
      html = '<p style="color:#e06c75">渲染出错：' + esc(e.message) + '</p>';
    }
    preview.innerHTML = '<section style="' + S.wrap + '">' + html + '</section>';
  }

  ed.addEventListener('input', function () {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, 150);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(DRAFT_KEY, ed.value); } catch (e) {}
    }, 600);
  });

  /* 编辑器 -> 预览 同步滚动（按比例） */
  ed.addEventListener('scroll', function () {
    var max = ed.scrollHeight - ed.clientHeight;
    if (max <= 0) return;
    var ratio = ed.scrollTop / max;
    previewPane.scrollTop = ratio * (previewPane.scrollHeight - previewPane.clientHeight);
  });

  /* ================= 编辑辅助 ================= */
  function insertText(text) {
    ed.focus();
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) {}
    if (!ok) {
      var s = ed.selectionStart, e2 = ed.selectionEnd;
      ed.setRangeText(text, s, e2, 'end');
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function wrapSel(before, after, placeholder) {
    var s = ed.selectionStart, e2 = ed.selectionEnd;
    var sel = ed.value.slice(s, e2) || placeholder;
    insertText(before + sel + after);
    ed.setSelectionRange(s + before.length, s + before.length + sel.length);
  }

  /* 对选中行（或光标行）增删前缀；ordered 为 true 时用 1. 2. 3. */
  function toggleLinePrefix(prefix, ordered) {
    var value = ed.value;
    var s = ed.selectionStart, e2 = ed.selectionEnd;
    var ls = value.lastIndexOf('\\n', s - 1) + 1;
    var le = value.indexOf('\\n', e2);
    if (le === -1) le = value.length;
    var block = value.slice(ls, le);
    var lines = block.split('\\n');
    var headRe = /^(\\s*)(#{1,6} |> |- |\\* |\\d+\\. )?/;
    function matchHas(l) {
      if (ordered) return /^\\s*\\d+\\. /.test(l);
      return l.trimStart().indexOf(prefix) === 0;
    }
    var allHave = lines.every(function (l) { return !l.trim() || matchHas(l); });
    var n = 0;
    var out = lines.map(function (l) {
      if (!l.trim()) return l;
      var stripped = l.replace(headRe, '$1');
      if (allHave) return stripped;
      n += 1;
      var p = ordered ? n + '. ' : prefix;
      return stripped.replace(/^(\\s*)/, '$1' + p);
    }).join('\\n');
    ed.focus();
    ed.setSelectionRange(ls, le);
    insertText(out);
    ed.setSelectionRange(ls, ls + out.length);
  }

  function insertBlock(text) {
    var s = ed.selectionStart;
    var before = ed.value.slice(0, s);
    var after = ed.value.slice(ed.selectionEnd);
    var pre = '';
    if (before && !/\\n\\n$/.test(before)) pre = /\\n$/.test(before) ? '\\n' : '\\n\\n';
    var post = after && after.charAt(0) !== '\\n' ? '\\n' : '';
    insertText(pre + text + '\\n' + post);
  }

  /* ================= 弹层（链接 / 图片） ================= */
  var mask = document.getElementById('mask');
  var modalTitle = document.getElementById('modalTitle');
  var modalUrlLabel = document.getElementById('modalUrlLabel');
  var modalTextLabel = document.getElementById('modalTextLabel');
  var modalUrl = document.getElementById('modalUrl');
  var modalText = document.getElementById('modalText');
  var modalMode = 'image';
  var savedSel = [0, 0];

  function openModal(mode) {
    modalMode = mode;
    savedSel = [ed.selectionStart, ed.selectionEnd];
    var selText = ed.value.slice(savedSel[0], savedSel[1]);
    if (mode === 'image') {
      modalTitle.textContent = '插入图片';
      modalUrlLabel.firstChild.textContent = '图片地址';
      modalUrl.placeholder = 'https://…（建议使用图床外链）';
      modalTextLabel.firstChild.textContent = '图注 / 描述';
    } else {
      modalTitle.textContent = '插入链接';
      modalUrlLabel.firstChild.textContent = '链接地址';
      modalUrl.placeholder = 'https://…';
      modalTextLabel.firstChild.textContent = '链接文字';
    }
    modalUrl.value = '';
    modalText.value = selText;
    mask.classList.add('show');
    setTimeout(function () { modalUrl.focus(); }, 50);
  }

  function closeModal() { mask.classList.remove('show'); }

  function confirmModal() {
    var url = modalUrl.value.trim();
    var text = modalText.value.trim();
    if (!url) { modalUrl.focus(); return; }
    closeModal();
    ed.focus();
    ed.setSelectionRange(savedSel[0], savedSel[1]);
    if (modalMode === 'image') {
      insertBlock('![' + (text || '') + '](' + url + ')');
      if (!/^https?:\\/\\//i.test(url)) toast('提示：非 http(s) 图片链接可能无法在公众号显示');
    } else {
      insertText('[' + (text || url) + '](' + url + ')');
    }
  }

  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalOk').addEventListener('click', confirmModal);
  mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (!mask.classList.contains('show')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter') { e.preventDefault(); confirmModal(); }
  });

  /* ================= 本地文件 / Obsidian 笔记库 ================= */
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('md2wx', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('kv').objectStore('kv').get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function loadContent(text, name) {
    ed.value = text;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.scrollTop = 0;
    closeDrawer();
    toast('已载入 ' + name);
  }

  var fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', function () {
    var f = fileInput.files[0];
    if (!f) return;
    f.text().then(function (t) { loadContent(t, f.name); });
    fileInput.value = '';
  });

  function openLocalFile() {
    if (window.showOpenFilePicker) {
      window.showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }]
      }).then(function (handles) {
        return handles[0].getFile();
      }).then(function (f) {
        return f.text().then(function (t) { loadContent(t, f.name); });
      }).catch(function (e) {
        if (e && e.name !== 'AbortError') toast('打开失败：' + e.message);
      });
    } else {
      fileInput.click();
    }
  }

  /* --- Obsidian vault --- */
  var drawer = document.getElementById('drawer');
  var vaultList = document.getElementById('vaultList');
  var vaultSearch = document.getElementById('vaultSearch');
  var vaultHandle = null;
  var vaultFiles = [];

  function openDrawer() {
    drawer.classList.add('open');
    setTimeout(function () { vaultSearch.focus(); }, 120);
  }
  function closeDrawer() { drawer.classList.remove('open'); }

  document.addEventListener('mousedown', function (e) {
    if (!drawer.classList.contains('open')) return;
    if (drawer.contains(e.target)) return;
    var btn = e.target.closest ? e.target.closest('[data-act="vault"]') : null;
    if (btn) return;
    closeDrawer();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  function scanVault(dir) {
    var out = [];
    function walk(d, prefix) {
      var it = d.values();
      function step() {
        return it.next().then(function (r) {
          if (r.done) return null;
          var entry = r.value;
          if (entry.name.charAt(0) === '.') return step();
          if (entry.kind === 'directory') {
            return walk(entry, prefix + entry.name + '/').then(step);
          }
          if (/\\.(md|markdown|txt)$/i.test(entry.name)) {
            out.push({ name: entry.name, path: prefix + entry.name, handle: entry, mtime: 0 });
          }
          return step();
        });
      }
      return step();
    }
    return walk(dir, '').then(function () {
      if (out.length === 0 || out.length > 800) {
        out.sort(function (a, b) { return a.path < b.path ? -1 : 1; });
        return out;
      }
      return Promise.all(out.map(function (f) {
        return f.handle.getFile().then(
          function (file) { f.mtime = file.lastModified; },
          function () {}
        );
      })).then(function () {
        out.sort(function (a, b) { return b.mtime - a.mtime; });
        return out;
      });
    });
  }

  function renderVaultList(query) {
    var q = (query || '').trim().toLowerCase();
    var shown = 0;
    var html = '';
    for (var i = 0; i < vaultFiles.length && shown < 400; i++) {
      var f = vaultFiles[i];
      if (q && f.path.toLowerCase().indexOf(q) === -1) continue;
      shown += 1;
      html += '<div class="vault-item" data-path="' + esc(f.path) + '"><b>' +
        esc(f.name.replace(/\\.(md|markdown|txt)$/i, '')) + '</b><span>' + esc(f.path) + '</span></div>';
    }
    vaultList.innerHTML = html || '<div class="drawer-empty">' +
      (vaultFiles.length ? '没有匹配的笔记' : '笔记库为空') + '</div>';
  }

  vaultSearch.addEventListener('input', function () { renderVaultList(vaultSearch.value); });

  vaultList.addEventListener('click', function (e) {
    var item = e.target.closest('.vault-item');
    if (!item) return;
    var path = item.getAttribute('data-path');
    for (var i = 0; i < vaultFiles.length; i++) {
      if (vaultFiles[i].path === path) {
        vaultFiles[i].handle.getFile().then(function (f) {
          return f.text().then(function (t) { loadContent(t, f.name); });
        }, function (err) { toast('读取失败：' + err.message); });
        return;
      }
    }
  });

  function pickVault() {
    return window.showDirectoryPicker({ id: 'obsidianVault' }).then(function (h) {
      vaultHandle = h;
      return idbSet('vault', h).catch(function () {}).then(function () { return h; });
    });
  }

  function ensurePermission(handle) {
    return handle.queryPermission({ mode: 'read' }).then(function (p) {
      if (p === 'granted') return true;
      return handle.requestPermission({ mode: 'read' }).then(function (p2) { return p2 === 'granted'; });
    });
  }

  function openVault(forcePick) {
    if (!window.showDirectoryPicker) {
      toast('当前浏览器不支持目录访问，请用 Chrome/Edge，或改用「打开文件」按钮');
      return;
    }
    var ready;
    if (forcePick) {
      ready = pickVault();
    } else if (vaultHandle) {
      ready = Promise.resolve(vaultHandle);
    } else {
      ready = idbGet('vault').then(function (saved) {
        if (!saved) return pickVault();
        return ensurePermission(saved).then(function (ok) {
          if (ok) { vaultHandle = saved; return saved; }
          return pickVault();
        });
      });
    }
    ready.then(function (handle) {
      openDrawer();
      vaultList.innerHTML = '<div class="drawer-empty">正在扫描笔记库…</div>';
      return scanVault(handle).then(function (files) {
        vaultFiles = files;
        renderVaultList(vaultSearch.value);
      });
    }).catch(function (e) {
      closeDrawer();
      if (e && e.name === 'AbortError') return;
      toast('打开笔记库失败：' + (e && e.message ? e.message : e));
    });
  }

  document.getElementById('vaultSwitch').addEventListener('click', function () { openVault(true); });

  /* 拖拽 .md 文件到编辑器载入 */
  var editorPaneEl = document.getElementById('editorPane');
  ['dragenter', 'dragover'].forEach(function (ev) {
    editorPaneEl.addEventListener(ev, function (e) {
      e.preventDefault();
      editorPaneEl.classList.add('dragging');
    });
  });
  editorPaneEl.addEventListener('dragleave', function (e) {
    if (e.target === editorPaneEl || !editorPaneEl.contains(e.relatedTarget)) {
      editorPaneEl.classList.remove('dragging');
    }
  });
  editorPaneEl.addEventListener('drop', function (e) {
    e.preventDefault();
    editorPaneEl.classList.remove('dragging');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (!/\\.(md|markdown|txt)$/i.test(f.name)) { toast('仅支持 .md / .markdown / .txt 文件'); return; }
    f.text().then(function (t) { loadContent(t, f.name); });
  });

  /* ================= 工具栏动作 ================= */
  var SAMPLE = [
    '# Markdown 公众号排版指南',
    '',
    '在左侧编辑 **Markdown**，右侧实时预览公众号排版效果。写完点击右上角「复制到公众号」，到公众号后台编辑器里直接粘贴即可。',
    '',
    '## 常用格式',
    '',
    '支持 **加粗强调**、*斜体*、~~删除线~~ 与 \\u0060行内代码\\u0060，也支持链接，如 [Cloudflare Workers](https://workers.cloudflare.com)。',
    '',
    '> 引用块：适合放提示、备注或一句金句。',
    '',
    '### 列表用法',
    '',
    '- 支持无序列表',
    '- 列表项可以 **加粗** 或使用 \\u0060代码\\u0060',
    '',
    '1. 有序列表第一项',
    '2. 有序列表第二项',
    '',
    '## 苹果风格代码块',
    '',
    '\\u0060\\u0060\\u0060js',
    '// 计算斐波那契数列',
    'function fib(n) {',
    '  if (n <= 1) return n;',
    '  return fib(n - 1) + fib(n - 2);',
    '}',
    "console.log('fib(10) =', fib(10)); // 55",
    '\\u0060\\u0060\\u0060',
    '',
    '\\u0060\\u0060\\u0060bash',
    '# 部署到 Cloudflare Workers',
    'npx wrangler deploy',
    '\\u0060\\u0060\\u0060',
    '',
    '## 表格与图片',
    '',
    '| 功能 | 说明 |',
    '| --- | --- |',
    '| 实时预览 | 左侧输入，右侧即时渲染 |',
    '| 一键复制 | 带内联样式，粘贴即用 |',
    '',
    '![这里是图注，会显示在图片下方](https://picsum.photos/600/320)',
    '',
    '---',
    '',
    '正文 15 px、行高 1.8、强调色 #EF7060；代码块为 Atom One Dark 配色 + Mac 窗口按钮。'
  ].join('\\n');

  var actions = {
    h1: function () { toggleLinePrefix('# '); },
    h2: function () { toggleLinePrefix('## '); },
    h3: function () { toggleLinePrefix('### '); },
    bold: function () { wrapSel('**', '**', '加粗文字'); },
    italic: function () { wrapSel('*', '*', '斜体文字'); },
    strike: function () { wrapSel('~~', '~~', '删除文字'); },
    icode: function () { wrapSel('\\u0060', '\\u0060', '代码'); },
    quote: function () { toggleLinePrefix('> '); },
    ul: function () { toggleLinePrefix('- '); },
    ol: function () { toggleLinePrefix('', true); },
    link: function () { openModal('link'); },
    image: function () { openModal('image'); },
    codeblock: function () {
      insertBlock('\\u0060\\u0060\\u0060js\\n// 在这里写代码\\n\\u0060\\u0060\\u0060');
    },
    table: function () {
      insertBlock('| 表头一 | 表头二 |\\n| --- | --- |\\n| 内容 | 内容 |');
    },
    hr: function () { insertBlock('---'); },
    openfile: function () { openLocalFile(); },
    vault: function () { openVault(false); },
    sample: function () {
      if (ed.value.trim() && !confirm('载入示例会覆盖当前内容，继续？')) return;
      ed.value = SAMPLE;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    },
    clear: function () {
      if (!ed.value) return;
      if (!confirm('确定清空全部内容？')) return;
      ed.value = '';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      ed.focus();
    }
  };

  document.getElementById('toolbar').addEventListener('click', function (e) {
    var btn = e.target.closest('.tb');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (actions[act]) actions[act]();
  });

  /* 快捷键 */
  ed.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      insertText('  ');
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    var k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); actions.bold(); }
    if (k === 'i') { e.preventDefault(); actions.italic(); }
    if (k === 'k') { e.preventDefault(); actions.link(); }
  });

  /* ================= 复制到公众号 ================= */
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function copyBySelection() {
    var range = document.createRange();
    range.selectNodeContents(preview);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    sel.removeAllRanges();
    return ok;
  }

  document.getElementById('copyBtn').addEventListener('click', function () {
    if (!ed.value.trim()) { toast('先在左侧写点内容吧'); return; }
    var html = preview.innerHTML;
    if (navigator.clipboard && window.ClipboardItem) {
      var item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([ed.value], { type: 'text/plain' })
      });
      navigator.clipboard.write([item]).then(function () {
        toast('已复制，去公众号编辑器 Ctrl+V 粘贴即可');
      }, function () {
        toast(copyBySelection() ? '已复制，去公众号编辑器粘贴即可' : '复制失败，请手动全选预览区复制');
      });
    } else {
      toast(copyBySelection() ? '已复制，去公众号编辑器粘贴即可' : '复制失败，请手动全选预览区复制');
    }
  });

  /* ================= 分栏拖拽 ================= */
  var divider = document.getElementById('divider');
  var editorPane = document.getElementById('editorPane');
  var dragging = false;
  divider.addEventListener('mousedown', function (e) {
    dragging = true;
    divider.classList.add('on');
    e.preventDefault();
  });
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var total = document.querySelector('.split').clientWidth;
    var w = Math.min(Math.max(e.clientX / total, 0.25), 0.72);
    editorPane.style.width = (w * 100) + '%';
  });
  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('on');
  });

  /* ================= 初始化 ================= */
  var draft = null;
  try { draft = localStorage.getItem(DRAFT_KEY); } catch (e) {}
  ed.value = draft !== null ? draft : SAMPLE;
  renderNow();
})();
<\/script>
</body>
</html>`;
}

export { pageHtml };
