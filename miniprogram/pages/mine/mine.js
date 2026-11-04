const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

Page({
  data: {
    user: {},
    stats: {},
    myQuestions: [],
  },

  onShow() {
    tracker.track(tracker.EVENTS.APP_OPEN, '', { page: 'mine' });
    this.loadMine();
  },

  loadMine() {
    api
      .mine()
      .then((res) => {
        this.setData({
          user: res.user || {},
          stats: res.stats || {},
          myQuestions: res.myQuestions || [],
        });
      })
      .catch((err) => {
        console.error('[问搭] 加载我的数据失败:', err);
      });
  },

  onOpenDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}` });
  },

  onMenu(e) {
    util.toast(`${e.currentTarget.dataset.name}（V2 规划中）`);
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
