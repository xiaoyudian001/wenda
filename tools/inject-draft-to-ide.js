// 在微信开发者工具的小程序 storage 里写入一份草稿，
// 用于验证「重新进入提问页能恢复草稿」这条读取路径在真实运行时生效。
// 只写自己的 wenda_ask_draft_v1 键，不动其他任何数据。
const fs = require('fs');
const path = require('path');
const os = require('os');

const base = path.join(
  os.homedir(),
  'AppData', 'Local', '微信开发者工具', 'User Data',
  '8ddbe4f4e2d56b8afdf4ac055bb53a8c', 'WeappSimulator', 'WeappStorage'
);

const files = fs.readdirSync(base).filter((f) => f.endsWith('.json'));
if (!files.length) {
  console.log('未找到 storage 文件');
  process.exit(1);
}

const p = path.join(base, files[0]);
let data = JSON.parse(fs.readFileSync(p, 'utf8'));

// 找到承载 wenda key 的那个小程序命名空间
let ns = null;
for (const k of Object.keys(data)) {
  if (data[k] && typeof data[k] === 'object' && 'wenda_mock_store_v1' in data[k]) {
    ns = k;
    break;
  }
}
if (!ns) {
  console.log('未找到 wenda 命名空间，现有键: ' + Object.keys(data).join(', '));
  process.exit(1);
}

const draft = {
  cat: 'kid',
  title: '周末两天带五岁孩子去哪玩',
  desc: '北京周边，不要太累',
  options: ['科技馆', '公园野餐', '动物园'],
  anonymous: false,
  updatedAt: Date.now(),
};

data[ns].wenda_ask_draft_v1 = {
  data: JSON.stringify(draft),
  dataType: 'Object',
};

fs.writeFileSync(p, JSON.stringify(data), 'utf8');
console.log('✅ 已写入草稿到 ' + files[0]);
console.log('   命名空间: ' + ns);
console.log('   内容: ' + JSON.stringify(draft));
console.log('\n现在切到别的页面再回到提问页，应看到「已恢复你上次没写完的内容」');
