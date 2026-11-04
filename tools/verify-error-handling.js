/**
 * 检查每个页面的错误兜底。
 *
 * 关键：不能只比 .then 和 .catch 的数量——一条链里可能有多个 then
 * 只对应一个 catch（比如 then 里 return 另一个 promise 再 then）。
 * 正确做法是分析链结构：每个 .then( 所在的那条链，
 * 在其后（到下一个独立语句前）必须存在 .catch( 或 .finally( 兜底。
 */
const fs = require('fs');
const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');
const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));

let issues = 0;
const details = [];
console.log('\n=== 页面错误兜底检查 ===\n');

/**
 * 旧的按数量比对逻辑已弃用：
 * 只比 .then 与 .catch 的数量会误判——嵌套链里多个 then 只对应一个 catch。
 * 改为下面的 hasOwnGuard，按链结构逐条判定。
 */
function thenCountOf(list) {
  return list.length;
}

/**
 * 判断某个 .then( 所属的 Promise 链末尾有没有 .catch( 或 .finally(。
 *
 * 做法：从 .then 的括号处开始做括号配平（跳过函数体内部的嵌套链），
 *      找到本层链的真正末尾（即 .then(...) 之后紧跟的 .catch/.finally）。
 *
 * 注意：链中间位置的 .then 不需要自己紧邻 catch——
 *      如 a.then(A).then(B).catch(C)，A 的错误会传到 B 再传到 C，
 *      整条链已被兜底。所以只要整条链末尾有 catch/finally 即可。
 */
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
        i++; // 指向 .then(...) 之后
        break;
      }
    }
  }

  // 从链末尾往后看：跳过空白与换行，允许链式调用中有换行
  const trimmed = js.slice(i).replace(/^[\s\r\n]+/, '');

  // 情况1：紧邻 catch/finally —— 本链已被兜底
  if (/^\.catch\s*\(/.test(trimmed) || /^\.finally\s*\(/.test(trimmed)) return true;

  // 情况2：后面还有 .then —— 说明本 then 是链中间位置，
  //        只要整条链末尾有 catch/finally 就算兜底，继续往后找
  if (/^\.then\s*\(/.test(trimmed)) {
    return chainEndHasGuard(js, i);
  }

  return false;
}

/**
 * 从位置 pos 开始，沿着链式调用往后走，看整条链末尾有没有 catch/finally。
 * 若遇到非链式调用（如换行后是新语句），则该链没有兜底。
 */
function chainEndHasGuard(js, pos) {
  let i = pos;
  let guard = false;
  // 最多走 20 跳，防止死循环
  for (let step = 0; step < 20; step++) {
    const rest = js.slice(i).replace(/^[\s\r\n]+/, '');
    if (/^\.catch\s*\(/.test(rest) || /^\.finally\s*\(/.test(rest)) {
      guard = true;
      break;
    }
    if (!/^\.then\s*\(/.test(rest)) break;

    // 找到这个 .then( 的括号并配平
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

app.pages.forEach((p) => {
  const jsPath = path.join(MP, p + '.js');
  if (!fs.existsSync(jsPath)) return;
  const js = fs.readFileSync(jsPath, 'utf8');

  const thenPositions = [];
  const re = /\.then\s*\(/g;
  let m;
  while ((m = re.exec(js)) !== null) thenPositions.push(m.index);

  const unguarded = thenPositions.filter((pos) => !hasOwnGuard(js, pos)).map((pos) => {
    const line = js.slice(0, pos).split('\n').length;
    return { line, lineText: js.split('\n')[line - 1].trim() };
  });

  const ok = unguarded.length === 0;
  if (!ok) issues++;
  console.log(
    `${ok ? '✅' : '❌'} ${p.padEnd(28)} then=${thenCountOf(thenPositions)} 无兜底=${unguarded.length}`
  );
  unguarded.forEach((u) => {
    console.log(`      ↳ L${u.line}: ${u.lineText.slice(0, 70)}`);
    details.push(`${p} L${u.line}`);
  });
});

console.log('\n=== 结果 ===');
if (issues) {
  console.log(`❌ ${issues} 个页面存在没有 catch/finally 兜底的 Promise 链`);
  details.forEach((d) => console.log('  - ' + d));
  console.log('');
  process.exit(1);
}
console.log('✅ 所有页面的 Promise 链都有 catch 或 finally 兜底\n');
