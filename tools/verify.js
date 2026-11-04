/**
 * 问搭 · 全量自检
 * 用法：node tools/verify.js
 *
 * 检查项：
 *   1. 所有 JSON 文件合法
 *   2. 所有 JS 文件语法正确
 *   3. 种子数据完整性（引用一致、无孤立数据）
 *   4. 小程序页面/组件文件齐全
 *   5. app.json 引用路径存在
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let errors = [];
let warnings = [];
let checks = 0;

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function ok(msg) { checks++; console.log('  ✅ ' + msg); }

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (['node_modules', '.git', '.cowork-temp'].includes(name)) continue;
      walk(full, filter, out);
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

console.log('\n=== 问搭 · 项目自检 ===\n');

// ---------- 1. JSON 合法性 ----------
console.log('【1】JSON 合法性');
const jsonFiles = walk(ROOT, (f) => f.endsWith('.json'));
jsonFiles.forEach((f) => {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
    checks++;
  } catch (e) {
    err(`JSON 解析失败 ${path.relative(ROOT, f)}: ${e.message}`);
  }
});
ok(`${jsonFiles.length} 个 JSON 文件全部合法`);

// ---------- 2. JS 语法 ----------
console.log('\n【2】JavaScript 语法');
const jsFiles = walk(ROOT, (f) => f.endsWith('.js'));
jsFiles.forEach((f) => {
  const code = fs.readFileSync(f, 'utf8');
  try {
    new vm.Script(code, { filename: f });
    checks++;
  } catch (e) {
    err(`语法错误 ${path.relative(ROOT, f)}: ${e.message}`);
  }
});
ok(`${jsFiles.length} 个 JS 文件语法全部正确`);

// ---------- 3. 种子数据完整性 ----------
console.log('\n【3】种子数据完整性');
const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'seed.bundle.json'), 'utf8'));
const qIds = new Set(bundle.questions.map((q) => q._id));
const uIds = new Set(bundle.users.map((u) => u._id));

// 3.1 回答指向的问题必须存在
bundle.answers.forEach((a) => {
  if (!qIds.has(a.questionId)) err(`回答 ${a._id} 指向不存在的问题 ${a.questionId}`);
});
checks++;

// 3.2 采纳标记双向一致
bundle.questions.forEach((q) => {
  const adopted = bundle.answers.filter((a) => a.questionId === q._id && a.adopted);
  if (q.adopted && adopted.length !== 1) {
    err(`问题 ${q._id} 标记为已采纳，但有 ${adopted.length} 条已采纳回答（应为 1）`);
  }
  if (q.adopted && q.adoptedAnswerId && !bundle.answers.some((a) => a._id === q.adoptedAnswerId)) {
    err(`问题 ${q._id} 的 adoptedAnswerId 指向不存在的回答`);
  }
  if (!q.adopted && adopted.length) {
    err(`问题 ${q._id} 未标记采纳，但存在已采纳回答`);
  }
});
checks++;

// 3.3 回答者必须存在于 users
bundle.answers.forEach((a) => {
  if (!uIds.has(a.author._id)) err(`回答 ${a._id} 的作者 ${a.author._id} 不在 users 中`);
});
checks++;

// 3.4 昵称唯一性
const nameMap = {};
bundle.users.forEach((u) => { nameMap[u.nickname] = (nameMap[u.nickname] || 0) + 1; });
const dupNames = Object.entries(nameMap).filter(([, n]) => n > 1);
if (dupNames.length) err(`存在重名用户: ${dupNames.map(([k]) => k).join(', ')}`);
else ok(`${bundle.users.length} 位用户昵称唯一`);

// 3.5 totalVotes 与 options 实际票数一致
bundle.questions.forEach((q) => {
  const sum = (q.options || []).reduce((s, o) => s + (o.votes || 0), 0);
  if (sum !== (q.totalVotes || 0)) {
    err(`问题 ${q._id} 的 totalVotes(${q.totalVotes}) 与选项票数之和(${sum}) 不一致`);
  }
});
checks++;

// 3.6 answerCount 与实际回答数一致
bundle.questions.forEach((q) => {
  const n = bundle.answers.filter((a) => a.questionId === q._id).length;
  if (n !== (q.answerCount || 0)) {
    err(`问题 ${q._id} 的 answerCount(${q.answerCount}) 与实际回答数(${n}) 不一致`);
  }
});
checks++;

// 3.7 分类覆盖
const CATS = ['eat', 'wear', 'play', 'kid', 'gift', 'buy'];
CATS.forEach((c) => {
  const n = bundle.questions.filter((q) => q.cat === c).length;
  if (n < 10) warn(`分类 ${c} 只有 ${n} 条，建议每个分类至少 15 条`);
});
const badCat = bundle.questions.filter((q) => !CATS.includes(q.cat));
if (badCat.length) err(`存在非法分类: ${[...new Set(badCat.map((q) => q.cat))].join(', ')}`);
ok(`分类分布: ${CATS.map((c) => `${c}=${bundle.questions.filter((q) => q.cat === c).length}`).join(' ')}`);

// 3.8 状态分布
const byStatus = bundle.questions.reduce((acc, q) => {
  acc[q.status] = (acc[q.status] || 0) + 1;
  return acc;
}, {});
ok(`状态分布: ${JSON.stringify(byStatus)}`);
if ((byStatus.pending || 0) < 20) warn('待回答问题太少，广场会显得过于「已解决」');

// 3.9 空选项检查
bundle.questions.forEach((q) => {
  (q.options || []).forEach((o) => {
    if (!o.text || !String(o.text).trim()) err(`问题 ${q._id} 存在空选项`);
  });
  if (!q.title || !String(q.title).trim()) err(`问题 ${q._id} 标题为空`);
  if (!q.answers || true) { /* noop */ }
});
checks++;

