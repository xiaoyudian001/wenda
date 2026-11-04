#!/usr/bin/env node
/**
 * 问搭 · GitHub Pages 发布脚本
 *
 * 把 dist/site 推到 gh-pages 分支，实现一条命令发布。
 *
 * 凭据来源（优先级）：
 *   1. 环境变量 GITHUB_TOKEN
 *   2. git credential helper 里 github.com 的凭据（gh auth login 或 git push 时存下的）
 *      → 读取方式：echo "protocol=https`nhost=github.com`n" | git credential fill
 *   3. gh CLI 已登录时，自动读取 gh auth token
 *
 * 用法：
 *   node tools/publish-github.js [owner] [repo]
 *   不传参数时默认用当前 git remote origin 推断
 *   例：node tools/publish-github.js xiaoyudian001 wenda
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'dist', 'site');
// 每次用唯一临时目录，避免上一次残留导致 git 分支冲突
const TMP = path.join(ROOT, '.cowork-temp', 'gh-pages-' + Date.now());

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function shIn(dir, cmd) {
  return execSync(cmd, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
}

/** 从 git credential helper 读取 github 凭据 */
function readGitCredential() {
  try {
    const input = 'protocol=https\nhost=github.com\n\n';
    const out = execSync('git credential fill', { input, encoding: 'utf8', stdio: 'pipe' });
    const map = {};
    out.split(/\r?\n/).forEach((line) => {
      const i = line.indexOf('=');
      if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
    });
    if (map.password) return { token: map.password, username: map.username, source: 'git credential' };
  } catch (e) {
    /* 没有存凭据 */
  }
  return null;
}

/** 从 gh CLI 读取 */
function readGhToken() {
  try {
    const out = sh('gh auth token');
    const t = out.trim();
    if (t) return { token: t, username: null, source: 'gh cli' };
  } catch (e) {
    /* gh 未安装或未登录 */
  }
  return null;
}

function resolveToken() {
  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN, username: null, source: 'env GITHUB_TOKEN' };
  }
  return readGitCredential() || readGhToken();
}

/** 递归复制 */
function copyInto(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyInto(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

/**
 * 安全删除目录。
 * Windows 上 .git 内部文件可能短时间被占用，需要重试；
 * 重试仍失败时不阻断流程（目录残留不影响发布）。
 */
function safeRemove(dir) {
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return true;
    } catch (e) {
      if (i === 4) {
        console.warn('  (警告) 临时目录清理失败，可稍后手动删除: ' + dir);
        return false;
      }
    }
  }
  return false;
}

// ---------- 参数 ----------
let owner = process.argv[2];
let repo = process.argv[3];

if (!owner || !repo) {
  // 从 origin remote 推断
  try {
    const url = sh('git remote get-url origin').trim();
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (m) {
      owner = owner || m[1];
      repo = repo || m[2];
    }
  } catch (e) {
    /* 没有 origin */
  }
}

if (!owner || !repo) {
  console.error('用法: node tools/publish-github.js <owner> <repo>');
  console.error('例:  node tools/publish-github.js xiaoyudian001 wenda');
  process.exit(1);
}

if (!fs.existsSync(SITE)) {
  console.error('❌ dist/site 不存在，请先运行: node tools/build-site.js');
  process.exit(1);
}

const cred = resolveToken();
if (!cred) {
  console.error('❌ 找不到 GitHub 凭据。请任选其一：');
  console.error('   · 设置环境变量 GITHUB_TOKEN');
  console.error('   · 运行 gh auth login');
  console.error('   · 或用 git push 一次让 credential helper 记住凭据');
  process.exit(1);
}
console.log(`→ 凭据来源: ${cred.source}${cred.username ? ' (user: ' + cred.username + ')' : ''}`);

// ---------- 构建 ----------
console.log('→ 构建站点…');
sh('node tools/build-site.js');

