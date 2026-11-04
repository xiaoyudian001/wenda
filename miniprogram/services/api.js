/**
 * 问搭 · 数据服务层
 *
 * 设计要点：云函数不可用时自动降级到本地 mock，
 * 保证小程序在任何环境都能跑通全部交互（方便产品验证与演示）。
 *
 * 对外 API 全部返回 Promise，页面层不需要关心底层是云还是 mock。
 */
// 注意两点：
// 1) 微信小程序运行时的 require 不支持 .json 文件，只能引入 .js 模块
// 2) 路径是 ../data/seed.js（相对本文件所在目录 miniprogram/services/）
// 写成 ../../data/... 会解析到项目根目录，导致真机运行报模块找不到
const seedData = require('../data/seed.js');

const PAGE_SIZE = 10;

/** 本地 mock 存储（内存 + 本地缓存） */
const STORE_KEY = 'wenda_mock_store_v1';

function loadMockStore() {
  try {
    const cached = wx.getStorageSync(STORE_KEY);
    if (cached && cached.questions && cached.questions.length) return cached;
  } catch (e) {
    console.warn('[问搭] 读取本地缓存失败，使用内置种子数据', e);
  }
  // 深拷贝，避免污染 require 进来的种子数据
  return JSON.parse(JSON.stringify({
    questions: seedData.questions,
    answers: seedData.answers,
    users: seedData.users,
  }));
}

function saveMockStore(store) {
  try {
    wx.setStorageSync(STORE_KEY, store);
  } catch (e) {
    console.warn('[问搭] 保存本地缓存失败', e);
  }
}

let mockStore = null;

function getStore() {
  if (!mockStore) mockStore = loadMockStore();
  return mockStore;
}

function me() {
  const store = getStore();
  if (!store.me) {
    store.me = {
      _id: 'me',
      openid: 'mock_openid',
      nickname: '我',
      avatarText: '我',
      city: '上海',
      points: 120,
      answerCount: 0,
      adoptCount: 0,
    };
  }
  return store.me;
}

