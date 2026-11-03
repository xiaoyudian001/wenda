#!/usr/bin/env node
/**
 * 问搭 · GitHub Pages 发布脚本
 *
 * 把 dist/site 推到 gh-pages 分支，实现一条命令发布。
 *
 * 前置条件：
 *   1. 已安装 GitHub CLI（gh）并完成登录： gh auth login
 *      或者已配置 git remote 且有推送权限
 *   2. 仓库开启了 Pages 功能，Source 选择 gh-pages 分支 / root
 *
 * 用法：
 *   node tools/publish-github.js <owner> <repo>
 *   例：node tools/publish-github.js wjw123 wenda-demo
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'dist', 'site');

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

/** 递归复制目录内容 */
function copyInto(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyInto(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

const owner = process.argv[2];
const repo = process.argv[3];

if (!owner || !repo) {
  console.error('用法: node tools/publish-github.js <owner> <repo>');
  console.error('例:  node tools/publish-github.js yourname wenda-demo');
  process.exit(1);
}

if (!fs.existsSync(SITE)) {
  console.error('❌ dist/site 不存在，请先运行: node tools/build-site.js');
  process.exit(1);
}

// 1. 确保 dist/site 是最新的
console.log('→ 构建站点…');
sh('node tools/build-site.js');

const remote = `https://github.com/${owner}/${repo}.git`;

// 2. 检查 remote 是否已存在
let hasRemote = false;
try {
  const remotes = sh('git remote');
  hasRemote = remotes.split('\n').map((s) => s.trim()).includes('origin');
} catch (e) { /* 没有 remote 是正常的 */ }

if (!hasRemote) {
  console.log(`→ 添加 remote: ${remote}`);
  sh(`git remote add origin ${remote}`);
}

// 3. 用 orphan 分支准备 gh-pages
console.log('→ 准备 gh-pages 分支…');
const tmp = path.join(ROOT, '.cowork-temp', 'gh-pages');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

// 复制站点内容
copyInto(path.join(SITE), tmp);

// 复制 .nojekyll（防止 Jekyll 忽略下划线开头的目录）
fs.writeFileSync(path.join(tmp, '.nojekyll'), '', 'utf8');

// 4. 在临时目录建分支并推送
const cmds = [
  'git init -q',
  'git checkout -q --orphan gh-pages',
  'git add -A',
  `git -c user.name="${sh('git config user.name').trim()}" -c user.email="${sh('git config user.email').trim()}" commit -q -m "chore: 发布问搭 demo (${new Date().toISOString().slice(0, 10)})"`,
  `git push -f origin gh-pages`,
];

for (const c of cmds) {
  console.log(`  $ ${c}`);
  try {
    sh(c, { cwd: tmp });
  } catch (e) {
    console.error('\n❌ 执行失败:', c);
    console.error((e.stdout || '') + (e.stderr || ''));
    console.error('\n可能原因：');
    console.error('  · 仓库不存在或没有推送权限 → 先在 GitHub 上创建空仓库');
    console.error('  · 未配置凭据 → 运行 gh auth login 或配置 git credential helper');
    console.error('  · 仓库有分支保护 → 先在 GitHub 设置里允许 force push');
    process.exit(1);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n✅ 发布完成');
console.log(`   访问地址: https://${owner}.github.io/${repo}/`);
console.log('\n若首次访问 404，请在仓库 Settings → Pages 里把 Source 设为 gh-pages 分支 / root。');
