// 检查每个页面的错误兜底：Promise 必须有 catch，避免未捕获异常冒到页面
const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');
const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));

let issues = 0;
console.log('\n=== 页面错误兜底检查 ===\n');

app.pages.forEach((p) => {
  const jsPath = path.join(MP, p + '.js');
  if (!fs.existsSync(jsPath)) return;
  const js = fs.readFileSync(jsPath, 'utf8');

  // 统计 .then( 调用与 .catch( 的数量
  const thenCount = (js.match(/\.then\s*\(/g) || []).length;
  const catchCount = (js.match(/\.catch\s*\(/g) || []).length;
  const finallyCount = (js.match(/\.finally\s*\(/g) || []).length;

  const ok = thenCount === 0 || catchCount >= thenCount;
  if (!ok) issues++;
  console.log(
    `${ok ? '✅' : '❌'} ${p.padEnd(28)} then=${thenCount} catch=${catchCount} finally=${finallyCount}`
  );
});

console.log('\n=== 结果 ===');
if (issues) {
  console.log(`❌ ${issues} 个页面的 Promise 缺少 catch 兜底\n`);
  process.exit(1);
}
console.log('✅ 所有页面的 Promise 都有 catch 兜底\n');
