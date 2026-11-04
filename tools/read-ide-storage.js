// 读微信开发者工具里小程序 storage 的真实落盘文件，验证本轮改动的持久化
const fs = require('fs');
const path = require('path');
const os = require('os');

const base = path.join(
  os.homedir(),
  'AppData', 'Local', '微信开发者工具', 'User Data',
  '8ddbe4f4e2d56b8afdf4ac055bb53a8c', 'WeappSimulator', 'WeappStorage'
);

if (!fs.existsSync(base)) {
  console.log('未找到 storage 目录: ' + base);
  process.exit(0);
}

const files = fs.readdirSync(base).filter((f) => f.endsWith('.json'));
let found = { draft: null, feedback: null, notifications: null, files: [] };

files.forEach((f) => {
  const p = path.join(base, f);
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    return;
  }
  if (!raw || raw.length < 10) return;

  // 存储文件可能是 JSON，也可能是 {key: value} 的扁平结构
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return;
  }
  if (!data || typeof data !== 'object') return;

  const keys = Object.keys(data);
  found.files.push({ file: f, size: raw.length, keys: keys.length });

  keys.forEach((k) => {
    if (/draft/i.test(k)) found.draft = { file: f, key: k, value: data[k] };
    if (/feedback/i.test(k)) found.feedback = { file: f, key: k, value: data[k] };
    if (/notification/i.test(k)) found.notifications = { file: f, key: k, value: data[k] };
  });
});

console.log('\n=== 微信开发者工具 · 小程序 storage 实况 ===\n');
console.log('storage 文件: ' + found.files.length + ' 个');
found.files.forEach((f) => console.log(`  ${f.file}  ${(f.size / 1024).toFixed(1)}KB  ${f.keys} 个键`));

console.log('\n--- 本轮改动的三个存储点 ---');
console.log('\n[1] 提问草稿 (wenda_ask_draft_v1)');
if (found.draft) {
  console.log('  ✅ 已落盘  文件=' + found.draft.file + '  key=' + found.draft.key);
  console.log('  内容: ' + JSON.stringify(found.draft.value).slice(0, 300));
} else {
  console.log('  ❌ 未找到（说明本轮还没在模拟器里输入过内容）');
}

console.log('\n[2] 意见反馈 (feedbacks)');
if (found.feedback) {
  console.log('  ✅ 已落盘  key=' + found.feedback.key);
  console.log('  内容: ' + JSON.stringify(found.feedback.value).slice(0, 300));
} else {
  console.log('  ❌ 未找到（说明本轮还没在模拟器里提交过反馈）');
}

console.log('\n[3] 通知 (notifications)');
if (found.notifications) {
  console.log('  ✅ 已落盘  key=' + found.notifications.key);
  console.log('  内容: ' + JSON.stringify(found.notifications.value).slice(0, 300));
} else {
  console.log('  ❌ 未找到（通知在 mock store 里，可能在别的文件）');
}
