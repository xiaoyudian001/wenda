// 读 IDE 小程序 storage 里的 mock store，检查本轮新增的数据结构是否在真实运行时生成
const fs = require('fs');
const path = require('path');
const os = require('os');

const base = path.join(
  os.homedir(),
  'AppData', 'Local', '微信开发者工具', 'User Data',
  '8ddbe4f4e2d56b8afdf4ac055bb53a8c', 'WeappSimulator', 'WeappStorage'
);

const files = fs.readdirSync(base).filter((f) => f.endsWith('.json'));
let store = null;
let storeKey = '';

for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
  for (const ns of Object.keys(data)) {
    const kv = data[ns];
    if (kv && kv.wenda_mock_store_v1) {
      store = JSON.parse(kv.wenda_mock_store_v1.data);
      storeKey = ns + '/' + f;
    }
  }
}

if (!store) {
  console.log('未找到 mock store');
  process.exit(0);
}

console.log('\n=== 真实运行时的小程序本地数据 ===\n');
console.log('来源: ' + storeKey);
console.log('顶层键: ' + Object.keys(store).join(', '));

console.log('\n--- 本轮新增的结构是否在运行时生成 ---');
const checks = [
  ['notifications', '通知（ensureMockNotifications）'],
  ['feedbacks', '反馈（saveFeedback）'],
  ['settings', '设置（getSettings/saveSettings）'],
  ['optionVotes', '投票记录（幂等投票）'],
];
checks.forEach(([k, desc]) => {
  const has = Object.prototype.hasOwnProperty.call(store, k);
  const val = store[k];
  let detail = '';
  if (has) {
    if (Array.isArray(val)) detail = `（${val.length} 条）`;
    else if (val && typeof val === 'object') detail = `（${Object.keys(val).length} 项）`;
  }
  console.log(`  ${has ? '✅' : '❌'} ${k.padEnd(14)} ${desc} ${detail}`);
});

if (store.notifications) {
  console.log('\n--- 通知内容 ---');
  store.notifications.slice(0, 3).forEach((n) => {
    console.log(`  [${n.type}] ${n.title} — ${String(n.content).slice(0, 50)}`);
  });
}
if (store.settings) {
  console.log('\n--- 设置项 ---');
  console.log('  ' + JSON.stringify(store.settings));
}
if (store.optionVotes) {
  console.log('\n--- 投票记录（幂等投票的落地）---');
  console.log('  ' + JSON.stringify(store.optionVotes).slice(0, 300));
}
console.log('\n--- 基础数据规模 ---');
console.log('  questions: ' + (store.questions || []).length);
console.log('  answers: ' + (store.answers || []).length);
console.log('  users: ' + (store.users || []).length);
