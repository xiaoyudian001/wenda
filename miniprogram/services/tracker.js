/**
 * 问搭 · 事件埋点
 *
 * 设计要点：
 *   1. 异步上报，绝不阻塞 UI —— 埋点失败不影响主流程
 *   2. 云函数不可用时（mock 模式）落到本地缓存，等有网时再补报
 *   3. 批量上报：攒够 N 条或超过 T 秒才发送，减少请求数
 *   4. 事件名集中定义，避免各处硬编码字符串拼错
 *
 * 事件清单见 docs/METRICS.md「事件清单」
 */

/** 事件名常量 */
const EVENTS = {
  APP_OPEN: 'app_open',
  LIST_VIEW: 'question_list_view',
  DETAIL_VIEW: 'question_view',
  QUESTION_PUBLISH: 'question_publish',
  OPTION_VOTE: 'option_vote',
  ANSWER_PUBLISH: 'answer_publish',
  ANSWER_LIKE: 'answer_like',
  ANSWER_ADOPT: 'answer_adopt',
  SHARE_CLICK: 'share_click',
  SHARE_ENTER: 'share_enter',
};

const BUFFER_KEY = 'wenda_track_buffer_v1';
const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 15000;

/** 待上报队列 */
let buffer = [];
let flushTimer = null;

function loadBuffer() {
  if (buffer.length) return;
  try {
    const cached = wx.getStorageSync(BUFFER_KEY);
    if (cached && Array.isArray(cached)) buffer = cached;
  } catch (e) {
    /* 忽略 */
  }
}

function saveBuffer() {
  try {
    wx.setStorageSync(BUFFER_KEY, buffer.slice(-200)); // 最多留 200 条，防止无限增长
  } catch (e) {
    /* 忽略 */
  }
}

/**
 * 记录一个事件
 * @param {string} event 事件名（用 EVENTS 常量）
 * @param {string} [targetId] 关联对象 id
 * @param {object} [params] 附加参数
 */
function track(event, targetId, params) {
  const app = getApp();
  const openid = (app && app.globalData && app.globalData.openid) || '';

  const record = {
    event,
    targetId: targetId || '',
    params: params || {},
    openid,
    createdAt: Date.now(),
  };

  // 开发环境打印，方便自测
  if (app && app.globalData && app.globalData.debugTrack) {
    console.log('[问搭][埋点]', event, targetId || '', params || '');
  }

  buffer.push(record);
  saveBuffer();

  if (buffer.length >= BATCH_SIZE) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL);
  }
}

/** 批量上报 */
function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!buffer.length) return;

  const app = getApp();
  const useMock = !app || !app.globalData || app.globalData.useMock !== false;

  if (useMock) {
    // 没有云环境，留在本地，等接通后再补报
    return;
  }

  const batch = buffer.slice();
  buffer = [];
  saveBuffer();

  wx.cloud.callFunction({
    name: 'qa',
    data: { action: 'track', events: batch },
    fail(err) {
      // 上报失败放回队列，下次重试（最多回退 50 条，避免无限膨胀）
      buffer = batch.concat(buffer).slice(0, 50);
      saveBuffer();
      console.warn('[问搭] 埋点上报失败，已缓存待重试:', err.message);
    },
  });
}

/** 页面首次展示时调用 */
function trackPage(name) {
  track(EVENTS.LIST_VIEW, '', { page: name });
}

module.exports = {
  EVENTS,
  track,
  flush,
  trackPage,
  /** 仅供调试：查看当前队列 */
  _peek() {
    loadBuffer();
    return buffer.slice();
  },
};
