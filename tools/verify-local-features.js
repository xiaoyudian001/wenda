/**
 * 问搭 · 本地体验行为测试
 *
 * 覆盖本轮新增的三个行为：
 *   1. 提问草稿：写入本地存储 → 重建模块后能恢复；发布成功后清除
 *   2. 意见反馈：真实保存到本地，计数同步；失败时不谎报成功
 *   3. 通知中心：自动已读后未读数同步；重复进入不重复追加
 *
 * 用法：node tools/verify-local-features.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

// ---------- 模拟小程序运行时 ----------
const storage = {};
let toasts = [];
let modalAnswer = { confirm: true, content: '' };

global.wx = {
  getStorageSync(k) {
    return storage[k];
  },
  setStorageSync(k, v) {
    storage[k] = v;
  },
  removeStorageSync(k) {
    delete storage[k];
  },
  clearStorageSync() {
    Object.keys(storage).forEach((k) => delete storage[k]);
  },
  showToast(o) {
    toasts.push(o.title);
  },
  showModal(o) {
    if (typeof o.success === 'function') o.success(modalAnswer);
  },
  navigateTo() {},
  switchTab() {},
  navigateBack() {},
  setClipboardData() {},
  showShareMenu() {},
  cloud: undefined,
};

const captured = {};
global.App = (opts) => (captured.app = opts);
global.Page = (opts) => (captured.page = opts);
global.Component = (opts) => (captured.component = opts);
global.getApp = () =>
  captured.appInstance ||
  (captured.appInstance = { globalData: { useMock: true, openid: '' } });
global.getCurrentPages = () => [];

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    failures.push(name + (extra ? ' → ' + extra : ''));
    console.log('  ❌ ' + name + (extra ? ' → ' + extra : ''));
  }
}

/** 加载页面模块（每次都重新 require，确保拿到最新代码） */
function loadPage(name) {
  delete captured.page;
  const p = path.join(MP, 'pages', name, name + '.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return captured.page;
}

/** 造一个假的 Page 实例 */
function makeInstance(opts) {
  const inst = Object.assign({}, opts);
  inst.data = JSON.parse(JSON.stringify(opts.data || {}));
  inst.setData = function (patch) {
    Object.keys(patch).forEach((k) => {
      if (k.indexOf('.') > -1) {
        const [a, b] = k.split('.');
        this.data[a] = this.data[a] || {};
        this.data[a][b] = patch[k];
      } else {
        this.data[k] = patch[k];
      }
    });
  };
  return inst;
}

(async () => {
  console.log('\n=== 问搭 · 本地体验行为测试 ===\n');

  // ================= 1. 提问草稿 =================
  console.log('【1】提问草稿');
  const draftMod = require(path.join(MP, 'services', 'draft.js'));

  // 1.1 保存后真的落在本地存储里
  draftMod.saveDraft({
    cat: 'eat',
    title: '今天中午吃什么',
    desc: '望京，不吃辣',
    options: ['A', 'B'],
    anonymous: true,
  });
  const raw = storage['wenda_ask_draft_v1'];
  check('草稿写入了本地存储', !!raw, JSON.stringify(raw || null));
  check('存储里有标题', raw && raw.title === '今天中午吃什么');

  // 1.2 重建模块后仍能读回（验证是持久化，不是内存）
  delete require.cache[require.resolve(path.join(MP, 'services', 'draft.js'))];
  const draftMod2 = require(path.join(MP, 'services', 'draft.js'));
  const restored = draftMod2.readDraft();
  check('重建模块后草稿仍在', !!restored);
  check('草稿内容完整', restored && restored.title === '今天中午吃什么' && restored.desc === '望京，不吃辣');
  check('草稿选项完整', restored && restored.options.length === 2);
  check('草稿匿名设置保留', restored && restored.anonymous === true);

  // 1.3 空草稿不应被当成有效草稿
  draftMod2.saveDraft({ cat: 'eat', title: '', desc: '', options: ['', ''], anonymous: false });
  check('空内容不算有效草稿', draftMod2.readDraft() === null);

  // 1.4 页面恢复草稿
  const askPage = loadPage('ask');
  const ai = makeInstance(askPage);
  draftMod2.saveDraft({
    cat: 'play',
    title: '周末去哪玩',
    desc: '北京周边',
    options: ['爬山', 'City walk'],
    anonymous: false,
  });
  await ai.onLoad();
  check('提问页恢复了标题', ai.data.title === '周末去哪玩', ai.data.title);
  check('提问页恢复了描述', ai.data.desc === '北京周边');
  check('提问页恢复了分类', ai.data.cat === 'play', ai.data.cat);
  check('提问页恢复了选项', ai.data.options.length === 2 && ai.data.options[0] === '爬山');
  check('提示草稿已恢复', ai.data.draftRestored === true);

  // 1.5 输入会持续更新草稿
  ai.onTitleInput({ detail: { value: '换个标题' } });
  const afterEdit = draftMod2.readDraft();
  check('编辑后草稿同步更新', afterEdit && afterEdit.title === '换个标题');

  // 1.6 发布成功后清除草稿
  await ai.onSubmit();
  check('发布成功后草稿被清除', draftMod2.readDraft() === null);
  check('发布后表单已重置', ai.data.title === '' && ai.data.draftRestored === false);

  // 1.7 主动清空也会清除草稿
  ai.onTitleInput({ detail: { value: '写了一半' } });
  check('再次编辑产生草稿', !!draftMod2.readDraft());
  await ai.onReset();
  check('主动清空后草稿被清除', draftMod2.readDraft() === null);

  // ================= 2. 意见反馈 =================
  console.log('\n【2】意见反馈');
  const api = require(path.join(MP, 'services', 'api.js'));

  const fb1 = await api.saveFeedback({ content: '希望增加图片上传', category: 'other' });
  check('反馈保存成功', !!fb1.feedback);
  check('反馈内容正确', fb1.feedback.content === '希望增加图片上传');
  check('反馈标记为本地来源', fb1.feedback.source === 'local');
  check('反馈计数为 1', fb1.total === 1);

  const fb2 = await api.saveFeedback({ content: '搜索很好用', category: 'other' });
  check('第二条反馈计数为 2', fb2.total === 2);

  const fbList = await api.listFeedbacks();
  check('能读回反馈列表', fbList.list.length === 2);
  check('反馈按时间倒序', fbList.list[0].content === '搜索很好用', fbList.list[0].content);

  // 空反馈应报错
  let fbErr = null;
  try {
    await api.saveFeedback({ content: '   ' });
  } catch (e) {
    fbErr = e.message;
  }
  check('空反馈被拒绝', !!fbErr, fbErr);

  // 设置页：反馈计数要同步到界面
  const setPage = loadPage('settings');
  const si = makeInstance(setPage);
  await si.loadSettings();
  check('设置页显示反馈计数', si.data.feedbackCount === 2, `${si.data.feedbackCount}`);

  // 设置页提交反馈后计数更新，且提示语说明是本地保存
  toasts = [];
  modalAnswer = { confirm: true, content: '界面文案想更简洁' };
  si.onFeedback();
  await new Promise((r) => setTimeout(r, 30));
  check('提交反馈后计数变为 3', si.data.feedbackCount === 3, `${si.data.feedbackCount}`);
  check('提示说明保存到本机', toasts.some((t) => /本机/.test(t)), toasts.join('|'));

  // 空内容不应提示成功
  toasts = [];
  modalAnswer = { confirm: true, content: '' };
  si.onFeedback();
  await new Promise((r) => setTimeout(r, 30));
  check('空反馈不提示成功', !toasts.some((t) => /已保存|已提交/.test(t)), toasts.join('|'));

  // ================= 3. 通知中心 =================
  console.log('\n【3】通知中心');
  const notiPage = loadPage('notifications');
  const ni = makeInstance(notiPage);

  // 造几条未读通知（通过 mock 的 addAnswer 触发）
  const list = await api.listQuestions({ cat: 'all', sort: 'hot', page: 1, size: 2 });
  const q0 = list.list[0];
  const before = await api.listNotifications({ page: 1, size: 20 });
  const unreadBefore = before.unreadCount;

  await ni.load();
  check('通知列表已加载', ni.data.list.length > 0, `${ni.data.list.length} 条`);
  check('自动已读后未读数归零', ni.data.unreadCount === 0, `${ni.data.unreadCount}（原 ${unreadBefore}）`);
  check('列表项标记为已读', ni.data.list.every((n) => n.read === true));

  // 再次进入页面不应重复追加
  const countAfterFirst = ni.data.list.length;
  await ni.onShow();
  check('再次进入列表长度不变', ni.data.list.length === countAfterFirst, `${countAfterFirst} -> ${ni.data.list.length}`);
  const ids = ni.data.list.map((n) => n._id);
  check('没有重复的通知 id', new Set(ids).size === ids.length, `${ids.length} 个 id / ${new Set(ids).size} 个唯一`);

  // 全部已读后未读数仍为 0
  await ni.onReadAll();
  check('全部已读后未读数为 0', ni.data.unreadCount === 0);

  // ================= 汇总 =================
  console.log('\n=== 结果 ===');
  console.log(`通过: ${pass}  失败: ${fail}`);
  // 失败明细单独写文件，避免控制台编码问题导致看不到是哪一项
  const reportPath = path.join(ROOT, '.cowork-temp', 'verify-local-features.report.txt');
  try {
    fs.writeFileSync(
      reportPath,
      `通过: ${pass}  失败: ${fail}\n\n` +
        (failures.length ? '失败项：\n' + failures.map((f) => '  - ' + f).join('\n') : '无失败项'),
      'utf8'
    );
    console.log('失败明细已写入: ' + reportPath);
  } catch (e) {
    console.log('（报告写入失败: ' + e.message + '）');
    failures.forEach((f) => console.log('  - ' + f));
  }
  if (fail) {
    console.log('\n❌ 存在失败项\n');
    process.exit(1);
  }
  console.log('\n✅ 本地体验行为全部通过\n');
})().catch((err) => {
  console.error('\n💥 测试脚本异常:', err.stack);
  process.exit(1);
});