// ---------- 4. 小程序文件齐全 ----------
console.log('\n【4】小程序结构');
const mp = path.join(ROOT, 'miniprogram');
const appJson = JSON.parse(fs.readFileSync(path.join(mp, 'app.json'), 'utf8'));

appJson.pages.forEach((p) => {
  ['.js', '.wxml', '.json', '.wxss'].forEach((ext) => {
    const f = path.join(mp, p + ext);
    if (!fs.existsSync(f)) err(`页面缺少文件: ${p}${ext}`);
  });
});
ok(`${appJson.pages.length} 个页面文件齐全`);

// tabBar 图标
appJson.tabBar.list.forEach((t) => {
  [t.iconPath, t.selectedIconPath].forEach((icon) => {
    const f = path.join(mp, icon);
    if (!fs.existsSync(f)) err(`tabBar 图标缺失: ${icon}`);
  });
});
ok('tabBar 图标齐全');

// 组件
const compDir = path.join(mp, 'components');
if (fs.existsSync(compDir)) {
  fs.readdirSync(compDir).forEach((c) => {
    ['.js', '.wxml', '.json'].forEach((ext) => {
      const f = path.join(compDir, c, 'question-card' + ext);
      if (!fs.existsSync(f)) err(`组件缺少文件: ${c}${ext}`);
    });
  });
  ok('组件文件齐全');
}

// 云函数
['qa', 'seed'].forEach((fn) => {
  const dir = path.join(mp, 'cloudfunctions', fn);
  ['index.js', 'package.json'].forEach((f) => {
    if (!fs.existsSync(path.join(dir, f))) err(`云函数 ${fn} 缺少 ${f}`);
  });
});
ok('云函数结构完整');

// seed 云函数必须打包种子数据
if (!fs.existsSync(path.join(mp, 'cloudfunctions', 'seed', 'seed.bundle.json'))) {
  err('云函数 seed 未打包 seed.bundle.json，部署后会导入失败');
} else {
  ok('seed 云函数已打包种子数据');
}

// ---------- 4.5 新功能：路由与接口契约 ----------
console.log('\n【4.5】功能契约一致性');

