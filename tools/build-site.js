#!/usr/bin/env node
/**
 * 问搭 · 静态站点发布准备
 *
 * 生成 gh-pages 分支内容：一个纯静态站点，包含
 *   - index.html   单文件 demo（双击即开，无需服务器）
 *   - admin.html   审核后台（演示模式）
 *   - prototype/   原型的多文件版本
 *
 * 产物目录：dist/site/
 * 之后可任选一种方式发布：
 *   1. GitHub Pages：把 dist/site 内容推到 gh-pages 分支
 *   2. Gitee Pages / Netlify / Vercel：把 dist/site 作为发布目录
 *   3. 任意静态服务器：直接指向 dist/site
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = path.join(DIST, 'site');

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

rmrf(SITE);
fs.mkdirSync(SITE, { recursive: true });

// 1. 单文件 demo 作为首页
const single = path.join(DIST, 'wenda-demo.html');
if (!fs.existsSync(single)) {
  console.error('❌ 请先运行 node tools/build-single.js');
  process.exit(1);
}
fs.copyFileSync(single, path.join(SITE, 'index.html'));

// 2. 审核后台（需要 seed 目录，放相对路径）
const adminOut = path.join(SITE, 'admin');
fs.mkdirSync(adminOut, { recursive: true });
['index.html', 'admin.css', 'admin.js'].forEach((f) => {
  fs.copyFileSync(path.join(ROOT, 'admin', f), path.join(adminOut, f));
});
// admin.js 里 fetch('../seed/seed.bundle.json') 需要 seed 在站点根上一级
const seedOut = path.join(SITE, 'seed');
fs.mkdirSync(seedOut, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'seed', 'seed.bundle.json'), path.join(seedOut, 'seed.bundle.json'));

// 3. 原型多文件版本
copyDir(path.join(ROOT, 'prototype'), path.join(SITE, 'prototype'));

// 4. 说明页
const readme = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>问搭 · Demo</title>
<style>
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#F5F6F8;color:#1D2129;margin:0;padding:48px 24px}
.wrap{max-width:680px;margin:0 auto}
h1{font-size:32px;margin:0 0 8px}
.sub{color:#86909C;font-size:15px;margin-bottom:32px}
.card{background:#fff;border-radius:16px;padding:24px 28px;margin-bottom:16px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.card h2{font-size:19px;margin:0 0 10px}
.card p{color:#4E5969;line-height:1.8;font-size:15px;margin:0 0 12px}
a.btn{display:inline-block;background:#FF6B4A;color:#fff;text-decoration:none;padding:11px 22px;border-radius:22px;font-size:15px;margin-right:10px}
a.btn.sec{background:#F5F6F8;color:#4E5969}
ul{padding-left:20px;line-height:1.9;color:#4E5969;font-size:15px}
code{background:#F5F6F8;padding:2px 6px;border-radius:4px;font-size:13px}
</style></head><body><div class="wrap">
<h1>问搭 · Demo</h1>
<div class="sub">把选择困难，交给别人</div>

<div class="card">
<h2>可交互原型</h2>
<p>完整体验：浏览广场、筛选分类、投票、点赞、提交回答、采纳、发布问题、分享。</p>
<a class="btn" href="./index.html">打开原型 →</a>
<a class="btn sec" href="./prototype/index.html">多文件版</a>
</div>

<div class="card">
<h2>审核后台</h2>
<p>运营看板：数据统计、状态筛选、问题隐藏与恢复。当前为演示模式，使用内置种子数据。</p>
<a class="btn" href="./admin/index.html">打开后台 →</a>
</div>

<div class="card">
<h2>这是什么</h2>
<p>一个微信小程序 MVP：把「今天吃什么」「明天穿什么」「周末去哪玩」「孩子不听话怎么办」这类纠结，交给别人来回答。</p>
<ul>
<li>147 个真实问题 / 160 条回答 / 6 个分类</li>
<li>问题可带选项，回答给理由，提问者一键采纳</li>
<li>小程序端：广场、详情、提问、我的 四页面 + 云函数后端</li>
<li>本 Demo 为 HTML 原型，数据真实，用于验证产品假设</li>
</ul>
</div>

<div class="card">
<h2>核心假设</h2>
<p>产品成立与否，取决于<b>有没有人愿意回答陌生人的纠结</b>。这份 demo 就是用来验证这一点的——请在原型里点几个问题，自己写几条回答，看看你的手感。</p>
</div>
</div></body></html>`;
fs.writeFileSync(path.join(SITE, 'index-demo.html'), readme, 'utf8');

// 5. CNAME / robots / 404
fs.writeFileSync(path.join(SITE, '404.html'), readme, 'utf8');
fs.writeFileSync(path.join(SITE, 'robots.txt'), 'User-agent: *\nAllow: /\n', 'utf8');

console.log('✅ 静态站点已生成: ' + SITE);
console.log('\n目录结构:');
const list = (dir, prefix = '') => {
  fs.readdirSync(dir).forEach((n) => {
    const full = path.join(dir, n);
    if (fs.statSync(full).isDirectory()) {
      console.log(prefix + n + '/');
      list(full, prefix + '  ');
    } else {
      const kb = (fs.statSync(full).size / 1024).toFixed(1);
      console.log(prefix + n + '  (' + kb + ' KB)');
    }
  });
};
list(SITE);
console.log('\n发布方式:');
console.log('  A. GitHub Pages:  把 dist/site 内容推到 gh-pages 分支');
console.log('  B. 本地预览:     node tools/serve.js 8902 dist/site');
console.log('  C. Netlify/Vercel:  发布目录选 dist/site');
