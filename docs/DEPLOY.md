# 问搭 · 本地运行与发布

本文档回答三个问题：**能不能用 IDEA 启动？** **本地怎么跑？** **怎么发布到公网？**

---

## 一、能用 IDEA 启动吗？

**分两种情况，答案不同：**

### 小程序本体：❌ 不能用 IDEA

微信小程序不能用 IDEA 运行，必须用**微信开发者工具**（wechat-devtools）打开 `miniprogram/` 目录。
IDEA 是 Java IDE，不认识 `.wxml` / `.wxss` / 小程序运行时。

如果你想用 IDEA 管理这个项目，可以把它当普通文件夹打开（IDEA 支持纯 JS 项目），
但「运行」要交给微信开发者工具。

### HTML 原型：✅ 可以，而且不需要任何服务器

`prototype/` 是纯静态页面。我已经打包成了**单个 HTML 文件**：

[wenda-demo.html](file:///F:/daily/wenda/dist/wenda-demo.html)

**双击就能在浏览器打开**，所有 CSS / JS / 数据都内联在里面，不依赖 Node、不依赖服务器、不依赖网络。
发给任何人都能直接双击看。

> 本机没装 IDEA（也没装 Java 和微信开发者工具），Node 24 是有的。
> 上面的单文件方案是目前这台机器上最省事的启动方式。

---

## 二、本地运行方式

### 方式 A · 双击打开（零依赖，最快）

```
F:\daily\wenda\dist\wenda-demo.html
```

直接双击。已实测：147 张卡片渲染、分类筛选、投票、点赞、提交回答、采纳、发布问题全部正常。

### 方式 B · 起本地服务器（推荐开发时用）

```bash
cd F:\daily\wenda
node tools\serve.js 8899            # 原型
node tools\serve.js 8900 F:\daily\wenda   # 整站（含后台）
node tools\serve.js 8902 F:\daily\wenda\dist\site  # 打包后的站点
```

浏览器打开 http://127.0.0.1:8899

### 方式 C · 微信开发者工具（跑小程序本体）

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目，选 `F:\daily\wenda\miniprogram` 目录
3. `project.config.json` 里 `appid` 目前是 `touristappid`（游客模式），可直接预览
4. **不配云开发也能跑**：数据层会自动降级到本地 mock，内置 147 条种子数据

---

## 三、发布到公网

### 方案 A · GitHub Pages（免费，推荐）

需要先装 [GitHub CLI](https://cli.github.com/) 并登录（`gh auth login`），或在 GitHub 上先创建一个空仓库。

```bash
cd F:\daily\wenda
node tools\build-site.js                      # 构建站点到 dist/site
node tools\publish-github.js <你的用户名> <仓库名>
```

例：

```bash
node tools\publish-github.js yourname wenda-demo
```

发布后访问 `https://yourname.github.io/wenda-demo/`

**首次需要**：仓库 Settings → Pages → Source 选 `gh-pages` 分支 / `root` → Save。

### 方案 B · Netlify / Vercel（拖拽即可，零命令行）

1. 打开 [app.netlify.com/drop](https://app.netlify.com/drop)（或 Vercel）
2. 把 `F:\daily\wenda\dist\site` 整个文件夹拖进去
3. 立刻拿到一个公网 URL

这两个平台免费额度足够 demo 用，且自带 HTTPS。

### 方案 C · Gitee Pages / 自己的服务器

`dist/site` 是纯静态产物，扔到任何能放静态文件的地方都能跑：

```bash
node tools\serve.js 8902 F:\daily\wenda\dist\site
# 或者用 nginx / Apache 指向 dist/site
```

### 方案 D · 内网/临时分享

如果只是想让同事临时看一眼，起个本地服务 + 临时公网隧道即可。
注意：本机 `localtunnel` / `ngrok` / `cloudflared` 当前均不可用（未安装或网络受限），
需要先自行安装。

---

## 四、产物说明

| 路径 | 用途 |
|---|---|
| `dist/wenda-demo.html` | **单文件 demo**，双击即开，可直接发给别人 |
| `dist/site/` | 完整静态站点：demo + 审核后台 + 多文件原型 |
| `dist/site/index.html` | 站点首页（就是单文件 demo） |
| `dist/site/admin/index.html` | 审核后台（演示模式） |
| `dist/site/prototype/` | 原型多文件版 |

重新生成：

```bash
npm run build:single   # 重新打包单文件
npm run build:site     # 重新生成静态站点
```

---

## 五、常见问题

**Q：双击 HTML 后页面是空白的？**
A：确认文件是 `dist/wenda-demo.html`（完整路径），不是 `prototype/index.html`。
后者需要 `seed.bundle.js` 等同级文件。

**Q：后台页面显示「加载种子数据失败」？**
A：不能用 `file://` 直接打开 `admin/index.html`，浏览器会拦截 fetch 请求。
必须起服务器（方式 B），或用打包后的 `dist/site`。

**Q：发布后 404？**
A：GitHub Pages 首次需要去 Settings → Pages 手动开启并选择 gh-pages 分支。

**Q：能不能让同事直接在手机上扫码体验？**
A：需要真正的微信小程序发布流程（提审），HTML demo 只能浏览器打开。
建议先用 HTML demo 验证想法，验证通过后再走小程序提审。

---

## 六、发布前的检查清单

```bash
npm run check          # 项目自检 52 项 + 数据层测试 38 项
npm run build:single   # 重新打包
```

发布前务必确认：
- [ ] `npm run check` 全绿
- [ ] 单文件 demo 双击能打开且交互正常
- [ ] 站点的 admin 页能加载数据
- [ ] 演示时用的数据是最新的（`npm run build:seed` 已跑过）
