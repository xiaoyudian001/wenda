/**
 * 问搭 · 云函数 qa
 *
 * 集合：
 *   questions  问题
 *   answers    回答
 *   users      用户
 *   votes      投票（questionId + optionKey + openid 唯一）
 *   reports    举报
 *
 * action 列表：
 *   bootstrap       初始化：返回当前用户，不存在则创建
 *   listQuestions   分页拉取问题
 *   getQuestion     问题详情 + 回答列表
 *   createQuestion  发布问题
 *   addAnswer       发布回答
 *   vote            选项投票
 *   adopt           采纳回答
 *   like            回答点赞
 *   mine            我的数据
 *   report          举报
 *   track           事件埋点（批量）
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const dbCmd = db.command;
const QUESTION = 'questions';
const ANSWER = 'answers';
const USER = 'users';
const VOTE = 'votes';
const REPORT = 'reports';
const EVENT = 'events';

const CATEGORIES = {
  eat: { key: 'eat', name: '吃什么', icon: '🍜', color: '#FF7A45' },
  wear: { key: 'wear', name: '穿什么', icon: '👕', color: '#597EF7' },
  play: { key: 'play', name: '去哪玩', icon: '🎈', color: '#36CFC9' },
  kid: { key: 'kid', name: '带孩子', icon: '🧸', color: '#9254DE' },
  gift: { key: 'gift', name: '送什么', icon: '🎁', color: '#EB2F96' },
  buy: { key: 'buy', name: '买不买', icon: '🛒', color: '#52C41A' },
};

/** 内容安全检测（命中即拒绝，异步复审交给后台） */
async function checkText(text, openid) {
  if (!text) return { ok: true };
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      content: text,
      version: 2,
      scene: 2,
      openid,
    });
    if (res.result && res.result.suggest === 'risky') {
      return { ok: false, reason: '内容包含违规信息，请修改后再发布' };
    }
  } catch (e) {
    // 审核接口异常时放行，交给人工复审，避免误伤正常用户
    console.warn('[问搭] 内容安全检测异常，放行:', e.message);
  }
  return { ok: true };
}

function ok(data) {
  return { code: 0, data };
}
function fail(message) {
  return { code: 1, message };
}

async function getOrCreateUser(openid) {
  const res = await db.collection(USER).where({ _id: openid }).limit(1).get();
  if (res.data && res.data.length) return res.data[0];
  const user = {
    _id: openid,
    openid,
    nickname: '问搭用户' + openid.slice(-4),
    avatarText: openid.slice(-2),
    city: '未知',
    points: 0,
    answerCount: 0,
    adoptCount: 0,
    role: 'user',
    createdAt: db.serverDate(),
  };
  await db.collection(USER).add({ data: user });
  return user;
}

/** 计算问题热度分 */
function calcHeat(q) {
  const hoursOld = (Date.now() - (q.createdAt instanceof Date ? q.createdAt.getTime() : q.createdAt || Date.now())) / 3600000;
  const decay = Math.max(0.35, 1 - hoursOld / 720);
  const pendingBoost = q.status === 'pending' ? 12 : 0;
  return Math.round(((q.totalVotes || 0) * 3 + (q.answerCount || 0) * 6 + 20 + pendingBoost) * decay * 10) / 10;
}

