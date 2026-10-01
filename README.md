# markdown2wechat

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wbsu2003/markdown2wechat)

部署在 Cloudflare Workers 上的 Markdown → 微信公众号排版工具。左侧写 Markdown，右侧实时渲染公众号效果，一键复制到公众号后台粘贴即用。

当前版本：**v0.0.6**（20261001）

## 功能

- **左右分栏实时预览**：左侧编辑、右侧即时渲染（150ms 防抖），无需任何按钮；中缝可拖拽调整宽度，编辑器滚动时预览同步跟随
- **工具栏**：H1/H2/H3、加粗、斜体、删除线、行内代码、引用、无序/有序列表、插入链接（Ctrl+K）、插入图片（弹窗填 URL + 图注）、代码块、表格、分割线、示例文档、清空
- **从 Obsidian / 本地笔记库一键载入**：点工具栏「宝石」按钮授权 vault 目录（仅需一次，Chrome/Edge），弹出笔记列表（按最近修改排序、支持搜索），点选即载入左侧；「文件夹」按钮打开单个 .md，或直接把 .md 文件**拖进左侧编辑器**
- **Obsidian 语法兼容**：`[[双链]]`/`[[笔记|别名]]` 自动转纯文本，`![[本地附件]]` 转为醒目提示（公众号需图床外链）；转换会跳过代码围栏，不误伤 bash 的 `[[ -f x ]]` 等
- **图床域名替换**：粘贴时自动把 `raw.githubusercontent.com/<user>/<repo>/<branch>/…` 图片链接改写为 `cdn.jsdelivr.net/gh/<user>/<repo>@<branch>/…`（国内可访问、公众号可转存）；也可点工具栏 ⇄ 按钮对全文替换
- **关于 / 帮助**：顶栏右侧问号与感叹号图标，半透磨砂弹窗展示使用说明与版本信息
- **一键复制**：预览区 DOM 即最终产物（全部内联样式），通过剪贴板 `text/html` 写入，公众号编辑器直接 Ctrl+V
- **front matter 剥离**：自动忽略文档开头的 Hexo/Jekyll YAML 头（`--- title: ... ---`），文章中间的 `---` 分割线不受影响
- **草稿自动保存**：内容实时存 localStorage，刷新不丢
- **快捷键**：Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+K 插入链接、Tab 缩进两空格

## 排版主题

参照 mdnice 默认主题（自参考文章实测提取）：

| 元素 | 样式 |
| --- | --- |
| 正文 | 15px / 行高 27px（1.8 倍，写成 px）/ 纯黑，段落上下 padding 8px |
| 加粗 / 行内代码 | 强调色 `#ef7060`（红橙） |
| H1 | 24px 加粗纯黑 |
| H2 | 黑底白字标签块（`#212122` 背景、18px、行高 43px、右下角 40px 圆弧） |
| H3 | 16px 加粗 + 左侧黑色竖条 |
| 引用块 | 左侧 3px 深灰竖线 + 5% 黑色底 |
| 代码块 | **苹果风格**：Mac 红黄绿窗口按钮（三个 `●` 文字圆点）+ Atom One Dark 配色（`#282c34` 底，套在外层 `<section>` 上）+ macOS 窗口阴影 |
| 链接 | 微信蓝 `#576b95` + 下划虚线 |
| 图片 | 居中 + 圆角，alt 文字自动作为居中灰色图注 |

## 微信兼容要点（实现说明）

公众号编辑器会剥掉 `<style>`、class 和大部分标签属性，因此：

