// 给新页面补上 IDE 编译模式，方便一键直达测试
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'miniprogram', 'project.config.json');
const c = JSON.parse(fs.readFileSync(p, 'utf8'));
const list = c.condition.miniprogram.list;

const add = [
  { name: '搜索', pathName: 'pages/search/search', query: '', scene: null },
  { name: '我的收藏', pathName: 'pages/favorites/favorites', query: '', scene: null },
  { name: '决策复盘', pathName: 'pages/review/review', query: '', scene: null },
  { name: '设置', pathName: 'pages/settings/settings', query: '', scene: null },
];

add.forEach((a) => {
  if (!list.find((x) => x.pathName === a.pathName)) list.push(a);
});

fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n', 'utf8');
console.log('编译模式:');
list.forEach((x) => console.log('  -', x.name, '=>', x.pathName));
