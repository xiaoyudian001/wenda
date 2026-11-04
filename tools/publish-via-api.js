// 用 GitHub API 发布 gh-pages（绕开 git 客户端 TLS/代理问题）
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO = 'xiaoyudian001/wenda';
const BRANCH = 'gh-pages';
const SITE = path.join(ROOT, 'dist', 'site');

function getToken() {
  const out = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    shell: 'powershell.exe',
  });
  const m = {};
  out.split('\n').forEach((l) => {
    const i = l.indexOf('=');
    if (i > 0) m[l.slice(0, i)] = l.slice(i + 1);
  });
  if (!m.password) throw new Error('未取到凭据');
  return m.password;
}

function api(method, apiPath, body, token) {
  const args = [
    '-s', '-X', method,
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'Authorization: Bearer ' + token,
    '-H', 'User-Agent: wenda-publisher',
    '--max-time', '120',
  ];
  if (body !== undefined) {
    args.push('-H', 'Content-Type: application/json');
    args.push('--data-binary', '@-');
  }
  args.push('https://api.github.com' + apiPath);

  const payload = body === undefined ? '' : JSON.stringify(body);
  let res = null;
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = spawnSync('curl.exe', args, {
      input: payload,
      encoding: 'utf8',
      maxBuffer: 200 * 1024 * 1024,
    });
    if (res.status === 0) break;
    lastErr = (res.stderr || `curl exit ${res.status}`).slice(0, 200);
    if (attempt < 3) {
      console.warn(`  · 请求失败(${lastErr})，重试 ${attempt}/3`);
      spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 4']);
    }
  }
  if (!res || res.status !== 0) {
    throw new Error(`curl 失败(${res ? res.status : '?'}): ${lastErr}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`响应非 JSON: ${String(res.stdout).slice(0, 300)}`);
  }
  if (parsed && parsed.message && parsed.documentation_url) {
    throw new Error(`API 报错: ${parsed.message}`);
  }
  return parsed;
}

function collect(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...collect(full, rel));
    else out.push({ path: rel, full });
  }
  return out;
}

(async () => {
  const token = getToken();
  const me = api('GET', '/user', undefined, token);
  console.log(`认证成功：${me.login}`);

  const files = collect(SITE);
  // .nojekyll 让 GitHub Pages 原样发布静态文件
  files.push({ path: '.nojekyll', full: null });
  console.log(`待发布 ${files.length} 个文件`);

  // 取远端 gh-pages 当前 sha（用于增量）
  let baseSha = null;
  try {
    const ref = api('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, undefined, token);
    baseSha = ref.object.sha;
    console.log(`远端 ${BRANCH} = ${baseSha.slice(0, 7)}`);
  } catch (e) {
    console.log(`远端 ${BRANCH} 不存在，将创建`);
  }

  // 分批建 blob（每批 40 个，避免单请求过大）
  const treeItems = [];
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const items = [];
    for (const f of batch) {
      const content = f.full
        ? fs.readFileSync(f.full).toString('base64')
        : Buffer.from('', 'utf8').toString('base64');
      const blob = api('POST', `/repos/${REPO}/git/blobs`, { content, encoding: 'base64' }, token);
      items.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    treeItems.push(...items);
    process.stdout.write(`  blob ${Math.min(i + 40, files.length)}/${files.length}\r`);
  }
  console.log(`\n  ✓ 全部 blob 就绪`);

  const treeBody = { tree: treeItems };
  if (baseSha) treeBody.base_tree = baseSha;
  const tree = api('POST', `/repos/${REPO}/git/trees`, treeBody, token);

  const commit = api('POST', `/repos/${REPO}/git/commits`, {
    message: 'chore: publish site',
    tree: tree.sha,
    parents: baseSha ? [baseSha] : [],
  }, token);

  api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true }, token);

  console.log(`\n✅ ${BRANCH} 已更新到 ${commit.sha}`);
  console.log('   https://xiaoyudian001.github.io/wenda/');
})().catch((err) => {
  console.error('\n❌ 发布失败:', err.message);
  process.exit(1);
});
