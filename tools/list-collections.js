// 统计云函数实际读写的集合
const fs = require('fs');
const path = require('path');

const s = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'cloudfunctions', 'qa', 'index.js'),
  'utf8'
);

const map = {
  QUESTION: 'questions',
  ANSWER: 'answers',
  USER: 'users',
  VOTE: 'votes',
  REPORT: 'reports',
  EVENT: 'events',
  NOTIFICATION: 'notifications',
};

console.log('云函数 qa 实际使用的集合：');
let total = 0;
Object.entries(map).forEach(([constName, coll]) => {
  const re = new RegExp('db\\.collection\\(' + constName + '\\)', 'g');
  const n = (s.match(re) || []).length;
  total += n;
  console.log(`  ${coll.padEnd(16)} ${constName.padEnd(15)} ${n} 处`);
});

console.log(`\n合计 ${total} 次集合访问，实际涉及 ${Object.keys(map).length} 个集合`);

// seed 云函数用了哪些
const seed = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'cloudfunctions', 'seed', 'index.js'),
  'utf8'
);
console.log('\nseed 云函数集合：');
Object.entries(map).forEach(([constName, coll]) => {
  const re = new RegExp('db\\.collection\\(' + constName + '\\)', 'g');
  const n = (seed.match(re) || []).length;
  if (n) console.log(`  ${coll.padEnd(16)} ${n} 处`);
});

// 客户端 mock 用了哪些
const api = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'services', 'api.js'),
  'utf8'
);
console.log('\n客户端 api.js 涉及的集合概念：');
['questions', 'answers', 'users', 'votes', 'reports', 'notifications'].forEach((k) => {
  const re = new RegExp(k, 'g');
  const n = (api.match(re) || []).length;
  console.log(`  ${k.padEnd(16)} ${n} 次引用`);
});