// 页面跳转地址必须都已注册
const pageRoutes = new Set(appJson.pages.map((p) => '/' + p));
const allPageSrc = walk(mp, (f) => f.endsWith('.js'));
let routeCount = 0;
allPageSrc.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  const re = /(?:navigateTo|switchTab|redirectTo)\(\{\s*url:\s*[`'"](\/[^`'"]*)[`'"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const target = m[1].split('?')[0];
    routeCount++;
    if (!pageRoutes.has(target)) {
      err(`${path.relative(ROOT, f)} 跳转到未注册页面: ${target}`);
    }
  }
});
ok(`${routeCount} 处页面跳转目标均已注册`);

// api.js 暴露的方法，页面里调用时不能写错
const apiLayerSrc = fs.readFileSync(path.join(mp, 'services', 'api.js'), 'utf8');
const apiExports = new Set(
  (apiLayerSrc.match(/^\s{2}([a-zA-Z]+)\s*\(/gm) || []).map((s) => s.trim().replace('(', ''))
);
const requiredApi = [
  'listQuestions', 'getQuestion', 'vote', 'addAnswer', 'createQuestion',
  'adopt', 'like', 'mine', 'toggleFavorite', 'searchQuestions',
  'report', 'myFavorites', 'myDecisions', 'getSettings', 'saveSettings',
];
requiredApi.forEach((m) => {
  if (!apiExports.has(m)) err(`api.js 缺少对外方法: ${m}`);
});
ok(`api.js 对外方法齐全 (${requiredApi.length} 个)`);

// 页面里调用的 api.xxx 必须存在
// 页面里常见链式写法 api\n  .method()，所以允许中间有换行与空白
let apiCallCount = 0;
allPageSrc.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  const re = /\bapi\s*\.\s*([a-zA-Z]+)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    apiCallCount++;
    if (!apiExports.has(m[1])) {
      err(`${path.relative(ROOT, f)} 调用了不存在的 api.${m[1]}()`);
    }
  }
});
ok(`${apiCallCount} 处 api 调用均有对应实现`);

// 云函数必须有对应的 handler（mock 与云端契约一致）
const qaSrc = fs.readFileSync(path.join(mp, 'cloudfunctions', 'qa', 'index.js'), 'utf8');
const handlerNames = new Set(
  (qaSrc.match(/async ([a-zA-Z]+)\(event, openid\)/g) || []).map((s) =>
    s.replace('async ', '').replace('(event, openid)', '')
  )
);
const cloudActions = [
  'listQuestions', 'getQuestion', 'vote', 'addAnswer', 'createQuestion',
  'adopt', 'like', 'mine', 'report', 'toggleFavorite', 'searchQuestions',
  'myFavorites', 'myDecisions', 'getSettings', 'saveSettings',
];
cloudActions.forEach((a) => {
  if (!handlerNames.has(a)) err(`云函数 qa 缺少 handler: ${a}`);
});
ok(`云函数 handler 齐全 (${cloudActions.length} 个)`);

// 「我的」页不能有占位菜单
// （合法防御：toast 兜底分支允许，但不能再出现 'V2 规划中' 这种未实现标记）
const mineSrc = fs.readFileSync(path.join(mp, 'pages', 'mine', 'mine.js'), 'utf8');
if (/V2 规划中/.test(mineSrc)) {
  err('「我的」页仍有占位菜单（V2 规划中）');
} else {
  ok('「我的」页无占位菜单');
}

// 「我的」页的每个菜单项都必须有对应跳转
const mineWxml = fs.readFileSync(path.join(mp, 'pages', 'mine', 'mine.wxml'), 'utf8');
const menuNames = [...mineWxml.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1]);
menuNames.forEach((n) => {
  // 菜单名可能以对象键形式出现（`我的收藏: '/path'`）或直接比较（`=== '我的收藏'`）
  const hasRoute =
    mineSrc.indexOf(`${n}: '/`) > -1 || mineSrc.indexOf(`'${n}'`) > -1;
  if (!hasRoute) err(`「我的」页菜单「${n}」没有对应跳转`);
});
ok(`${menuNames.length} 个菜单项均有跳转`);

