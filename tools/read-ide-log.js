// 读小程序运行日志（miniprogramLog），确认本轮代码在真实运行时无报错
const fs = require('fs');
const path = require('path');
const os = require('os');

const base = path.join(
  os.homedir(),
  'AppData', 'Local', '微信开发者工具', 'User Data',
  '8ddbe4f4e2d56b8afdf4ac055bb53a8c', 'WeappSimulator', 'WeappFileSystem'
);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const full = path.join(dir, n);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (n.startsWith('log')) out.push({ full, size: st.size, mtime: st.mtime });
  }
  return out;
}

const logs = walk(base).sort((a, b) => b.mtime - a.mtime);
console.log('\n=== 小程序运行日志 ===\n');
console.log('日志文件 ' + logs.length + ' 个');
logs.slice(0, 3).forEach((l) => {
  console.log(`  ${l.full.replace(base, '')}  ${(l.size / 1024).toFixed(1)}KB  ${l.mtime.toLocaleString('zh-CN')}`);
});

if (!logs.length) {
  console.log('\n（没有日志文件）');
  process.exit(0);
}

const target = logs[0];
const content = fs.readFileSync(target.full, 'utf8');
const lines = content.split(/\r?\n/);

console.log('\n--- 报错相关 ---');
const errs = lines.filter((l) => /error|Error|ERROR|错误|异常|unhandled|rejection/i.test(l));
if (errs.length) {
  errs.slice(0, 12).forEach((l) => console.log('  ' + l.slice(0, 220)));
  console.log(`  共 ${errs.length} 条`);
} else {
  console.log('  ✅ 无报错');
}

console.log('\n--- 本轮相关（草稿/反馈/通知）---');
const mine = lines.filter((l) => /draft|feedback|草稿|意见反馈|通知/i.test(l));
if (mine.length) {
  mine.slice(0, 10).forEach((l) => console.log('  ' + l.slice(0, 220)));
  console.log(`  共 ${mine.length} 条`);
} else {
  console.log('  （本轮新代码尚无日志——因为模拟器里还没触发这些交互）');
}

console.log('\n--- 埋点（说明运行时在正常工作）---');
const track = lines.filter((l) => /app_open|question_list_view|埋点/.test(l));
track.slice(0, 5).forEach((l) => console.log('  ' + l.slice(0, 200)));
