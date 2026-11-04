// 页面注册与组件引用一致性检查
const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');
const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    console.log('  ❌ ' + name + (extra ? ' → ' + extra : ''));
  }
}

console.log('\n=== 页面与组件注册一致性 ===\n');

// 1. pages 里每个页面四个文件都要齐
app.pages.forEach((p) => {
  const missing = ['.js', '.wxml', '.json', '.wxss'].filter((ext) => !fs.existsSync(path.join(MP, p + ext)));
  check(`${p} 四个文件齐全`, missing.length === 0, missing.join(','));
});

// 2. 实际目录里不能有未注册的页面
const actualDirs = fs.readdirSync(path.join(MP, 'pages')).filter((d) =>
  fs.statSync(path.join(MP, 'pages', d)).isDirectory()
);
const declared = new Set(app.pages.map((p) => p.split('/')[1]));
const unregistered = actualDirs.filter((d) => !declared.has(d));
check('没有未注册的页面目录', unregistered.length === 0, unregistered.join(', '));

// 3. 指向不存在目录的页面
const ghost = app.pages.filter((p) => !actualDirs.includes(p.split('/')[1]));
check('没有指向不存在目录的页面', ghost.length === 0, ghost.join(', '));

// 4. 组件引用必须存在
let componentErrors = [];
app.pages.forEach((p) => {
  const jsonPath = path.join(MP, p + '.json');
  if (!fs.existsSync(jsonPath)) return;
  const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  Object.entries(j.usingComponents || {}).forEach(([name, target]) => {
    // 组件路径以 / 开头表示相对 miniprogram 根目录
    const rel = target.startsWith('/') ? target.slice(1) : path.join('..', target);
    const abs = path.join(MP, rel);
    // 引用通常省略 .js 后缀
    const exists =
      fs.existsSync(abs) ||
      fs.existsSync(abs + '.js') ||
      fs.existsSync(path.join(abs, 'index.js'));
    if (!exists) {
      componentErrors.push(`${p} 的组件 ${name} → ${target}`);
    }
  });
});
check('组件引用全部存在', componentErrors.length === 0, componentErrors.join('; '));

// 5. wxml 里 bindtap / catchtap 绑定的方法必须在对应 js 里定义
let handlerErrors = [];
app.pages.forEach((p) => {
  const wxmlPath = path.join(MP, p + '.wxml');
  const jsPath = path.join(MP, p + '.js');
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) return;
  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const handlers = new Set();
  const re = /(?:bind|catch)(?:tap|input|change|confirm|submit|longpress|scrolltolower|reachbottom|load|blur|focus)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(wxml)) !== null) handlers.add(m[1]);
  handlers.forEach((h) => {
    // 方法名可能是 a.b 或直接名字
    const name = h.split('.').pop();
    const defined = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(').test(js);
    if (!defined) handlerErrors.push(`${p} 的 ${h}`);
  });
});
check('wxml 事件绑定都有对应方法', handlerErrors.length === 0, handlerErrors.join('; '));

// 6. wxml 里引用的页面路径必须已注册
let routeErrors = [];
app.pages.forEach((p) => {
  const jsPath = path.join(MP, p + '.js');
  if (!fs.existsSync(jsPath)) return;
  const js = fs.readFileSync(jsPath, 'utf8');
  const re = /(?:navigateTo|redirectTo|switchTab)\(\{\s*url:\s*[`'"](\/[^`'"]*)[`'"]/g;
  let m;
  while ((m = re.exec(js)) !== null) {
    const target = m[1].split('?')[0];
    // target 形如 /pages/detail/detail，取第二段作为页面名
    const segs = target.split('/').filter(Boolean);
    const pageName = segs[1];
    if (!pageName || !declared.has(pageName)) routeErrors.push(`${p} → ${target}`);
  }
});
check('跳转目标都已注册', routeErrors.length === 0, routeErrors.join('; '));

console.log('\n=== 结果 ===');
console.log(`通过: ${pass}  失败: ${fail}`);
if (fail) {
  console.log('\n❌ 存在失败项\n');
  process.exit(1);
}
console.log('\n✅ 页面与组件注册一致\n');