const handlers = {
  // ---------- 初始化 ----------
  async bootstrap(event, openid) {
    const user = await getOrCreateUser(openid);
    return ok({ user });
  },

  // ---------- 问题列表 ----------
  async listQuestions(event, openid) {
    const { cat = 'all', sort = 'hot', page = 1, size = 10 } = event;
    const where = { status: _.neq('hidden') };
    if (cat === 'pending') {
      where.status = 'pending';
    } else if (cat !== 'all') {
      where.cat = cat;
    }

    const skip = (page - 1) * size;
    let query = db.collection(QUESTION).where(where);
    if (sort === 'new') {
      query = query.orderBy('createdAt', 'desc');
    } else {
      query = query.orderBy('heat', 'desc').orderBy('createdAt', 'desc');
    }
    const res = await query.skip(skip).limit(size).get();
    const totalRes = await db.collection(QUESTION).where(where).count();

    return ok({
      list: res.data,
      total: totalRes.total,
      hasMore: skip + size < totalRes.total,
    });
  },

  // ---------- 问题详情 ----------
  async getQuestion(event, openid) {
    const { id } = event;
    if (!id) return fail('缺少问题 id');
    const qRes = await db.collection(QUESTION).where({ _id: id }).limit(1).get();
    if (!qRes.data.length) return fail('问题不存在');
    const aRes = await db
      .collection(ANSWER)
      .where({ questionId: id, status: 'normal' })
      .orderBy('adopted', 'desc')
      .orderBy('likes', 'desc')
      .limit(50)
      .get();

    // 标记当前用户是否点过赞
    const answerIds = aRes.data.map((a) => a._id);
    let likedIds = [];
    if (answerIds.length) {
      const lRes = await db
        .collection(VOTE)
        .where({ openid, answerId: dbCmd.in(answerIds), type: 'like' })
        .get();
      likedIds = lRes.data.map((v) => v.answerId);
    }

    return ok({
      question: qRes.data[0],
      answers: aRes.data.map((a) => ({ ...a, liked: likedIds.includes(a._id) })),
    });
  },

  // ---------- 发布问题 ----------
  async createQuestion(event, openid) {
    const { cat, title, desc = '', options = [], anonymous = false } = event;
    if (!CATEGORIES[cat]) return fail('分类不合法');
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return fail('请填写问题');
    if (cleanTitle.length > 50) return fail('问题不能超过 50 字');
    const cleanDesc = String(desc || '').trim().slice(0, 300);

    const sec = await checkText(cleanTitle + cleanDesc, openid);
    if (!sec.ok) return fail(sec.reason);

    const user = await getOrCreateUser(openid);
    const now = Date.now();
    const opts = (options || [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .slice(0, 6)
      .map((text, i) => ({ key: 'o' + (i + 1), text, votes: 0, isRecommend: false }));

    const q = {
      _id: 'q_' + now + '_' + openid.slice(-4),
      cat,
      catName: CATEGORIES[cat].name,
      title: cleanTitle,
      desc: cleanDesc,
      images: [],
      options: opts,
      totalVotes: 0,
      answerCount: 0,
      adopted: false,
      adoptedAnswerId: null,
      asker: {
        _id: openid,
        nickname: anonymous ? '匿名用户' : user.nickname,
        avatarText: anonymous ? '匿' : user.avatarText,
      },
      city: user.city || '未知',
      status: 'pending',
      anonymous: !!anonymous,
      createdAt: now,
      updatedAt: now,
      heat: calcHeat({ totalVotes: 0, answerCount: 0, status: 'pending', createdAt: now }),
    };

    await db.collection(QUESTION).add({ data: q });
    return ok({ question: q });
  },

  // ---------- 发布回答 ----------
  async addAnswer(event, openid) {
    const { questionId, content, recommendOption = null } = event;
    if (!questionId) return fail('缺少问题 id');
    const clean = String(content || '').trim();
    if (!clean) return fail('回答不能为空');
    if (clean.length > 500) return fail('回答不能超过 500 字');

    const sec = await checkText(clean, openid);
    if (!sec.ok) return fail(sec.reason);

    const qRes = await db.collection(QUESTION).where({ _id: questionId }).limit(1).get();
    if (!qRes.data.length) return fail('问题不存在');
    const q = qRes.data[0];

    const user = await getOrCreateUser(openid);
    const now = Date.now();
    const ans = {
      _id: 'a_' + now + '_' + openid.slice(-4),
      questionId,
      author: { _id: openid, nickname: user.nickname, avatarText: user.avatarText, city: user.city || '未知' },
      content: clean,
      recommendOption: recommendOption || null,
      likes: 0,
      adopted: false,
      status: 'normal',
      createdAt: now,
    };
    await db.collection(ANSWER).add({ data: ans });

    // 更新问题的回答数与状态
    const newAnswerCount = (q.answerCount || 0) + 1;
    const update = {
      answerCount: newAnswerCount,
      updatedAt: now,
      status: q.status === 'pending' ? 'answered' : q.status,
    };
    update.heat = calcHeat({ ...q, answerCount: newAnswerCount });
    await db.collection(QUESTION).where({ _id: questionId }).update({ data: update });

    // 回答者积分 +5
    await db.collection(USER).where({ _id: openid }).update({
      data: { points: _.inc(5), answerCount: _.inc(1) },
    });

    return ok({ answer: ans });
  },

  // ---------- 选项投票 ----------
  async vote(event, openid) {
    const { questionId, optionKey } = event;
    if (!questionId || !optionKey) return fail('参数不完整');

    const qRes = await db.collection(QUESTION).where({ _id: questionId }).limit(1).get();
    if (!qRes.data.length) return fail('问题不存在');
    const q = qRes.data[0];
    const opt = (q.options || []).find((o) => o.key === optionKey);
    if (!opt) return fail('选项不存在');

    // 幂等：同一用户同一问题只投一次
    const exist = await db
      .collection(VOTE)
      .where({ openid, questionId, type: 'option' })
      .limit(1)
      .get();
    if (exist.data.length) return fail('你已经投过票了');

    await db.collection(VOTE).add({
      data: { openid, questionId, optionKey, type: 'option', createdAt: Date.now() },
    });

    const newOptions = q.options.map((o) =>
      o.key === optionKey ? { ...o, votes: (o.votes || 0) + 1 } : o
    );
    const totalVotes = newOptions.reduce((s, o) => s + (o.votes || 0), 0);
    const update = { options: newOptions, totalVotes };
    update.heat = calcHeat({ ...q, totalVotes });
    await db.collection(QUESTION).where({ _id: questionId }).update({ data: update });

    return ok({ question: { ...q, options: newOptions, totalVotes } });
  },

  // ---------- 采纳 ----------
  async adopt(event, openid) {
    const { questionId, answerId } = event;
    if (!questionId || !answerId) return fail('参数不完整');

    const qRes = await db.collection(QUESTION).where({ _id: questionId }).limit(1).get();
    if (!qRes.data.length) return fail('问题不存在');
    const q = qRes.data[0];

    // 只有提问者能采纳
    if (q.asker && q.asker._id && q.asker._id !== openid) {
      return fail('只有提问者可以采纳');
    }
    if (q.adopted) return fail('该问题已经采纳过了');

    const aRes = await db.collection(ANSWER).where({ _id: answerId, questionId }).limit(1).get();
    if (!aRes.data.length) return fail('回答不存在');
    const answer = aRes.data[0];

    await db.collection(ANSWER).where({ questionId }).update({ data: { adopted: false } });
    await db.collection(ANSWER).where({ _id: answerId }).update({ data: { adopted: true } });

    const update = {
      adopted: true,
      adoptedAnswerId: answerId,
      status: 'adopted',
      updatedAt: Date.now(),
    };
    update.heat = calcHeat({ ...q, status: 'adopted' });
    await db.collection(QUESTION).where({ _id: questionId }).update({ data: update });

    // 被采纳的回答者加分
    if (answer.author && answer.author._id && answer.author._id !== openid) {
      await db.collection(USER).where({ _id: answer.author._id }).update({
        data: { points: _.inc(10), adoptCount: _.inc(1) },
      });
    }

    return ok({ question: { ...q, ...update } });
  },

  // ---------- 点赞 ----------
  async like(event, openid) {
    const { answerId } = event;
    if (!answerId) return fail('缺少回答 id');

    const aRes = await db.collection(ANSWER).where({ _id: answerId }).limit(1).get();
    if (!aRes.data.length) return fail('回答不存在');
    const ans = aRes.data[0];

    const exist = await db
      .collection(VOTE)
      .where({ openid, answerId, type: 'like' })
      .limit(1)
      .get();

    if (exist.data.length) {
      await db.collection(VOTE).where({ openid, answerId, type: 'like' }).remove();
      const likes = Math.max(0, (ans.likes || 0) - 1);
      await db.collection(ANSWER).where({ _id: answerId }).update({ data: { likes } });
      return ok({ likes, liked: false });
    }

    await db.collection(VOTE).add({
      data: { openid, answerId, type: 'like', createdAt: Date.now() },
    });
    const likes = (ans.likes || 0) + 1;
    await db.collection(ANSWER).where({ _id: answerId }).update({ data: { likes } });
    return ok({ likes, liked: true });
  },

  // ---------- 我的 ----------
  async mine(event, openid) {
    const user = await getOrCreateUser(openid);
    const qRes = await db.collection(QUESTION).where({ 'asker._id': openid }).limit(100).get();
    const aRes = await db.collection(ANSWER).where({ 'author._id': openid }).limit(100).get();
    return ok({
      user,
      myQuestions: qRes.data,
      myAnswers: aRes.data,
      stats: {
        questionCount: qRes.data.length,
        answerCount: aRes.data.length,
        adoptCount: aRes.data.filter((a) => a.adopted).length,
      },
    });
  },

  // ---------- 举报 ----------
  async report(event, openid) {
    const { targetId, targetType = 'question', reason = '' } = event;
    if (!targetId) return fail('缺少举报对象');
    await db.collection(REPORT).add({
      data: {
        targetId,
        targetType,
        reason: String(reason).slice(0, 200),
        openid,
        status: 'pending',
        createdAt: Date.now(),
      },
    });
    return ok({ reported: true });
  },

  // ---------- 事件埋点（批量） ----------
  async track(event, openid) {
    const { events = [] } = event;
    if (!Array.isArray(events) || !events.length) return ok({ tracked: 0 });
    // 单次上限，防止被滥用写入海量数据
    const batch = events.slice(0, 50);
    const docs = batch.map((e) => ({
      event: String(e.event || 'unknown').slice(0, 40),
      targetId: String(e.targetId || '').slice(0, 64),
      params: e.params && typeof e.params === 'object' ? e.params : {},
      openid: openid || '',
      createdAt: e.createdAt || Date.now(),
    }));
    await db.collection(EVENT).add({ data: docs });
    return ok({ tracked: docs.length });
  },
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  if (!action) return fail('缺少 action');

  // 审核后台专用 action：需要 openid 在运营白名单内
  if (action === 'adminList' || action === 'adminHide' || action === 'adminStats') {
    const user = await getOrCreateUser(OPENID);
    if (user.role !== 'admin' && user.role !== 'ops') {
      return fail('无权限');
    }
    return adminHandlers[action](event, OPENID);
  }

  const handler = handlers[action];
  if (!handler) return fail(`未知 action: ${action}`);

  try {
    return await handler(event, OPENID);
  } catch (err) {
    console.error(`[问搭] ${action} 执行失败:`, err);
    return fail(err.message || '服务异常');
  }
};

// ---------- 审核后台接口 ----------
const adminHandlers = {
  async adminList(event) {
    const { status = '', page = 1, size = 20 } = event;
    const where = {};
    if (status) where.status = status;
    const res = await db
      .collection(QUESTION)
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * size)
      .limit(size)
      .get();
    return ok({ list: res.data });
  },

  async adminHide(event) {
    const { id, status = 'hidden' } = event;
    if (!id) return fail('缺少 id');
    await db.collection(QUESTION).where({ _id: id }).update({ data: { status } });
    return ok({ id, status });
  },

  async adminStats() {
    const [q, a, u, pending] = await Promise.all([
      db.collection(QUESTION).count(),
      db.collection(ANSWER).count(),
      db.collection(USER).count(),
      db.collection(QUESTION).where({ status: 'pending' }).count(),
    ]);
    return ok({
      questionCount: q.total,
      answerCount: a.total,
      userCount: u.total,
      pendingCount: pending.total,
    });
  },
};

void _;
void dbCmd;
