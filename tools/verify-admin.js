// 校验审核后台的 HTML/JS 结构完整性
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'admin', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'admin', 'admin.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'admin', 'admin.css'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    console.log('  ❌ ' + name + (extra ? ' → ' + extra : ''));
  }
}

console.log('\n=== 问搭 · 审核后台结构校验 ===\n');

// 关键元素
[
  'view-questions',
  'view-reports',
  'reportRows',
  'statR',
  'reportBadge',
  'rPrevBtn',
  'rNextBtn',
  'rPageInfo',
].forEach((id) => {
  check(`HTML 含 #${id}`, html.indexOf('id="' + id + '"') > -1);
});

// 举报视图默认隐藏
check('view-reports 默认隐藏', /id="view-reports"[^>]*hidden/.test(html));

// JS 必须有的函数
['loadReports', 'renderReports', 'adminDismissReport', 'adminHideTarget'].forEach((fn) => {
  check(`JS 含 ${fn}`, js.indexOf(fn) > -1);
});

// JS 必须调用的接口
['action=adminReports', 'action=adminHandleReport'].forEach((a) => {
  check(`JS 调用 ${a}`, js.indexOf(a) > -1);
});

// 样式
['.view-tabs', '.view-tab', '.rtab', '.stat-card.danger', '.status-handled'].forEach((c) => {
  check(`CSS 含 ${c}`, css.indexOf(c) > -1);
});

// 事件绑定
check('绑定了视图切换', js.indexOf(".view-tab')") > -1);
check('绑定了举报筛选', js.indexOf(".rtab')") > -1);

console.log('\n=== 结果 ===');
console.log(`通过: ${pass}  失败: ${fail}`);
if (fail) {
  console.log('\n❌ 存在失败项\n');
  process.exit(1);
}
console.log('\n✅ 审核后台结构完整\n');
