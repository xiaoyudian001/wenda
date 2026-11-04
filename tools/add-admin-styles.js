// 给审核后台追加：视图切换 + 举报处理相关样式
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'admin', 'admin.css');
let css = fs.readFileSync(p, 'utf8');

if (css.indexOf('.view-tabs') > -1) {
  console.log('样式已存在，跳过');
  process.exit(0);
}

// 补上 stat-card.danger（原来的 .stat-card.warn 后面接）
if (css.indexOf('.stat-card.danger') === -1) {
  css = css.replace(
    '.stat-card.warn { border-left: 3px solid var(--orange); }',
    '.stat-card.warn { border-left: 3px solid var(--orange); }\n' +
      '.stat-card.danger { border-left: 3px solid var(--red); }\n' +
      '.stat-card.danger .stat-num { color: var(--red); }'
  );
}

const extra = `
/* ---------- 视图切换（内容管理 / 举报处理） ---------- */
.view-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.view-tab {
  padding: 9px 18px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--sub);
  font-size: 14px;
  cursor: pointer;
  position: relative;
  top: 1px;
}
.view-tab:hover { color: var(--primary); }
.view-tab.active {
  background: #fff;
  border-color: var(--border);
  color: var(--primary);
  font-weight: 600;
}
.view-tab .badge {
  display: inline-block;
  min-width: 18px;
  padding: 0 6px;
  margin-left: 4px;
  border-radius: 9px;
  background: var(--red);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

/* ---------- 举报处理 ---------- */
.rtab {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #fff;
  color: var(--sub);
  font-size: 13px;
  cursor: pointer;
}
.rtab.active { background: #FFF1ED; color: var(--primary); border-color: var(--primary); font-weight: 600; }
.status-handled { background: #E8FFEA; color: var(--green); }
.status-dismissed { background: #F2F3F5; color: var(--sub); }
`;

css = css + extra;
fs.writeFileSync(p, css, 'utf8');
console.log('已追加视图切换与举报样式');
