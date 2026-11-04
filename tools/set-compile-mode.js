// 切换 IDE 当前编译模式（改 project.config.json 的 condition.current）
// 用法：node tools/set-compile-mode.js <模式名>
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const p = path.join(ROOT, 'miniprogram', 'project.config.json');
const name = process.argv[2];

const c = JSON.parse(fs.readFileSync(p, 'utf8'));
const list = c.condition.miniprogram.list;

if (!name) {
  console.log('当前编译模式: ' + (c.condition.current || '(普通编译)'));
  list.forEach((x, i) => console.log(`  ${i}: ${x.name} => ${x.pathName}`));
  process.exit(0);
}

const found = list.find((x) => x.name === name);
if (!found) {
  console.error('未找到编译模式: ' + name);
  process.exit(1);
}

c.condition.current = name;
fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n', 'utf8');
console.log(`已切换当前编译模式为「${name}」=> ${found.pathName}`);
