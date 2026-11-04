// 给审核后台的演示模式补充样例举报数据
// 目的：本地 demo 模式下也能看到举报列表，验证渲染与交互
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const bundle = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'seed', 'seed.bundle.json'), 'utf8')
);

// 挑几条真实问题/回答当被举报对象
const questions = bundle.questions.slice(0, 3);
const answers = bundle.answers.slice(0, 2);

const reasons = ['spam', 'abuse', 'privacy', 'other'];
const details = [
  '这条内容看起来像广告，重复发了三次',
  '措辞不太友善，有攻击性',
  '里面有手机号等个人信息',
  '内容与问题无关，跑题了',
];

const samples = [];
questions.forEach((q, i) => {
  samples.push({
    _id: 'demo_report_q' + i,
    targetType: 'question',
    targetId: q._id,
    reason: reasons[i % reasons.length],
    detail: details[i % details.length],
    openid: 'demo_user_' + i,
    status: 'pending',
    createdAt: Date.now() - (i + 1) * 3600 * 1000,
  });
});
answers.forEach((a, i) => {
  samples.push({
    _id: 'demo_report_a' + i,
    targetType: 'answer',
    targetId: a._id,
    reason: reasons[(i + 1) % reasons.length],
    detail: details[(i + 1) % details.length],
    openid: 'demo_user_' + (i + 3),
    status: i === 0 ? 'handled' : 'dismissed',
    createdAt: Date.now() - (i + 4) * 3600 * 1000,
  });
});

// 写进 seed.bundle.json，让后台演示模式能读到
bundle.demoReports = samples;
fs.writeFileSync(
  path.join(ROOT, 'seed', 'seed.bundle.json'),
  JSON.stringify(bundle, null, 2),
  'utf8'
);

console.log(`已生成 ${samples.length} 条样例举报（含 pending/handled/dismissed 三种状态）`);
console.log('其中：');
samples.forEach((s) => {
  console.log(`  [${s.status}] ${s.targetType} ${s.targetId} - ${s.reason}`);
});
