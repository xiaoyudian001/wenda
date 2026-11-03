#!/usr/bin/env node
/**
 * 问搭 · 原型打包器
 *
 * 把 prototype/ 下的 index.html + style.css + app.js + seed.bundle.js
 * 合并成**单个 HTML 文件**，方便：
 *   1. 本地双击直接打开（无需起服务器）
 *   2. 上传到任意静态托管（GitHub Pages / Gitee Pages / Netlify / Vercel）
 *   3. 直接发给别人（一个文件，不丢资源）
 *
 * 用法：node tools/build-single.js
 * 输出：dist/wenda-demo.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'prototype');
const DIST = path.join(ROOT, 'dist');

function read(f) {
  return fs.readFileSync(path.join(SRC, f), 'utf8');
}

const html = read('index.html');
const css = read('style.css');
const js = read('app.js');
const seed = read('seed.bundle.js');

let out = html;

// 用内联 <style> 替换外链
out = out.replace(
  '<link rel="stylesheet" href="style.css">',
  '<style>\n' + css + '\n</style>'
);

// 把 seed.bundle.js 和 app.js 合并进一个内联 <script>，替换两个外链
const inlineScripts = seed + '\n' + js;
out = out.replace(
  '<script src="seed.bundle.js"></script>\n<script src="app.js"></script>',
  '<script>\n' + inlineScripts + '\n</script>'
);

// 保险起见：若上面因换行符差异没匹配上，再用正则兜底
if (out.includes('seed.bundle.js') || out.includes('src="app.js"')) {
  out = out
    .replace(/<script src="seed\.bundle\.js"><\/script>/, '<script>\n' + seed + '\n</script>')
    .replace(/<script src="app\.js"><\/script>/, '<script>\n' + js + '\n</script>');
}

if (out.includes('src="app.js"') || out.includes('href="style.css"')) {
  console.error('❌ 未能完成内联，请检查 prototype/index.html 的引用标签格式');
  process.exit(1);
}

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

const outPath = path.join(DIST, 'wenda-demo.html');
fs.writeFileSync(outPath, out, 'utf8');

const size = fs.statSync(outPath).size;
console.log('✅ 单文件 demo 已生成');
console.log(`   ${outPath}`);
console.log(`   体积 ${(size / 1024).toFixed(1)} KB`);
console.log('\n用法：');
console.log('  · 本地：双击该文件即可在浏览器打开');
console.log('  · 发布：把该文件丢到任意静态托管的 index.html');
