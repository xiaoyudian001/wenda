#!/usr/bin/env node
/**
 * 问搭 · 微信开发者工具安装后检查
 *
 * 用法：node tools/check-devtools.js
 *
 * 检查项：
 *   1. 是否已安装微信开发者工具（常见安装路径）
 *   2. cli.bat 是否存在（用于命令行打开项目）
 *   3. 项目 appid 是否还是游客模式
 *   4. 小程序项目结构是否完整（能否被工具导入）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

const CANDIDATES = [
  // 实际安装位置（新版安装器默认装到用户目录）
  path.join(process.env.LOCALAPPDATA || '', 'Programs', '微信开发者工具'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', '微信web开发者工具'),
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具',
  'C:\\Program Files\\Tencent\\微信web开发者工具',
  'C:\\Program Files (x86)\\微信web开发者工具',
  'C:\\Program Files\\微信开发者工具',
  // User Data 目录（只有数据时存在，不是安装目录）
  path.join(process.env.LOCALAPPDATA || '', '微信开发者工具'),
];

function findDevtools() {
  // 优先找含 cli.bat 的目录 —— 那才是真正的安装目录
  for (const c of CANDIDATES) {
    try {
      if (!fs.existsSync(c)) continue;
      if (fs.existsSync(path.join(c, 'cli.bat'))) return c;
    } catch (e) { /* ignore */ }
  }
  // 再退而求其次：任意存在的候选目录
  for (const c of CANDIDATES) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) { /* ignore */ }
  }
  // 兜底：在常见父目录里扫
  const roots = [
    'C:\\Program Files (x86)\\Tencent',
    'C:\\Program Files\\Tencent',
    path.join(process.env.LOCALAPPDATA || '', 'Programs'),
    process.env.LOCALAPPDATA || '',
  ];
  for (const r of roots) {
    try {
      if (!fs.existsSync(r)) continue;
      for (const name of fs.readdirSync(r)) {
        if (/微信.*(开发者工具|web开发者工具)/i.test(name)) {
          return path.join(r, name);
        }
      }
    } catch (e) { /* ignore */ }
  }
  return null;
}

let pass = 0;
let fail = 0;
const warn = [];
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    console.log('  ❌ ' + name + (extra ? ' → ' + extra : ''));
  }
}

console.log('\n=== 问搭 · 微信开发者工具环境检查 ===\n');

console.log('【1】安装状态');
const dir = findDevtools();
check('已找到微信开发者工具安装目录', !!dir, dir || '未找到');
if (dir) {
  console.log('     路径: ' + dir);
  const cli = ['cli.bat', 'cli.exe'].map((f) => path.join(dir, f)).find((p) => fs.existsSync(p));
  check('命令行入口 cli 存在', !!cli, cli || '未找到（不影响使用，仅影响命令行打开项目）');
  if (cli) console.log('     CLI: ' + cli);
}

console.log('\n【2】小程序项目');
const appJsonPath = path.join(MP, 'app.json');
check('app.json 存在', fs.existsSync(appJsonPath));
if (fs.existsSync(appJsonPath)) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  check('页面配置非空', (appJson.pages || []).length > 0);
  console.log('     页面: ' + (appJson.pages || []).join(', '));
  const missing = [];
  (appJson.pages || []).forEach((p) => {
    ['.js', '.wxml', '.json'].forEach((ext) => {
      if (!fs.existsSync(path.join(MP, p + ext))) missing.push(p + ext);
    });
  });
  check('所有页面文件齐全', missing.length === 0, missing.join(', '));

  const tabIcons = (appJson.tabBar && appJson.tabBar.list) || [];
  const iconMissing = [];
  tabIcons.forEach((t) => {
    [t.iconPath, t.selectedIconPath].forEach((i) => {
      if (i && !fs.existsSync(path.join(MP, i))) iconMissing.push(i);
    });
  });
  check('tabBar 图标齐全', iconMissing.length === 0, iconMissing.join(', '));
}

console.log('\n【3】appid 状态');
const cfgPath = path.join(MP, 'project.config.json');
if (fs.existsSync(cfgPath)) {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const isTourist = cfg.appid === 'touristappid';
  console.log('     当前 appid: ' + cfg.appid);
  if (isTourist) {
    warn.push('appid 仍是 touristappid（游客模式）：可以预览模拟器，但不能上传发布。');
    console.log('     ⚠️ 游客模式：模拟器可正常跑，但无法上传/发布');
    console.log('        换成真实 appid 后即可提审发布');
  } else {
    check('已配置真实 appid', true);
  }
} else {
  check('project.config.json 存在', false);
}

console.log('\n【4】云函数');
['qa', 'seed'].forEach((fn) => {
  const d = path.join(MP, 'cloudfunctions', fn);
  check(`云函数 ${fn} 已就绪`, fs.existsSync(path.join(d, 'index.js')) && fs.existsSync(path.join(d, 'package.json')));
});
const seedBundle = path.join(MP, 'cloudfunctions', 'seed', 'seed.bundle.json');
check('seed 云函数已打包种子数据', fs.existsSync(seedBundle));

console.log('\n【5】mock 数据');
const mockData = path.join(MP, 'data', 'seed.json');
check('mock 种子数据存在', fs.existsSync(mockData));
if (fs.existsSync(mockData)) {
  const d = JSON.parse(fs.readFileSync(mockData, 'utf8'));
  check('mock 数据含问题', d.questions && d.questions.length > 0, `${(d.questions || []).length} 条`);
}

console.log('\n=== 结果 ===');
console.log(`通过: ${pass}  失败: ${fail}`);
if (warn.length) {
  console.log('\n提示:');
  warn.forEach((w) => console.log('  · ' + w));
}
if (fail > 0) {
  console.log('\n❌ 存在失败项，请先解决');
  process.exit(1);
}
console.log('\n✅ 环境检查通过，可以导入项目了\n');
console.log('导入步骤：');
console.log('  1. 打开微信开发者工具');
console.log('  2. 右上角「详情」→ 本地设置 → 勾选「不校验合法域名…」');
console.log('  3. 点「导入项目」');
console.log('  4. 目录选: ' + MP);
console.log('  5. AppID: 游客模式可直接用，或填你自己的 appid');
console.log('  6. 确认项目类型为「小程序」');
