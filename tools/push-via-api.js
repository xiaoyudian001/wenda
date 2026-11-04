// 用 GitHub API 推送（绕开 git 客户端 schannel TLS 与失效代理问题）
// 策略：以远端分支当前内容为基准，只上传工作区与远端的差异，
//       形成一个新提交。历史保留在远端，不重建。
// 用法：node tools/push-via-api.js [branch]
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO = 'xiaoyudian001/wenda';
const BRANCH = process.argv[2] || 'main';

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

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', shell: 'powershell.exe', maxBuffer: 200 * 1024 * 1024 });
}

/** 列出本地工作区相对 HEAD 改动的文件（已跟踪 + 新增） */
function changedFiles() {
  const tracked = sh('git diff --name-only HEAD').split('\n').filter(Boolean);
  const untracked = sh('git ls-files --others --exclude-standard').split('\n').filter(Boolean);
  return [...new Set([...tracked, ...untracked])].filter((f) => f && !f.startsWith('.cowork-temp/'));
}

/** 仓库内所有需要上传的文件（git 跟踪的全部文件） */
function trackedFiles() {
  return sh('git ls-files')
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('.cowork-temp/'));
}

(async () => {
  const token = getToken();
  const me = api('GET', '/user', undefined, token);
  console.log(`认证成功：${me.login}`);

  // 远端分支当前 sha
  let baseSha = null;
  try {
    const ref = api('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, undefined, token);
    baseSha = ref.object.sha;
    console.log(`远端 ${BRANCH} = ${baseSha.slice(0, 7)}`);
  } catch (e) {
    console.log(`远端 ${BRANCH} 不存在，将创建`);
  }

  // 完整同步：上传仓库内所有跟踪文件，保证远端与本地一致
  const all = trackedFiles();
  const changedSet = new Set(changedFiles());
  console.log(`仓库文件 ${all.length} 个，本次本地改动 ${changedSet.size} 个`);

  // 取远端 tree，比对内容后只上传真正不同的文件
  let remoteTree = {};
  if (baseSha) {
    try {
      const t = api('GET', `/repos/${REPO}/git/trees/${baseSha}?recursive=1`, undefined, token);
      (t.tree || []).forEach((n) => {
        if (n.type === 'blob') remoteTree[n.path] = n.sha;
      });
    } catch (e) {
      console.log('  · 未能读取远端 tree，将全量上传');
    }
  }

  const files = [];
  for (const file of all) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) continue;
    const localSha = sh(`git hash-object "${file}"`).trim();
    if (remoteTree[file] === localSha) continue;
    files.push({ path: file, abs });
  }
  console.log(`需上传 ${files.length} 个`);

  if (!files.length) {
    console.log('远端已与本地一致，无需推送');
    return;
  }

  // 用 blobs + tree + commit 构造提交，以远端 sha 为 base_tree
  const treeItems = [];
  for (const f of files) {
    const content = fs.readFileSync(f.abs).toString('base64');
    const blob = api('POST', `/repos/${REPO}/git/blobs`, { content, encoding: 'base64' }, token);
    treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const treeBody = { tree: treeItems };
  if (baseSha) treeBody.base_tree = baseSha;
  const tree = api('POST', `/repos/${REPO}/git/trees`, treeBody, token);

  // 提交信息取本地未推送提交的最后一条
  let message = 'chore: sync from workspace';
  try {
    const local = sh('git log -1 --format=%s').trim();
    if (local) message = local;
  } catch (e) { /* 用默认信息 */ }

  const commit = api('POST', `/repos/${REPO}/git/commits`, {
    message,
    tree: tree.sha,
    parents: baseSha ? [baseSha] : [],
  }, token);

  api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false }, token);

  console.log(`\n✅ ${BRANCH} 已更新：${baseSha ? baseSha.slice(0, 7) : '(new)'} → ${commit.sha.slice(0, 7)}`);
  console.log(`   ${commit.html_url || ''}`);
})().catch((err) => {
  console.error('\n❌ 推送失败:', err.message);
  process.exit(1);
});