/** 云函数调用封装（带超时，避免无云环境时挂起） */
function callCloud(action, payload) {
  return new Promise((resolve, reject) => {
    if (typeof wx.cloud === 'undefined') {
      reject(new Error('no-cloud'));
      return;
    }
    wx.cloud.callFunction({
      name: 'qa',
      data: Object.assign({ action }, payload || {}),
      timeout: 8000,
      success(res) {
        const r = res.result || {};
        if (r.code === 0) resolve(r.data);
        else reject(new Error(r.message || '云函数返回异常'));
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

/** mock 版：分页拉取问题 */
function mockListQuestions(params) {
  const { cat = 'all', sort = 'hot', page = 1, size = PAGE_SIZE } = params;
  const store = getStore();
  let list = store.questions.slice();
  if (cat === 'pending') {
    list = list.filter((q) => q.status === 'pending');
  } else if (cat !== 'all') {
    list = list.filter((q) => q.cat === cat);
  }
  if (sort === 'new') list.sort((a, b) => b.createdAt - a.createdAt);
  else list.sort((a, b) => (b.heat || 0) - (a.heat || 0));

  const start = (page - 1) * size;
  return {
    list: list.slice(start, start + size),
    total: list.length,
    hasMore: start + size < list.length,
  };
}

/** mock 版：问题详情 + 回答 */
function mockGetQuestion(id) {
  const store = getStore();
  const q = store.questions.find((x) => x._id === id);
  if (!q) return null;
  const answers = store.answers
    .filter((a) => a.questionId === id)
    .sort((a, b) => {
      if (!!a.adopted !== !!b.adopted) return a.adopted ? -1 : 1;
      return (b.likes || 0) - (a.likes || 0);
    });
  return { question: q, answers };
}

/** mock 版：投票 */
function mockVote(questionId, optionKey) {
  const store = getStore();
  const q = store.questions.find((x) => x._id === questionId);
  if (!q) throw new Error('问题不存在');
  const opt = (q.options || []).find((o) => o.key === optionKey);
  if (!opt) throw new Error('选项不存在');
  opt.votes = (opt.votes || 0) + 1;
  q.totalVotes = (q.totalVotes || 0) + 1;
  saveMockStore(store);
  return { question: q };
}

/** mock 版：提交回答 */
function mockAddAnswer(questionId, content, recommendOption) {
  const store = getStore();
  const q = store.questions.find((x) => x._id === questionId);
  if (!q) throw new Error('问题不存在');
  const u = me();
  const ans = {
    _id: 'a_local_' + Date.now(),
    questionId,
    author: { _id: u._id, nickname: u.nickname, avatarText: u.avatarText, city: u.city },
    content,
    recommendOption: recommendOption || null,
    likes: 0,
    adopted: false,
    status: 'normal',
    createdAt: Date.now(),
  };
  store.answers.push(ans);
  q.answerCount = (q.answerCount || 0) + 1;
  q.updatedAt = Date.now();
  if (q.status === 'pending') q.status = 'answered';
  u.answerCount = (u.answerCount || 0) + 1;
  u.points = (u.points || 0) + 5;
  saveMockStore(store);
  return { answer: ans };
}

/** mock 版：发布问题 */
function mockCreateQuestion(payload) {
  const store = getStore();
  const u = me();
  const now = Date.now();
  const options = (payload.options || [])
    .filter((t) => t && t.trim())
    .map((t, i) => ({ key: 'o' + (i + 1), text: t.trim(), votes: 0, isRecommend: false }));
  const q = {
    _id: 'q_local_' + now,
    cat: payload.cat,
    catName: (payload.catName || ''),
    title: payload.title,
    desc: payload.desc || '',
    images: [],
    options,
    totalVotes: 0,
    answerCount: 0,
    adopted: false,
    adoptedAnswerId: null,
    asker: { _id: u._id, nickname: u.nickname, avatarText: u.avatarText },
    city: u.city,
    status: 'pending',
    anonymous: !!payload.anonymous,
    createdAt: now,
    updatedAt: now,
    heat: 20,
  };
  store.questions.unshift(q);
  saveMockStore(store);
  return { question: q };
}

/** mock 版：采纳 */
function mockAdopt(questionId, answerId) {
  const store = getStore();
  const q = store.questions.find((x) => x._id === questionId);
  if (!q) throw new Error('问题不存在');
  const ans = store.answers.find((a) => a._id === answerId);
  if (!ans) throw new Error('回答不存在');
  q.adopted = true;
  q.status = 'adopted';
  q.adoptedAnswerId = answerId;
  store.answers.forEach((a) => {
    if (a.questionId === questionId) a.adopted = a._id === answerId;
  });
  saveMockStore(store);
  return { question: q };
}

/** mock 版：我的数据 */
function mockMine() {
  const store = getStore();
  const u = me();
  const myQuestions = store.questions.filter((q) => q.asker && q.asker._id === u._id);
  const myAnswers = store.answers.filter((a) => a.author && a.author._id === u._id);
  return {
    user: u,
    myQuestions,
    myAnswers,
    stats: {
      questionCount: myQuestions.length,
      answerCount: myAnswers.length,
      adoptCount: myAnswers.filter((a) => a.adopted).length,
    },
  };
}

/** mock 版：点赞 */
function mockLike(answerId) {
  const store = getStore();
  const ans = store.answers.find((a) => a._id === answerId);
  if (!ans) throw new Error('回答不存在');
  const liked = store.liked || (store.liked = {});
  if (liked[answerId]) {
    ans.likes = Math.max(0, (ans.likes || 0) - 1);
    delete liked[answerId];
  } else {
    ans.likes = (ans.likes || 0) + 1;
    liked[answerId] = 1;
  }
  saveMockStore(store);
  return { likes: ans.likes, liked: !!liked[answerId] };
}

/**
 * 统一入口：优先云函数，失败自动降级 mock。
 * @param {string} action 云函数 action
 * @param {object} payload 参数
 * @param {function} mockFn mock 实现
 */
async function request(action, payload, mockFn) {
  const app = getApp();
  if (app && app.globalData && app.globalData.useMock === false) {
    try {
      return await callCloud(action, payload);
    } catch (err) {
      console.warn(`[问搭] 云函数 ${action} 失败，降级 mock:`, err.message);
      app.globalData.useMock = true;
    }
  }
  return mockFn();
}

module.exports = {
  CATEGORIES: seedData.categories,

  listQuestions(params) {
    return request('listQuestions', params, () => mockListQuestions(params));
  },

  getQuestion(id) {
    return request('getQuestion', { id }, () => mockGetQuestion(id));
  },

  vote(questionId, optionKey) {
    return request('vote', { questionId, optionKey }, () => mockVote(questionId, optionKey));
  },

  addAnswer(questionId, content, recommendOption) {
    return request('addAnswer', { questionId, content, recommendOption }, () =>
      mockAddAnswer(questionId, content, recommendOption)
    );
  },

  createQuestion(payload) {
    return request('createQuestion', payload, () => mockCreateQuestion(payload));
  },

  adopt(questionId, answerId) {
    return request('adopt', { questionId, answerId }, () => mockAdopt(questionId, answerId));
  },

  like(answerId) {
    return request('like', { answerId }, () => mockLike(answerId));
  },

  mine() {
    return request('mine', {}, () => mockMine());
  },

  /** 重置本地数据（开发调试用） */
  resetMock() {
    mockStore = null;
    try {
      wx.removeStorageSync(STORE_KEY);
    } catch (e) {
      console.warn(e);
    }
    return true;
  },
};