- marked 自定义 renderer 直接输出**每个标签都带内联 style** 的 HTML
- highlight.js 的高亮结果渲染到临时 DOM 后，把 `hljs-*` class 逐个换算成内联 `color`
- 代码块内换行转 `<br>`、空格转 `&nbsp;`（NBSP ` `）；但**只转 NBSP 还不够**：公众号在**粘贴时或点保存时**（两种情况都会）把“内容全是空白”的 `<span>` 当空标签删掉（与 `color` 无关），里面 NBSP 又暴露成裸文本被吞。正解是**按行整体包裹**——`wrapLines` 把每一行（缩进 + 该行所有高亮 token）包进一个带 `color` 的行 `<span>`：行内有可见 token 就不是空标签，缩进与 `key: value` 间的空格随之全部存活；空行塌成空 span、只剩 `<br>` 正好是空行。（实证：注释含 `#`/字母等可见字符故连内部空格都活，纯缩进空白 span 被删则 `litepan:` 顶格、`image: x` 变 `image:x`。）
- Mac 三点用三个 `<span>` 包 `●`（`&#9679;`）+ `color` 实现，**不能用 CSS 画圆**（靠 `background`/`border-radius`/`inline-block` 的**空** `<span>` 会被微信剥掉 `display` 后塌陷成 0 尺寸、甚至当空标签删除，圆点整体消失）；深色底色移到外层 `<section>`：微信会剥掉内联 `background-image`、并覆盖 `<pre>` 自带的背景色，所以底色和圆点都不能放在 `<pre>` 上（否则粘贴到公众号后背景和圆点会全部丢失）
- 代码块使用 `display: block + overflow-x: auto`（参考文章原版的 `-webkit-box` 是老式 flex 布局，会把代码行横向排列导致显示错乱，此处已修正）
- 行高写成**绝对 px**（`line-height:27px` 而不是 `1.8em` / `1.8`），配合下一条保证「行高数值恒大于同元素字号」
- **凡是有 `line-height` 的标签，都必须自己写死一个小于该行的 `font-size`**。真机实测：编辑器自带 `h1 { font-size:30px }`、`h2 { font-size:22.5px }` 这类**标签选择器**，旧版只在 `<h1>` 内的 `<span>` 上写字号，于是外层 `<h1>` 的字号被编辑器补成 30px、行高却从外层 `<section>` 继承成 27px —— 编辑器里确实存在「30px 字 / 27px 行」。现在 `h1o/h2o/h3o/h4o/ulist/olist/li/blockquote/pre/codeWrap/codeBar/tableWrap` 全部自带字号+行高，`codeBar/dot` 的 `line-height:1` 改 16px；检测副本里实测 `<h1>` 已是 24px/36px（v0.0.5 是 30px/27px）。⚠ 这修的是**真实存在的字号/行高错配**，但**不是下面那批报警的解法**
- **后台「行高小于字体大小，且存在多行文本，可能导致文字重叠（实测）」的判据已用真机数据完全破解（70 个块、0 反例）**：`报警 ⟺ bbox ÷ rects.length < 0.95 × 该元素 font-size`，其中 `rects = Range.selectNodeContents(块).getClientRects()`、`bbox = max(rect.bottom) − min(rect.top)`。要害是**平台把「矩形个数」当「行数」，既不按 y 聚类、零宽矩形也照计数**。纯文本段 rects＝真实行数，比值≈行高 27 → 永不报；段内只要有任意 `<strong>`/`<code>`/`<a>`，文字就被切成多个矩形、比值立刻跌到个位数 → **必报，哪怕只有一行**（`通过 SSH 登录到您的群晖，执行下面的命令：` 单行、4 个矩形、bbox 21px → 5.25 < 14.25）。所以**调行高救不回来**：一篇实测的 38 条报警需要行高 38～222px 才达标，单行段落无论多少行高都不过。结论：**这是平台侧的检测缺陷，本工具不再为它改排版**
- 弹窗「第 N 段」＝ `data-blockidx="N-1"`（块号 0 基）。`data-violation-id="violation-{块号}-{序号}-{时间戳}"` 只是**盖在每个被测节点上的句柄**（一篇 943 个），**不代表该节点违规**，别拿它当报警清单
- **后台检测 ≠ 开源 CLI `wechatjs/verify-article-structure-spec`**：真机追踪证实检测在**浏览器本地**跑（网络侧只有 `/cgi-bin/spellingcheck` 错别字接口），走 top window 的 `Range.getClientRects`，量的是页面里一份 `top:-10000px` 级的**离屏副本**（标记盖在副本节点上，MutationObserver 只挂 `.ProseMirror` 会抓到 0 个，且标记只存活几秒）。把 CLI 算法逐行移植去跑真机活 DOM 与官方沙箱（585/677/375 三屏、85 段 / 729 个含文字元素）**命中 0** → 不能拿 CLI 源码当依据
- `<img>` 的 `data-w`/`data-ratio` 与表格的 `data-ignore-width`：**这两条只是针对开源 CLI 的加固，后台内建检测器已证实不是那套 CLI，真机能否消警未验证**。CLI 侧依据：加载不出来又无尺寸信息的 `<img>` 会被换成 1×1 透明 SVG，使「图片+图注」段算成 2 行 / 内容高 28 → 平均 14.00 < 阈值 14.25 判叠字，补 `data-w` 后本地 A/B 不再报；`data-ignore-width` 是规范 1.4.4 的官方宽度豁免位，针对 `th` 带 `min-width:85px` 时的「不同屏幕下宽度差异（#1.4）」。`annotateImages()` 只多两个属性、不改外观；加载失败的图拿不到尺寸、无法标注
- 图片请使用图床外链：粘贴时公众号会自动转存 http(s) 外链图片

## 开发与部署

**方式一：一键部署**——点击上方「Deploy to Cloudflare Workers」按钮，登录 Cloudflare 后授权连接 GitHub，向导会自动克隆本仓库并完成部署（配置读取自 `wrangler.toml`）。

**方式二：命令行部署**

```bash
git clone https://github.com/wbsu2003/markdown2wechat.git
cd markdown2wechat
npm install
npm run dev      # 本地 http://localhost:8787
npm run deploy   # 部署到 Cloudflare Workers（首次会引导 wrangler login）
```

## 项目结构

