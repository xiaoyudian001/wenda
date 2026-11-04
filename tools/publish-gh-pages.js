// 手动发布到 gh-pages（绕开 publish-github.js 的代理处理）
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, '.cowork-temp', 'gh-pages-publish');

const GIT_OPTS = [
  '-c', 'http.sslBackend=openssl',
  '-c', 'http.version=HTTP/1.1',
  '-c', 'http.https://github.com/.proxy=',
].join(' ');

function run(cmd, cwd) {
  return execSync(cmd, { cwd: cwd || ROOT, encoding: 'utf8', stdio: 'pipe', shell: 'powershell.exe' });
}

// 1. 准备临时目录（gh-pages 内容 = dist/site）
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, 'dist', 'site'), TMP);

// 2. .nojekyll（让 GitHub Pages 原样发布静态文件）
fs.writeFileSync(path.join(TMP, '.nojekyll'), '', 'utf8');

// 3. 在临时目录建仓库并推送
run('git init -q', TMP);
run('git checkout -q --orphan gh-pages', TMP);
run('git add -A', TMP);
run(`git -c user.name="wjw" -c user.email="780522454@qq.com" commit -q -m "chore: publish site"`, TMP);
const out = run(`git remote add origin https://github.com/xiaoyudian001/wenda.git`, TMP);
console.log('推送中...');
const push = run(`git ${GIT_OPTS} push -f origin gh-pages`, TMP);
console.log(push.trim());
console.log('\n✅ 已发布到 gh-pages');
console.log('   https://xiaoyudian001.github.io/wenda/');
