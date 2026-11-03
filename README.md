# 问搭 · 把选择困难交给别人

> 微信小程序 · 生活决策问答

**在线体验** → https://xiaoyudian001.github.io/wenda/

「今天吃什么」「明天穿什么」「周末去哪玩」「孩子不听话怎么办」——
这些问题每天都困扰着所有人。问搭把它们交给别人来回答。

---

## 目录结构

```
wenda/
├── seed/                       种子内容包（冷启动核心资产）
│   ├── questions.src.txt       已采纳问题源文件（可编辑）
│   ├── answers2.src.txt        补充回答源文件
│   ├── pending.src.txt         待回答问题源文件
│   ├── build-seed.js           编译器：源文件 → JSON
│   ├── questions.json          生成物
│   ├── answers.json            生成物
│   ├── users.json              生成物
│   ├── index.json              汇总清单
│   └── seed.bundle.json        全量包（云函数导入用）
│
├── prototype/                  可点击 HTML 原型
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── seed.bundle.js          自动生成
│
├── miniprogram/                微信小程序（原生 + 云开发）
│   ├── app.js / app.json / app.wxss
│   ├── project.config.json
│   ├── pages/
│   │   ├── index/              广场（问题流）
│   │   ├── detail/             问题详情（投票/回答/采纳）
│   │   ├── ask/                提问
│   │   └── mine/               我的
│   ├── components/
│   │   └── question-card/      问题卡片组件
│   ├── services/
│   │   └── api.js              数据层（云函数 + 本地 mock 自动降级）
│   ├── utils/index.js          工具函数
│   ├── data/seed.json          mock 用的种子数据
│   ├── assets/                 tabBar 图标（脚本生成）
│   └── cloudfunctions/
│       ├── qa/                 核心业务云函数
│       └── seed/               种子数据导入云函数
│
├── admin/                      审核后台（静态页）
│   ├── index.html
│   ├── admin.js
│   └── admin.css
│
├── tools/
│   ├── serve.js                本地静态服务器
│   ├── make-icons.js           tabBar 图标生成器
│   ├── build-single.js         打包单文件 demo
│   ├── build-site.js           生成静态站点
│   ├── publish-github.js       一键发布 GitHub Pages
│   ├── verify.js               项目自检
│   └── test-api.js             数据层端到端测试
│
├── dist/                       构建产物
│   ├── wenda-demo.html         单文件 demo（双击即开）
│   └── site/                   静态站点（可部署）
│
└── docs/
    ├── PRD.md                  产品需求文档
    ├── DATA-MODEL.md           数据模型与云开发集合设计
    ├── METRICS.md              验证指标与节奏
    └── COLD-START.md          冷启动作战手册
```

---

## 快速开始

### 0. 最快：双击打开单文件 demo（零依赖）

```
F:\daily\wenda\dist\wenda-demo.html
```

所有 CSS / JS / 数据内联在一个 HTML 里，双击即开，无需服务器。发给任何人都能直接看。
详细说明见 [部署文档](docs/DEPLOY.md)。

### 1. 看原型（开发时）

```bash
node tools/serve.js 8899
# 浏览器打开 http://127.0.0.1:8899/index.html
```

原型是完整可交互的：浏览广场 → 筛选分类 → 点开详情 → 投票 → 点赞 → 提交回答 → 发布问题 → 分享。

### 2. 跑小程序

用**微信开发者工具**打开 `miniprogram/` 目录。

- `project.config.json` 里的 `appid` 目前是 `touristappid`（游客模式），可直接预览。
- **不配云开发也能跑**：数据层会自动降级到本地 mock，内置 147 条真实种子数据，所有交互（提问/回答/投票/采纳）都能完整走通。
- 「我的」页底部有「重置本地演示数据」，可随时恢复初始状态。

### 3. 接云开发（可选）

1. 在开发者工具里开通云开发环境，把 `appid` 换成你自己的。
2. 右键 `cloudfunctions/qa` → 上传并部署：云端安装依赖。
3. 右键 `cloudfunctions/seed` → 上传并部署（需带 `seed.bundle.json`）。
4. 创建 5 个集合：`questions`、`answers`、`users`、`votes`、`reports`。
5. 调用 seed 函数导入数据：

