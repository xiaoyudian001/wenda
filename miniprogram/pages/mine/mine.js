const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

Page({
  data: {
    user: {},
    stats: {},
    myQuestions: [],
    myAnswers: [],
    adoptedAnswers: [],
    tab: 'questions',
    favoriteCount: 0,
    pendingCount: 0,
  },

  onShow() {
    tracker.track(tracker.EVENTS.APP_OPEN, '', { page: 'mine' });
    this.loadMine();
  },

  loadMine() {
    api
      .mine()
      .then((res) => {
        const myQuestions = (res.myQuestions || []).map((q) => ({
          ...q,
          catName: q.catName || util.categoryMeta(q.cat, api.CATEGORIES).name,
        }));
        const localTitleMap = this.answerTitleMap(res);
        const myAnswers = (res.myAnswers || []).map((a) => ({
          ...a,
          timeText: util.timeAgo(a.createdAt),
          // 云端/m​​ock 统一返回 questionTitle；旧数据仍用本地提问映射兜底
          title: a.questionTitle || localTitleMap[a.questionId] || '',
          avatarCls: util.avatarClass(a.author && a.author._id),
        }));
        this.setData({
          user: res.user || {},
          stats: res.stats || {},
          myQuestions,
          myAnswers,
          adoptedAnswers: myAnswers.filter((a) => a.adopted),
          pendingCount: myQuestions.filter((q) => !q.adopted).length,
        });
        this.loadFavoriteCount();
      })
      .catch((err) => {
        console.error('[问搭] 加载我的数据失败:', err);
      });
  },

  /** 回答列表需要带上问题标题 */
  answerTitleMap(res) {
    const map = {};
    (res.myQuestions || []).forEach((q) => {
      map[q._id] = q.title;
    });
    return map;
  },

  loadFavoriteCount() {
    api
      .myFavorites()
      .then((res) => this.setData({ favoriteCount: res.total || 0 }))
      .catch(() => {});
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  onOpenDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}` });
  },

  onSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  onMenu(e) {
    const name = e.currentTarget.dataset.name;
    const routes = {
      我的收藏: '/pages/favorites/favorites',
      决策复盘: '/pages/review/review',
      设置: '/pages/settings/settings',
      隐私与安全: '/pages/settings/settings',
      意见反馈: '/pages/settings/settings',
    };
    const url = routes[name];
    if (!url) {
      util.toast(`${name} 暂未开放`);
      return;
    }
    if (name === '隐私与安全' || name === '意见反馈') {
      // 这两项在设置页里已有对应内容，带参跳过去
      wx.navigateTo({ url: `${url}?focus=${encodeURIComponent(name)}` });
      return;
    }
    wx.navigateTo({ url });
  },

  onReset() {
    wx.showModal({
      title: '重置本地数据？',
      content: '会清除本地演示时产生的数据，恢复到初始种子内容。',
      success: (res) => {
        if (!res.confirm) return;
        api.resetMock();
        this.loadMine();
        util.toast('已重置');
      },
    });
  },
});
