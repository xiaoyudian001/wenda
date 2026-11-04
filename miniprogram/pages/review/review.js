const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

Page({
  data: {
    stat: {},
    decidedQuestions: [],
  },

  onShow() {
    tracker.track(tracker.EVENTS.LIST_VIEW, '', { page: 'review' });
    this.loadReview();
  },

  loadReview() {
    api
      .myDecisions()
      .then((res) => {
        const stat = {
          totalQuestions: res.totalQuestions || 0,
          totalAnswers: res.totalAnswers || 0,
          decidedCount: res.decidedCount || 0,
          pendingCount: res.pendingCount || 0,
          adoptedCount: res.adoptedCount || 0,
          likedCount: res.likedCount || 0,
          reasonRate: res.reasonRate || 0,
        };
        const decidedQuestions = (res.decidedQuestions || []).map((q) => ({
          ...q,
          catName: q.catName || util.categoryMeta(q.cat, api.CATEGORIES).name,
        }));
        this.setData({ stat, decidedQuestions });
      })
      .catch((err) => {
        console.error('[问搭] 加载复盘失败:', err);
        util.toast('加载失败');
      });
  },

  onOpenDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}` });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
