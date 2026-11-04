/**
 * 问搭 · 样式类名静态校验
 *
 * 背景：小程序 wxml 里用了 app.wxss / 页面 wxss 没定义的 class，
 *       运行时不报错，但样式静默失效（视觉上很难发现）。
 *       这里静态比对每个 wxml 用到的 class 是否有对应定义。
 *
 * 用法：node tools/verify-styles.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

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

/** 收集一个 css 文件里定义的所有 class */
function cssClasses(css) {
  const set = new Set();
  const re = /\.([a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(css)) !== null) set.add(m[1]);
  return set;
}

/** 收集 wxml 里用到的所有 class（只取静态 class 属性里的） */
function wxmlClasses(wxml) {
  const set = new Set();
  const re = /class\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(wxml)) !== null) {
    const value = m[1];
    // 整个属性值都是模板表达式时（如 class="{{ a ? 'x' : '' }}"），
    // 静态类名为空，交给 literalClasses 处理
    if (value.indexOf('{{') > -1) {
      // 但可能混了静态类名，如 class="card {{ cond ? 'on' : '' }}"
      value
        .split('{{')[0]
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => set.add(c));
      continue;
    }
    value
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => set.add(c));
  }
  return set;
}

/**
 * 收集 class 属性里出现的字面量类名。
 * 只取三元表达式真值分支的字符串（? 'xxx'），
 * 不用取比较值（如 === 'spam' 里的 spam 那是数据，不是类名）。
 */
function literalClasses(wxml) {
  const set = new Set();
  const re = /class\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(wxml)) !== null) {
    const expr = m[1];
    // 只看 {{ }} 表达式内部
    const re2 = /\{\{([\s\S]*?)\}\}/g;
    let m2;
    while ((m2 = re2.exec(expr)) !== null) {
      const inner = m2[1];
      // 匹配 ? 'classname' 形式（真值分支）
      const re3 = /\?\s*['"]([a-z][a-z0-9-]{0,15})['"]/g;
      let m3;
      while ((m3 = re3.exec(inner)) !== null) set.add(m3[1]);
      // 匹配 : 'classname' 形式（假值分支也可能是类名）
      const re4 = /:\s*['"]([a-z][a-z0-9-]{0,15})['"]/g;
      while ((m3 = re4.exec(inner)) !== null) set.add(m3[1]);
    }
  }
  return set;
}

function readCss(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

console.log('\n=== 问搭 · 样式类名静态校验 ===\n');

// 全局样式里定义的类
const appCss = readCss(path.join(MP, 'app.wxss'));
const globalClasses = cssClasses(appCss);
console.log(`app.wxss 定义了 ${globalClasses.size} 个类\n`);

// 逐个页面校验
const pagesDir = path.join(MP, 'pages');
const pages = fs.readdirSync(pagesDir).filter((d) => fs.statSync(path.join(pagesDir, d)).isDirectory());

pages.forEach((page) => {
  const wxmlPath = path.join(pagesDir, page, page + '.wxml');
  const wxssPath = path.join(pagesDir, page, page + '.wxss');
  if (!fs.existsSync(wxmlPath)) return;

  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const localClasses = cssClasses(readCss(wxssPath));
  const used = wxmlClasses(wxml);
  const literals = literalClasses(wxml);

  // 小程序内置组件自带的类，不需要我们定义
  const builtin = new Set([
    'button', 'view', 'text', 'image', 'scroll-view', 'input', 'textarea', 'switch',
    'picker', 'checkbox', 'radio', 'form', 'label', 'navigator', 'block', 'icon',
    'rich-text', 'progress', 'slider', 'swiper', 'movable-view', 'cover-view',
    'page', 'body', 'app', 'title', 'content', 'placeholder', 'loading', 'active',
  ]);

  const missing = [...used, ...literals].filter(
    (c) => !globalClasses.has(c) && !localClasses.has(c) && !builtin.has(c)
  );

  check(
    `${page}.wxml 的 class 都有定义`,
    missing.length === 0,
    missing.length ? `缺失: ${[...new Set(missing)].join(', ')}` : ''
  );
});

// 组件校验
console.log('');
const compDir = path.join(MP, 'components');
fs.readdirSync(compDir).forEach((comp) => {
  const wxmlPath = path.join(compDir, comp, comp + '.wxml');
  if (!fs.existsSync(wxmlPath)) return;
  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const localClasses = cssClasses(readCss(path.join(compDir, comp, comp + '.wxss')));
  const used = wxmlClasses(wxml);
  const literals = literalClasses(wxml);
  const builtin = new Set(['button', 'view', 'text', 'image', 'block', 'scroll-view']);
  const missing = [...used, ...literals].filter(
    (c) => !globalClasses.has(c) && !localClasses.has(c) && !builtin.has(c)
  );
  check(
    `组件 ${comp} 的 class 都有定义`,
    missing.length === 0,
    missing.length ? `缺失: ${[...new Set(missing)].join(', ')}` : ''
  );
});

// ---------- 结果 ----------
console.log('\n=== 结果 ===');
console.log(`通过: ${pass}  失败: ${fail}`);
if (fail) {
  console.log('\n❌ 存在未定义的样式类\n');
  process.exit(1);
}
console.log('\n✅ 样式类名全部有定义\n');