// ---------- 准备 gh-pages ----------
console.log('→ 准备 gh-pages 分支…');
// 回收上一轮遗留的临时目录
const tmpRoot = path.join(ROOT, '.cowork-temp');
if (fs.existsSync(tmpRoot)) {
  fs.readdirSync(tmpRoot)
    .filter((n) => n.startsWith('gh-pages'))
    .forEach((n) => {
      try {
        fs.rmSync(path.join(tmpRoot, n), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch (e) { /* 忽略 */ }
    });
}
fs.mkdirSync(TMP, { recursive: true });
copyInto(SITE, TMP);
fs.writeFileSync(path.join(TMP, '.nojekyll'), '', 'utf8');

const remote = `https://github.com/${owner}/${repo}.git`;
const gitName = sh('git config user.name').trim() || 'wenda';
const gitEmail = sh('git config user.email').trim() || 'wenda@local';

const steps = [
  ['git init -q', TMP],
  ['git checkout -q --orphan gh-pages', TMP],
  [`git remote add origin ${remote}`, TMP],
  ['git add -A', TMP],
  [`git -c user.name="${gitName}" -c user.email="${gitEmail}" commit -q -m "chore: 发布问搭 demo (${new Date().toISOString().slice(0, 10)})"`, TMP],
];

/** 执行 git 命令，遇到代理连接失败时自动重试直连 */
function runGit(dir, cmd) {
  // 某些网络环境下 git 默认的 HTTP/2 会被重置，强制 HTTP/1.1 更稳
  const withProto = cmd.replace(/^git /, 'git -c "http.version=HTTP/1.1" ');
  try {
    return shIn(dir, withProto);
  } catch (e) {
    const msg = ((e.stdout || '') + (e.stderr || '')).trim();
    const isProxyError = /Could not connect to 127\.0\.0\.1|Failed to connect|proxy|Connection was reset/i.test(msg);
    if (!isProxyError) throw e;
    console.log('  (代理不可用，改用直连重试)');
    // 清空 GitHub 专用代理后重试
    const bypassed = withProto.replace(/^git /, 'git -c "http.https://github.com/.proxy=" ');
    return shIn(dir, bypassed);
  }
}

for (const [cmd, cwd] of steps) {
  console.log(`  $ ${cmd}`);
  try {
    runGit(cwd, cmd);
  } catch (e) {
    console.error('\n❌ 执行失败:', cmd);
    const msg = (e.stdout || '') + (e.stderr || '');
    console.error(msg.trim() || e.message);
    console.error('\n可能原因：');
    console.error('  · 仓库不存在 → 先在 GitHub 上创建 ' + owner + '/' + repo);
    console.error('  · 凭据无 repo 权限 → 检查 token 的 scope');
    console.error('  · 仓库禁止 force push → 在 Settings → Branches 里放开');
    console.error('  · 本机代理未启动 → 用 gitproxy off 关闭代理，或启动代理软件');
    process.exit(1);
  }
}

// 推送单独处理（需要代理回退逻辑）
console.log('  $ git push -f origin gh-pages');
try {
  runGit(TMP, 'git push -f origin gh-pages');
} catch (e) {
  console.error('\n❌ 推送失败');
  console.error(((e.stdout || '') + (e.stderr || '')).trim() || e.message);
  console.error('\n可能原因：');
  console.error('  · 仓库不存在 → 先在 GitHub 上创建 ' + owner + '/' + repo);
  console.error('  · 凭据无 repo 权限 → 检查 token 的 scope');
  console.error('  · 仓库禁止 force push → 在 Settings → Branches 里放开');
  console.error('  · 本机代理未启动 → 用 gitproxy off 关闭代理，或启动代理软件');
  process.exit(1);
}

// 延迟清理：git 进程退出瞬间仍可能占用 .git 内的文件，立即删会 EPERM。
// 交给下一轮运行时回收，或在进程退出后重试。
setTimeout(() => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (e) {
    /* 忽略：残留目录不影响使用，下轮会清理 */
  }
}, 1500);

console.log('\n✅ 发布完成');
console.log(`   在线地址: https://${owner}.github.io/${repo}/`);
console.log(`   后台地址: https://${owner}.github.io/${repo}/admin/index.html`);
console.log(`   仓库地址: https://github.com/${owner}/${repo}`);
