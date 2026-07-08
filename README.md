# markdown2wechat

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wbsu2003/markdown2wechat)

部署在 Cloudflare Workers 上的 Markdown → 微信公众号排版工具。左侧写 Markdown，右侧实时渲染公众号效果，一键复制到公众号后台粘贴即用。

## 功能

- **左右分栏实时预览**：左侧编辑、右侧即时渲染（150ms 防抖），无需任何按钮；中缝可拖拽调整宽度，编辑器滚动时预览同步跟随
- **工具栏**：H1/H2/H3、加粗、斜体、删除线、行内代码、引用、无序/有序列表、插入链接（Ctrl+K）、插入图片（弹窗填 URL + 图注）、代码块、表格、分割线、示例文档、清空
- **一键复制**：预览区 DOM 即最终产物（全部内联样式），通过剪贴板 `text/html` 写入，公众号编辑器直接 Ctrl+V
- **front matter 剥离**：自动忽略文档开头的 Hexo/Jekyll YAML 头（`--- title: ... ---`），文章中间的 `---` 分割线不受影响
- **草稿自动保存**：内容实时存 localStorage，刷新不丢
- **快捷键**：Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+K 插入链接、Tab 缩进两空格

## 排版主题

参照 mdnice 默认主题（自参考文章实测提取）：

| 元素 | 样式 |
| --- | --- |
| 正文 | 15px / 1.8em 行高 / 纯黑，段落上下 padding 8px |
| 加粗 / 行内代码 | 强调色 `#ef7060`（红橙） |
| H1 | 24px 加粗纯黑 |
| H2 | 黑底白字标签块（`#212122` 背景、18px、行高 2.4em、右下角 40px 圆弧） |
| H3 | 16px 加粗 + 左侧黑色竖条 |
| 引用块 | 左侧 3px 深灰竖线 + 5% 黑色底 |
| 代码块 | **苹果风格**：Mac 红黄绿窗口按钮（base64 SVG 背景图）+ Atom One Dark 配色（`#282c34` 底）+ macOS 窗口阴影 |
| 链接 | 微信蓝 `#576b95` + 下划虚线 |
| 图片 | 居中 + 圆角，alt 文字自动作为居中灰色图注 |

## 微信兼容要点（实现说明）

公众号编辑器会剥掉 `<style>`、class 和大部分标签属性，因此：

- marked 自定义 renderer 直接输出**每个标签都带内联 style** 的 HTML
- highlight.js 的高亮结果渲染到临时 DOM 后，把 `hljs-*` class 逐个换算成内联 `color`
- 代码块内换行转 `<br>`、空格转 `&nbsp;`（微信会吞 `pre` 的原始换行和连续空格）
- Mac 三点用 `background-image: url(data:image/svg+xml;base64,…)` 内联（`<svg>` 标签会被微信剥掉，背景图能存活）
- 代码块使用 `display: block + overflow-x: auto`（参考文章原版的 `-webkit-box` 是老式 flex 布局，会把代码行横向排列导致显示错乱，此处已修正）
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
