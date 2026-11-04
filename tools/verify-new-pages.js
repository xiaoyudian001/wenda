/**
 * 问搭 · 新页面逻辑验证
 *
 * 目的：在不依赖开发者工具界面的情况下，验证 4 个新页面的数据流是否正确。
 * 做法：模拟小程序运行时（提供 wx.getStorageSync / setStorageSync 等），
 *       然后直接 require 页面的 JS，检查 onLoad/onShow 的数据准备逻辑。
 *
 * 用法：node tools/verify-new-pages.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

// ---------- 模拟 wx 运行时 ----------
const storage = {};
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
    console.log('   [toast]', o.title);
  },
  showModal() {},
  navigateTo(o) {
    console.log('   [navigateTo]', o.url);
  },
  switchTab(o) {
    console.log('   [switchTab]', o.url);
  },
  navigateBack() {},
  setClipboardData() {},
  showShareMenu() {},
  cloud: undefined,
};

// 小程序里 App()/Page()/Component() 是全局函数
const captured = {};
global.App = (opts) => {
  captured.app = opts;
  return opts;
};
global.Page = (opts) => {
  captured.page = opts;
  return opts;
};
global.Component = (opts) => {
  captured.component = opts;
  return opts;
};
global.getApp = () => captured.appInstance || (captured.appInstance = { globalData: { useMock: true, openid: '' } });
global.getCurrentPages = () => [];

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

/** 加载一个页面模块，返回其 Page 配置 */
function loadPage(name) {
  delete captured.page;
  const modPath = path.join(MP, 'pages', name, name + '.js');
  delete require.cache[require.resolve(modPath)];
  require(modPath);
  return captured.page;
}

/** 造一个假的 Page 实例（含 setData） */
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

console.log('\n=== 问搭 · 新页面逻辑验证 ===\n');