```javascript
wx.cloud.callFunction({
  name: 'seed',
  data: { action: 'import' },
  success: console.log,
});
```

### 4. 改内容

内容是这个产品的命门。编辑 `seed/*.src.txt` 后重新编译：

```bash
node seed/build-seed.js
```

会同时更新：`seed/*.json`、`prototype/seed.bundle.js`、`miniprogram/data/seed.json`。

源文件格式（`|` 分隔）：

```
cat|title|desc|options^options|answerer|answerContent|answerOption|city
eat|今天中午吃什么|预算30以内|川渝小面^黄焖鸡^沙县|吃货小陈|楼下的沙县比黄焖鸡强|沙县|北京
```

分类：`eat` 吃什么 / `wear` 穿什么 / `play` 去哪玩 / `kid` 带孩子 / `gift` 送什么 / `buy` 买不买

### 5. 审核后台

```bash
node tools/serve.js 8900 F:\daily\wenda
# 打开 http://127.0.0.1:8900/admin/index.html
```

默认「演示模式」读本地种子数据。接线上接口：`index.html?api=https://你的云函数HTTP地址`。

---

## 常用命令

```bash
npm run build:seed   # 重建种子数据（改完 *.src.txt 后跑）
npm run build:single # 打包单文件 demo → dist/wenda-demo.html
npm run build:site   # 生成静态站点 → dist/site/
npm run icons        # 重新生成 tabBar 图标
npm run verify       # 项目自检（JSON/JS/数据一致性/结构）
npm run test         # 数据层端到端测试（38 项）
npm run check        # 自检 + 测试
npm run serve        # 原型预览 http://127.0.0.1:8899
npm run serve:admin  # 后台预览 http://127.0.0.1:8900/admin/index.html
npm run serve:site   # 站点预览 http://127.0.0.1:8902
npm run publish:gh -- <owner> <repo>   # 一键发布到 GitHub Pages
```

---

## 核心设计决策

**问题必须带选项。** 开放式问题「今天吃什么」很难回答；封闭式「A / B / C」只要点一下就能回答。
带选项的问题平均能多拿 3 倍回答——这是首答率的关键杠杆。

**选项可匿名，回答留昵称。** 提问者选择「匿名」时别人看不到他，回答者则保留昵称获得反馈。

**短答案 + 采纳机制。** 不做长讨论。每条回答给一个推荐选项，提问者一键采纳，形成闭环。

**热度排序让新问题也有曝光。** `heat = 票数×3 + 回答数×6 + 20 + 时间衰减`，待回答问题额外 +12。

**数据层自动降级。** 云函数不可用时切本地 mock，产品永远可演示、可演示给投资人看。

---

## 文档

- [产品需求文档](docs/PRD.md)
- [数据模型](docs/DATA-MODEL.md)
- [验证指标](docs/METRICS.md)
- [冷启动手册](docs/COLD-START.md)
- [本地运行与发布](docs/DEPLOY.md)

---

## 下一步

代码只占这个项目的一半。真正的风险在冷启动：

1. 先把[原型](prototype/)发到 50 人微信群，测「有多少人会真的点进去回答」——转化率 <10% 就别写代码了。
2. 上线前备好 200+ 条种子内容（当前 147 条，可继续补充）。
3. 每天人工投喂 1 个「今日一题」，2 小时内给出高质量回答，营造「真有人在答」的感知。

详见 [冷启动手册](docs/COLD-START.md)。

---

## 当前完成度

| 模块 | 状态 | 验证方式 |
|---|---|---|
| 种子内容包 | ✅ 147 问题 / 160 回答 / 115 用户 | `npm run verify` 数据一致性检查 |
| HTML 原型 | ✅ 四页面全流程可交互 | 浏览器实测：147 卡片渲染、空状态、投票、采纳 |
| 小程序前端 | ✅ 4 页面 + 组件 + 数据层 | `npm run test` 38 项断言全部通过 |
| 云函数 | ✅ qa 11 个 action + seed 导入 | 语法检查通过，待真实环境部署 |
| 审核后台 | ✅ 看板/筛选/隐藏恢复 | 浏览器实测通过 |
| 文档 | ✅ PRD / 数据模型 / 指标 / 冷启动 | — |

**未做（有意留白）**：事件埋点、V2 的位置与评论、支付与商业化、真实云环境部署验证。
