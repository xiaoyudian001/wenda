// 验证错误兜底分析器真的能发现问题（自检分析器本身）
const path = require('path');
const fs = require('fs');

// 复用分析器逻辑（复制自 verify-error-handling.js 的实现）
function hasOwnGuard(js, pos) {
  const open = js.indexOf('(', pos);
  if (open === -1) return false;
  let depth = 0;
  let i = open;
  for (; i < js.length; i++) {
    const ch = js[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const trimmed = js.slice(i).replace(/^[\s\r\n]+/, '');
  if (/^\.catch\s*\(/.test(trimmed) || /^\.finally\s*\(/.test(trimmed)) return true;
  if (/^\.then\s*\(/.test(trimmed)) return chainEndHasGuard(js, i);
  return false;
}

function chainEndHasGuard(js, pos) {
  let i = pos;
  let guard = false;
  for (let step = 0; step < 20; step++) {
    const rest = js.slice(i).replace(/^[\s\r\n]+/, '');
    if (/^\.catch\s*\(/.test(rest) || /^\.finally\s*\(/.test(rest)) {
      guard = true;
      break;
    }
    if (!/^\.then\s*\(/.test(rest)) break;
    const open = js.indexOf('(', i);
    if (open === -1) break;
    let depth = 0;
    let j = open;
    for (; j < js.length; j++) {
      if (js[j] === '(') depth++;
      else if (js[j] === ')') {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    i = j;
  }
  return guard;
}

function unguardedCount(js) {
  const pos = [];
  const re = /\.then\s*\(/g;
  let m;
  while ((m = re.exec(js)) !== null) pos.push(m.index);
  return pos.filter((p) => !hasOwnGuard(js, p)).length;
}

const cases = [
  {
    name: '简单链有 catch',
    code: `api.x().then(a => { b(); }).catch(e => {});`,
    expect: 0,
  },
  {
    name: '简单链无 catch',
    code: `api.x().then(a => { b(); });`,
    expect: 1,
  },
  {
    name: '链中间 then，整链末尾有 catch',
    code: `api.x().then(a => { return api.y(); }).then(b => { c(); }).catch(e => {});`,
    expect: 0,
  },
  {
    name: '链中间 then，整链也没 catch',
    code: `api.x().then(a => { return api.y(); }).then(b => { c(); });`,
    expect: 2,
  },
  {
    name: '有 finally 兜底',
    code: `api.x().then(a => { b(); }).finally(() => {});`,
    expect: 0,
  },
  {
    name: '嵌套链：内层有 catch',
    code: `api.x().then(a => { return api.y().then(b => { c(); }).catch(e => {}); }).catch(e => {});`,
    expect: 0,
  },
  {
    name: '嵌套链：内外都没有 catch',
    code: `api.x().then(a => { return api.y().then(b => { c(); }); });`,
    expect: 2,
  },
  {
    name: '独立语句的两个 then 各自无 catch',
    code: `api.x().then(a => { b(); });\napi.y().then(c => { d(); });`,
    expect: 2,
  },
];

let pass = 0;
let fail = 0;
console.log('\n=== 分析器自检 ===\n');
cases.forEach((c) => {
  const got = unguardedCount(c.code);
  const ok = got === c.expect;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✅' : '❌'} ${c.name} — 期望 ${c.expect} 个无兜底，实际 ${got}`);
});

console.log(`\n通过: ${pass}  失败: ${fail}`);
if (fail) {
  console.log('\n❌ 分析器本身不可靠，不能用来做回归守卫\n');
  process.exit(1);
}
console.log('\n✅ 分析器可靠：能识别真问题，也不误报已兜底的链\n');