// data-tab 绑定的 tab 必须有对应处理分支
// tab 值通过 data-tab 传入，onTab 统一处理；检查各 tab 在 wxml 里都有对应区块
const tabNames = [...new Set([...mineWxml.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]))];
tabNames.forEach((t) => {
  if (mineSrc.indexOf('onTab') === -1) {
    err('「我的」页使用 data-tab 但没有 onTab 处理函数');
  }
  // wxml 里应有 tab === 'xxx' 的条件渲染
  if (mineWxml.indexOf(`tab === '${t}'`) === -1) {
    err(`「我的」页 tab「${t}」没有对应的内容区块`);
  }
});
ok(`${tabNames.size} 个 tab 均有内容区块`);

// 新页面的 wxml 不能有未处理的空态
// （settings 是固定设置列表，不需要空态；其余都是内容列表，必须处理）
['search', 'favorites', 'review'].forEach((p) => {
  const wxml = fs.readFileSync(path.join(mp, 'pages', p, p + '.wxml'), 'utf8');
  if (!/empty/.test(wxml)) err(`页面 ${p} 缺少空态处理`);
});
ok('列表型新页面均有空态处理');

// ---------- 4.6 审核后台举报闭环 ----------
console.log('\n【4.6】审核后台举报闭环');
const qaHandlerSrc = fs.readFileSync(path.join(mp, 'cloudfunctions', 'qa', 'index.js'), 'utf8');
['adminReports', 'adminHandleReport'].forEach((h) => {
  if (qaHandlerSrc.indexOf('async ' + h + '(') === -1) {
    err(`云函数 qa 缺少举报处理 handler: ${h}`);
  }
});
ok('云函数支持举报查询与处理');

const adminActionMatch = qaHandlerSrc.match(/const adminActions = \[([\s\S]*?)\]/);
if (!adminActionMatch) {
  err('云函数 qa 缺少 adminActions 白名单');
} else {
  ['adminReports', 'adminHandleReport'].forEach((a) => {
    if (adminActionMatch[1].indexOf("'" + a + "'") === -1) {
      err(`adminActions 白名单缺少: ${a}`);
    }
  });
  ok('adminActions 白名单已包含举报相关 action');
}

const adminHtmlPath = path.join(ROOT, 'admin', 'index.html');
if (!fs.existsSync(adminHtmlPath)) {
  err('缺少 admin/index.html');
} else {
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  const adminJs = fs.readFileSync(path.join(ROOT, 'admin', 'admin.js'), 'utf8');
  if (adminHtml.indexOf('view-reports') === -1) err('审核后台缺少举报处理视图');
  if (adminJs.indexOf('adminHandleReport') === -1) err('审核后台 JS 未调用举报处理接口');
  if (adminJs.indexOf('adminReports') === -1) err('审核后台 JS 未调用举报列表接口');
  if (adminHtml.indexOf('reportRows') === -1) err('审核后台缺少举报表格');
  ok('审核后台已接入举报查询与处理');
}

const detailWxml2 = fs.readFileSync(path.join(mp, 'pages', 'detail', 'detail.wxml'), 'utf8');
if (!/data-type="answer"/.test(detailWxml2)) {
  err('详情页缺少回答的举报入口');
}
if (!/data-type="question"/.test(detailWxml2)) {
  err('详情页缺少问题的举报入口');
}
ok('问题与回答均有举报入口');