```
src/
  index.js                    # Worker 入口：/ 页面、/vendor/* 静态资源
  page.js                     # 编辑器单页（UI + 前端渲染逻辑，全部内嵌）
  vendor/
    marked.umd.js.txt         # marked 浏览器版（复制自 node_modules/marked/lib/marked.umd.js）
    highlight.min.js.txt      # highlight.js 浏览器版（cdnjs common 构建）
```

渲染完全在浏览器端进行，Worker 只托管静态内容——预览零延迟，也不消耗请求配额。

`wrangler.toml` 里的 `rules = [{ type = "Text", globs = ["**/*.txt"] }]` 让两个 vendor 文件作为文本模块打包进 Worker。

### 升级 vendor 依赖

```bash
# marked：升级 npm 包后重新复制
npm install marked@latest
cp node_modules/marked/lib/marked.umd.js src/vendor/marked.umd.js.txt

# highlight.js：从 cdnjs 下载新版本
curl -sL "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js" -o src/vendor/highlight.min.js.txt
```

## 更新历史

- **v0.0.6**（20261001）
  - **用真机追踪探针把后台「内容结构检测」的判据彻底破解了。** 从编辑器活页面里抓到 277 条 `Range.getClientRects` 全量调用记录 + 943 个 `data-violation-id` 标记 + 弹窗 38 条报警段号，拟合出**零反例**（70 个块）的判定式：`bbox ÷ rects.length < 0.95 × 字号` 即报警。要害是平台**把矩形个数当行数**、不按 y 聚类，段内一旦有 `<strong>`/`<code>`/`<a>` 把文字切成多块矩形就必报（单行也报），**调行高无法消警**（需 38～222px），属**平台侧缺陷**。同时确认：检测在浏览器本地跑、走 top window 的 `Range`、量的是页面里一份 `top:-10000px` 级的**离屏副本**，标记只存活几秒；弹窗「第 N 段」＝ `data-blockidx="N-1"`，`data-violation-id` 只是句柄而非违规清单。
  - **推翻此前基于开源 CLI 的三条推断**：内建检测器 ≠ `wechatjs/verify-article-structure-spec`（把 CLI 算法逐行移植去跑真机活 DOM 与官方沙箱，85 段 / 729 个含文字元素，**命中 0**）。故「px 化能消警」「图片被换成 1×1 兜底是真根因」「第 19/22 段＝代码块」均不成立；`data-w`/`data-ignore-width` 降级为**仅针对 CLI 的加固，真机未验证**。
  - 主题 `S` 里所有 `line-height` 从 `1.8em` / `2.4em` / `1.9` 这类 em、倍数写法换成等值的**绝对 px**（正文 27px、H1 36px、H2 43px、H3 24px、H4 23px、行内代码 25px、代码块 23px、图注 23px、表格 23px、Mac 三点 16px），渲染差异 ≤1px（本地截图对照一致）。
  - **凡是有 `line-height` 的标签都自己写死一个更小的 `font-size`**（`h1o/h2o/h3o/h4o/ulist/olist/li/blockquote/pre/codeWrap/codeBar/tableWrap` 补齐，`codeBar/dot` 的 `line-height:1` 改 16px）。真机实测产物里的 `<h1>` 曾被编辑器自带的 `h1 { font-size:30px }` 补成 30px 字号、行高继承成 27px；本地对抗性验证 v0.0.5 有 5 个「行高 ≤ 字号」→ v0.0.6 为 0，副本实测 `<h1>` 已变 24px/36px。⚠ 这条修的是**真实存在的字号/行高错配**，按第一条的判据，它**消不掉那 38 条报警**。
  - `<img>` 渲染后补 `data-w` / `data-ratio`（`annotateImages()`，取 `naturalWidth/naturalHeight`），表格外层 `<section>` 加规范 1.4.4 的官方豁免位 `data-ignore-width`。两条均只多属性、不改外观，属针对开源 CLI 的预防性加固。
- **v0.0.5**（20260712）
  - 修复代码块粘贴到公众号后**缩进、`key: value` 间空格被吞**：改用「按行整体包裹」——每行连同缩进包进一个带 `color` 的行 `<span>`，行内有可见 token 就不会被当空标签删除，行内空格随之全部保留；空行塌成空 span 被删、只留 `<br>` 正好是空行。（v0.0.4 的「给空格单独包一层同色 `<span>`」对纯缩进会生成“纯空白 span”，仍被公众号当空标签删掉，故未彻底解决。）
  - 修复「关于」弹窗版本号**日期重复**显示（`v0.0.4（20260712）（20260712）` → `v0.0.5（20260712）`）。
- **v0.0.4**（20260712）
  - 首次尝试修复代码块空格被公众号吞：空格转 NBSP 并包一层同色 `<span>`。对含可见字符的行有效，但纯缩进行仍被清洗——由 v0.0.5 彻底解决。
- **v0.0.3**（20260711）
  - 基线版本：Markdown → 公众号排版、左右实时预览、mdnice 默认主题、代码块苹果窗口风格、Obsidian 笔记导入、图床域名替换、front matter 剥离等（详见上文「功能」）。
