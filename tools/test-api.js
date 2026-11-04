/**
 * 问搭 · 数据层端到端测试
 * 在 Node 中模拟微信小程序运行时，跑通 api.js 的全部接口。
 *
 * 用法：node tools/test-api.js
 */
const path = require('path');
const Module = require('module');

// ---------- 模拟 wx 运行时 ----------
const storage = {};
global.wx = {
  getStorageSync: (k) => (k in storage ? storage[k] : ''),
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: (k) => { delete storage[k]; },
  showToast: (o) => console.log('   [toast]', o.title),
  cloud: undefined, // 强制走 mock 分支
};
global.getApp = () => ({ globalData: { useMock: true, userInfo: null } });
global.console = console;

// 拦截 require，让 api.js 里的 require('../../data/seed.json') 能正常解析
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    if (request.endsWith('.json')) {
      return path.resolve(__dirname, '..', 'miniprogram', request.replace(/^\.\.\/\.\.\//, ''));
    }
    throw e;
  }
};

const api = require(path.join(__dirname, '..', 'miniprogram', 'services', 'api.js'));

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

(async function run() {
  console.log('\n=== 问搭 · 数据层端到端测试 ===\n');

  // 1. 问题列表
  console.log('【1】listQuestions');
  const l1 = await api.listQuestions({ cat: 'all', sort: 'hot', page: 1, size: 10 });
  check('返回 10 条', l1.list.length === 10, `实际 ${l1.list.length}`);
  check('hasMore 为 true', l1.hasMore === true);
  check('总数 > 100', l1.total > 100, `实际 ${l1.total}`);
  check('按 heat 降序', l1.list[0].heat >= l1.list[9].heat);

  const l2 = await api.listQuestions({ cat: 'all', sort: 'new', page: 1, size: 10 });
  check('最新排序按时间降序', l2.list[0].createdAt >= l2.list[9].createdAt);
  check('两页内容不同', l1.list[0]._id !== l2.list[0]._id);

  const l3 = await api.listQuestions({ cat: 'eat', sort: 'hot', page: 1, size: 50 });
  check('分类筛选生效', l3.list.every((q) => q.cat === 'eat'));
  check('eat 分类有数据', l3.list.length > 0);

  const l4 = await api.listQuestions({ cat: 'pending', sort: 'hot', page: 1, size: 50 });
  check('待回答筛选生效', l4.list.every((q) => q.status === 'pending'));
  check('待回答有数据', l4.list.length > 0);

  // 2. 问题详情
  console.log('\n【2】getQuestion');
  const target = l3.list[0];
  const d1 = await api.getQuestion(target._id);
  check('返回问题', !!d1.question);
  check('返回回答数组', Array.isArray(d1.answers));
  check('回答数与问题一致', d1.answers.length === target.answerCount,
    `${d1.answers.length} vs ${target.answerCount}`);
  const d2 = await api.getQuestion('not_exist_id');
  check('不存在的问题返回 null', d2 === null);

  // 3. 投票
  console.log('\n【3】vote');
  // 先取基线快照（mock 返回的是同一对象引用，不先快照会拿到投票后的值）
  const voteTarget = (await api.getQuestion(l3.list[0]._id)).question;
  const optKey = voteTarget.options[0].key;
  const votesBefore = voteTarget.options[0].votes;
  const totalBefore = voteTarget.totalVotes;
  const v1 = await api.vote(voteTarget._id, optKey);
  check('总票数 +1', v1.question.totalVotes === totalBefore + 1);
  check('对应选项票数 +1',
    v1.question.options.find((o) => o.key === optKey).votes === votesBefore + 1);
  let voteErr = null;
  try { await api.vote('not_exist', 'o1'); } catch (e) { voteErr = e.message; }
  check('对不存在的问题投票会报错', !!voteErr, voteErr);

  // 4. 提交回答
  console.log('\n【4】addAnswer');
  const aCountBefore = target.answerCount;
  const a1 = await api.addAnswer(target._id, '选第二个，因为我下午要开会，需要清醒一点。', null);
  check('返回新回答', !!a1.answer);
  check('回答内容正确', a1.answer.content.includes('开会'));
  check('回答者是我', a1.answer.author._id === 'me');
  const d3 = await api.getQuestion(target._id);
  check('问题回答数 +1', d3.answers.length === aCountBefore + 1);

  // 5. 点赞
  console.log('\n【5】like');
  const likeId = d3.answers[0]._id;
  const likesBefore = d3.answers[0].likes;
  const lk1 = await api.like(likeId);
  check('点赞 +1', lk1.likes === likesBefore + 1);
  check('liked 状态为 true', lk1.liked === true);
  const lk2 = await api.like(likeId);
  check('再次点赞取消', lk2.likes === likesBefore && lk2.liked === false);

  // 6. 发布问题
  console.log('\n【6】createQuestion');
  const c1 = await api.createQuestion({
    cat: 'eat',
    catName: '吃什么',
    title: '测试问题：中午吃火锅还是烧烤',
    desc: '两个人，预算100',
    options: ['火锅', '烧烤', '随便吃'],
    anonymous: false,
  });
  check('返回新问题', !!c1.question);
  check('标题正确', c1.question.title.includes('测试问题'));
  check('选项数量正确', c1.question.options.length === 3);
  check('初始状态 pending', c1.question.status === 'pending');
  const d4 = await api.getQuestion(c1.question._id);
  check('新问题可被查到', !!d4.question);
  check('新问题无回答', d4.answers.length === 0);

  // 7. 采纳
  console.log('\n【7】adopt');
  const ansOnNew = await api.addAnswer(c1.question._id, '选火锅，天冷吃火锅暖和。', '火锅');
  const ad1 = await api.adopt(c1.question._id, ansOnNew.answer._id);
  check('状态变为 adopted', ad1.question.status === 'adopted');
  check('记录了 adoptedAnswerId', ad1.question.adoptedAnswerId === ansOnNew.answer._id);
  const d5 = await api.getQuestion(c1.question._id);
  check('恰有 1 条已采纳回答',
    d5.answers.filter((a) => a.adopted).length === 1);

  // 8. 我的数据
  console.log('\n【8】mine');
  const m1 = await api.mine();
  check('返回用户信息', !!m1.user);
  check('我的提问包含刚发布的问题',
    m1.myQuestions.some((q) => q._id === c1.question._id));
  check('我的回答包含刚提交的回答', m1.myAnswers.length >= 1);
  check('被采纳数 >= 1', m1.stats.adoptCount >= 1);

  // 9. 重置
  console.log('\n【9】resetMock');
  api.resetMock();
  const m2 = await api.mine();
  check('重置后我的提问为空', m2.myQuestions.length === 0);

  // ---------- 10. 埋点 ----------
  console.log('\n【10】事件埋点');
  const tracker = require(path.join(__dirname, '..', 'miniprogram', 'services', 'tracker.js'));

  check('事件常量齐全', Object.keys(tracker.EVENTS).length === 10, `${Object.keys(tracker.EVENTS).length} 个`);

  tracker.track(tracker.EVENTS.DETAIL_VIEW, 'q_test_1', { cat: 'eat' });
  const queued = tracker._peek();
  check('事件已入队', queued.length >= 1);
  const last = queued[queued.length - 1];
  check('事件名字段正确', last.event === 'question_view');
  check('关联对象 id 正确', last.targetId === 'q_test_1');
  check('附加参数正确', last.params && last.params.cat === 'eat');
  check('含时间戳', typeof last.createdAt === 'number' && last.createdAt > 0);

  // mock 模式下不应发送（wx.cloud 为 undefined），队列应保留
  check('mock 模式不发送，队列保留', queued.length >= 1);

  // 攒批：达到 10 条应触发 flush（mock 模式下 flush 直接 return，队列仍保留）
  for (let i = 0; i < 12; i++) {
    tracker.track(tracker.EVENTS.OPTION_VOTE, `q_bulk_${i}`, {});
  }
  check('批量记录不丢事件', tracker._peek().length >= 13, `${tracker._peek().length} 条`);

  // 缓存持久化：重新读取 storage 应有数据
  check('事件已写入本地缓存', !!global.wx.getStorageSync('wenda_track_buffer_v1'));

  // ---------- 汇总 ----------
  console.log('\n=== 结果 ===');
  console.log(`通过: ${pass}  失败: ${fail}`);
  if (fail > 0) {
    console.log('\n❌ 存在失败项');
    process.exit(1);
  }
  console.log('\n✅ 数据层全部通过\n');
})().catch((e) => {
  console.error('\n❌ 测试异常:', e);
  process.exit(1);
});