// ---------- 5. 数据层引用 ----------
console.log('\n【5】数据层引用');
const apiSrc = fs.readFileSync(path.join(mp, 'services', 'api.js'), 'utf8');
// 注意：小程序运行时不支持 require('*.json')，必须是 .js 模块
if (!fs.existsSync(path.join(mp, 'data', 'seed.js'))) {
  err('miniprogram/data/seed.js 缺失，mock 模式无法工作（请运行 node seed/build-seed.js）');
} else {
  ok('mock 数据文件存在 (seed.js)');
}
if (!apiSrc.includes("require('../data/seed.js')")) {
  err('api.js 未正确引用 seed.js（应为 require(\'../data/seed.js\')）');
} else {
  ok('api.js 正确引用 seed.js');
}
// 小程序不支持 require json，防止回退
if (/require\(['"][^'"]*\.json['"]\)/.test(apiSrc)) {
  err('api.js 中存在 require(\'*.json\')，小程序运行时不支持');
}
const mockSeed = JSON.parse(fs.readFileSync(path.join(mp, 'data', 'seed.js'), 'utf8').replace(/^[\s\S]*?module\.exports\s*=\s*/, '').replace(/;\s*$/, ''));
if (mockSeed.questions.length !== bundle.questions.length) {
  err('mock 数据与 seed.bundle 不一致，请重新运行 node seed/build-seed.js');
} else {
  ok('mock 数据与种子包一致');
}

// 原型数据
const protoSeedPath = path.join(ROOT, 'prototype', 'seed.bundle.js');
if (!fs.existsSync(protoSeedPath)) {
  err('prototype/seed.bundle.js 缺失，请重新运行 node seed/build-seed.js');
} else {
  const protoSrc = fs.readFileSync(protoSeedPath, 'utf8');
  if (protoSrc.includes('window.SEED_BUNDLE')) ok('原型数据文件正确');
  else err('prototype/seed.bundle.js 格式异常');
}

// ---------- 6. 埋点完整性 ----------
console.log('\n【6】事件埋点');
const trackerPath = path.join(mp, 'services', 'tracker.js');
if (!fs.existsSync(trackerPath)) {
  err('services/tracker.js 缺失，埋点模块不存在');
} else {
  ok('埋点模块存在');
  const trackerSrc = fs.readFileSync(trackerPath, 'utf8');
  // 事件名常量必须覆盖 METRICS.md 定义的全部事件
  const REQUIRED_EVENTS = [
    'APP_OPEN',
    'LIST_VIEW',
    'DETAIL_VIEW',
    'QUESTION_PUBLISH',
    'OPTION_VOTE',
    'ANSWER_PUBLISH',
    'ANSWER_LIKE',
    'ANSWER_ADOPT',
    'SHARE_CLICK',
    'SHARE_ENTER',
  ];
  const missingEvents = REQUIRED_EVENTS.filter((e) => !trackerSrc.includes(`${e}:`));
  if (missingEvents.length) err('埋点缺少事件常量: ' + missingEvents.join(', '));
  else ok(`${REQUIRED_EVENTS.length} 个事件常量齐全`);

  // 云函数必须有 track action
  const qaSrc = fs.readFileSync(path.join(mp, 'cloudfunctions', 'qa', 'index.js'), 'utf8');
  if (!/async track\(/.test(qaSrc)) err('云函数 qa 缺少 track action，埋点无处落地');
  else ok('云函数 qa 已支持 track action');

  if (!qaSrc.includes("const EVENT = 'events'")) err('云函数 qa 未定义 events 集合');
  else ok('events 集合已定义');

  // 每个页面都应接入埋点
  const pageDirs = ['index', 'detail', 'ask', 'mine'];
  const noTrack = [];
  pageDirs.forEach((p) => {
    const src = fs.readFileSync(path.join(mp, 'pages', p, `${p}.js`), 'utf8');
    if (!src.includes('tracker.track(')) noTrack.push(p);
  });
  if (noTrack.length) err('以下页面未接入埋点: ' + noTrack.join(', '));
  else ok('4 个页面均已接入埋点');
}

// ---------- 汇总 ----------
console.log('\n=== 结果 ===');
console.log(`通过检查项: ${checks}`);
if (warnings.length) {
  console.log(`\n⚠️  警告 (${warnings.length}):`);
  warnings.forEach((w) => console.log('  - ' + w));
}
if (errors.length) {
  console.log(`\n❌ 错误 (${errors.length}):`);
  errors.forEach((e) => console.log('  - ' + e));
  process.exit(1);
}
console.log('\n✅ 全部检查通过\n');