(async () => {
// ---------- 0. 广场筛选 / 分页 / 刷新 ----------
console.log('【0】广场筛选、分页与刷新');
const indexPage = loadPage('index');
check('广场页面配置加载成功', !!indexPage);
check('有 onReachBottom', typeof indexPage.onReachBottom === 'function');
check('有 onPullDownRefresh', typeof indexPage.onPullDownRefresh === 'function');

const ii = makeInstance(indexPage);
await ii.loadData();
check('首屏加载到问题', ii.data.list.length > 0, `${ii.data.list.length} 条`);
check('首屏 page 递增', ii.data.page === 2, `${ii.data.page}`);
if (ii.data.hasMore) {
  const firstLen = ii.data.list.length;
  await ii.onReachBottom();
  check('触底加载追加数据', ii.data.list.length > firstLen, `${firstLen} -> ${ii.data.list.length}`);
} else {
  check('触底无更多时安全返回', true);
}

// 排序栏「待回答」必须过滤出 status=pending，而不是继续加载热榜
await ii.onSort({ currentTarget: { dataset: { sort: 'pending' } } });
check('待回答筛选结果非空', ii.data.list.length > 0, `${ii.data.list.length} 条`);
check('待回答筛选只返回 pending', ii.data.list.every((q) => q.status === 'pending'));

// 从待回答切到普通分类，应退出 pending 排序
await ii.onCat({ currentTarget: { dataset: { key: 'eat' } } });
check('切普通分类后退出待回答排序', ii.data.sort === 'hot', ii.data.sort);
check('分类筛选只返回 eat', ii.data.list.every((q) => q.cat === 'eat'));

// 下拉刷新：重置 page 后重新拿首屏
wx.stopPullDownRefresh = function () {};
ii.setData({ page: 5 });
await ii.onPullDownRefresh();
check('下拉刷新后 page 回到 2', ii.data.page === 2, `${ii.data.page}`);

// ---------- 0.5 提问页设置联动 ----------
console.log('\n【0.5】提问页设置联动');
const api0 = require(path.join(MP, 'services', 'api.js'));
await api0.saveSettings({ anonymousDefault: true });
const askPage = loadPage('ask');
const ai = makeInstance(askPage);
await ai.onLoad();
check('提问页读取默认匿名设置', ai.data.anonymous === true);
ai.setData({ title: '临时标题', anonymous: false });
await ai.onReset();
check('清空表单后仍恢复默认匿名', ai.data.anonymous === true);
check('清空表单标题为空', ai.data.title === '');

// ---------- 1. 搜索页 ----------
console.log('【1】搜索页');
const searchPage = loadPage('search');
check('页面配置加载成功', !!searchPage);
check('有 doSearch 处理函数', typeof searchPage.doSearch === 'function');
check('有 onLoad 处理函数', typeof searchPage.onLoad === 'function');

const si = makeInstance(searchPage);
si.setData({ keyword: '咖啡' });
await si.doSearch();
check('搜索后 searched 置为 true', si.data.searched === true);
check('搜索返回了结果', si.data.list.length > 0, `${si.data.list.length} 条`);
check('搜索结果有 total', si.data.total > 0, `${si.data.total}`);
check('page 递增到 2', si.data.page === 2);

// 空关键词
const si2 = makeInstance(searchPage);
si2.setData({ keyword: '   ' });
await si2.doSearch();
check('空关键词不触发搜索', si2.data.searched === false);

// 无结果
const si3 = makeInstance(searchPage);
si3.setData({ keyword: 'zzz绝不存在zzz' });
await si3.doSearch();
check('无匹配时 searched 仍为 true', si3.data.searched === true);
check('无匹配时列表为空', si3.data.list.length === 0);

// ---------- 2. 收藏页 ----------
console.log('\n【2】收藏页');
const favPage = loadPage('favorites');
check('页面配置加载成功', !!favPage);
check('有 loadFavorites 处理函数', typeof favPage.loadFavorites === 'function');

const api = require(path.join(MP, 'services', 'api.js'));

// 先收藏一个问题
const list = await api.listQuestions({ cat: 'all', sort: 'hot', page: 1, size: 3 });
const target = list.list[0];
await api.toggleFavorite(target._id);

const fi = makeInstance(favPage);
await fi.loadFavorites();
check('收藏列表包含刚收藏的问题', fi.data.list.some((q) => q._id === target._id));
check('收藏总数为 1', fi.data.total === 1);
check('收藏项补上了 catName', !!fi.data.list[0].catName);

// ---------- 3. 决策复盘页 ----------
console.log('\n【3】决策复盘页');
const revPage = loadPage('review');
check('页面配置加载成功', !!revPage);
check('有 loadReview 处理函数', typeof revPage.loadReview === 'function');

// 先制造一点数据：提一个问题 + 回答一次
const cq = await api.createQuestion({
  cat: 'eat',
  catName: '吃什么',
  title: '验证用问题',
  desc: '测试',
  options: ['A', 'B'],
});
await api.addAnswer(cq.question._id, '这是一条带理由的回答，长度足够超过二十个字用于统计。', 'A');

const ri = makeInstance(revPage);
await ri.loadReview();
check('复盘统计了提问数', ri.data.stat.totalQuestions >= 1, `${ri.data.stat.totalQuestions}`);
check('复盘统计了回答数', ri.data.stat.totalAnswers >= 1, `${ri.data.stat.totalAnswers}`);
check('reasonRate 是数字', typeof ri.data.stat.reasonRate === 'number', `${ri.data.stat.reasonRate}`);
check('reasonRate 大于 0（回答写了理由）', ri.data.stat.reasonRate > 0);
check('decidedQuestions 是数组', Array.isArray(ri.data.decidedQuestions));

// ---------- 4. 设置页 ----------
console.log('\n【4】设置页');
const setPage = loadPage('settings');
check('页面配置加载成功', !!setPage);
check('有 loadSettings 处理函数', typeof setPage.loadSettings === 'function');
check('有 onToggle 处理函数', typeof setPage.onToggle === 'function');

const seti = makeInstance(setPage);
await seti.loadSettings();
check('设置读取到默认值', seti.data.settings.notifyAnswer === true);

// 开关切换
seti.setData({ settings: Object.assign({}, seti.data.settings, { notifyHot: false }) });
await seti.onToggle({ currentTarget: { dataset: { key: 'notifyHot' } }, detail: { value: true } });
const after = await api.getSettings();
check('开关切换已保存', after.notifyHot === true);

// 资料编辑必须持久化
seti.setData({ nickname: '测试昵称', city: '苏州', editingProfile: true });
await seti.onSaveProfile();
check('保存资料后退出编辑态', seti.data.editingProfile === false);
check('页面昵称已更新', seti.data.nickname === '测试昵称');
const afterProfile = await api.updateProfile({ nickname: '测试昵称2', city: '杭州' });
check('资料接口返回新昵称', afterProfile.user.nickname === '测试昵称2');
const mineAfterProfile = await api.mine();
check('资料持久化后 mine 可读到', mineAfterProfile.user.nickname === '测试昵称2');

// ---------- 5. 详情页新功能 ----------
console.log('\n【5】详情页新功能');
const detPage = loadPage('detail');
check('页面配置加载成功', !!detPage);
check('有 onToggleFavorite', typeof detPage.onToggleFavorite === 'function');
check('有 onOpenReport', typeof detPage.onOpenReport === 'function');
check('有 onPickReplyOption', typeof detPage.onPickReplyOption === 'function');

const di = makeInstance(detPage);
di.setData({ qid: target._id });
await di.loadDetail();
check('详情页加载出问题', !!di.data.question);
check('收藏状态已读取', typeof di.data.favorited === 'boolean');
check('收藏状态加载完成标记', di.data.favLoaded === true);

// 收藏切换（初始已收藏 → 取消 → 再收藏）
await di.onToggleFavorite();
check('取消收藏后 favorited 为 false', di.data.favorited === false);
await di.onToggleFavorite();
check('再次点击后 favorited 为 true', di.data.favorited === true);

// 举报
di.setData({ reportOpen: false });
di.onOpenReport({ currentTarget: { dataset: { type: 'question', id: target._id } } });
check('举报面板已打开', di.data.reportOpen === true);
check('举报理由有默认值', di.data.reportReason === 'spam');
check('举报目标默认为问题', di.data.reportTargetType === 'question');
check('举报目标 id 正确', di.data.reportTargetId === target._id);
di.onPickReason({ currentTarget: { dataset: { key: 'abuse' } } });
check('举报理由可切换', di.data.reportReason === 'abuse');
await di.onSubmitReport();
check('举报提交后面板关闭', di.data.reportOpen === false);

// 举报回答
const firstAnswer = di.data.answers[0];
if (firstAnswer) {
  di.onOpenReport({ currentTarget: { dataset: { type: 'answer', id: firstAnswer._id } } });
  check('举报回答时目标类型为 answer', di.data.reportTargetType === 'answer');
  check('举报回答时目标 id 正确', di.data.reportTargetId === firstAnswer._id);
  await di.onSubmitReport();
  check('举报回答后面板关闭', di.data.reportOpen === false);
} else {
  check('有可举报的回答', false, '详情页无回答数据');
}

// 选“我选：X”
di.setData({ replyOption: '' });
di.onPickReplyOption({ currentTarget: { dataset: { key: 'o1' } } });
check('可选择“我选”选项', di.data.replyOption === 'o1');
di.onPickReplyOption({ currentTarget: { dataset: { key: 'o1' } } });
check('再次点击取消选择', di.data.replyOption === '');

// ---------- 6. 「我的」页 ----------
console.log('\n【6】「我的」页');
const minePage = loadPage('mine');
check('页面配置加载成功', !!minePage);
check('有 onTab 处理函数', typeof minePage.onTab === 'function');
check('有 onMenu 处理函数', typeof minePage.onMenu === 'function');
check('有 onSearch 处理函数', typeof minePage.onSearch === 'function');

const mi = makeInstance(minePage);
await mi.loadMine();
check('加载了我的提问', mi.data.myQuestions.length >= 1, `${mi.data.myQuestions.length}`);
check('加载了我的回答', mi.data.myAnswers.length >= 1, `${mi.data.myAnswers.length}`);
check('回答带上了问题标题', !!mi.data.myAnswers[0].title, mi.data.myAnswers[0].title);
check('API 原始回答带 questionTitle', !!mi.data.myAnswers[0].questionTitle, mi.data.myAnswers[0].questionTitle);
check('回答带上了时间文本', !!mi.data.myAnswers[0].timeText);
check('adoptedAnswers 已预计算', Array.isArray(mi.data.adoptedAnswers));
check('pendingCount 已计算', typeof mi.data.pendingCount === 'number');

// tab 切换
mi.onTab({ currentTarget: { dataset: { tab: 'answers' } } });
check('切到回答 tab', mi.data.tab === 'answers');
mi.onTab({ currentTarget: { dataset: { tab: 'adopted' } } });
check('切到采纳 tab', mi.data.tab === 'adopted');

// ---------- 汇总 ----------
console.log('\n=== 结果 ===');
console.log(`通过: ${pass}  失败: ${fail}`);
if (fail) {
  console.log('\n❌ 存在失败项\n');
  process.exit(1);
}
console.log('\n✅ 新页面逻辑全部通过\n');
})().catch((err) => {
  console.error('\n💥 验证脚本异常:', err.stack);
  process.exit(1);
});
