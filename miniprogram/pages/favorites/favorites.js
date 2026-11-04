const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

Page({
  data: {
    list: [],
    total: 0,
    loading: false,
  },

  onShow() {
    tracker.track(tracker.EVENTS.LIST_VIEW, '', { page: 'favorites' });
    this.loadFavorites();
  },

  loadFavorites() {
    this.setData({ loading: true });
    api
      .myFavorites()
      .then((res) => {
        const list = (res.list || []).map((q) => ({
          ...q,
          catName: q.catName || util.categoryMeta(q.cat, api.CATEGORIES).name,
        }));
        this.setData({ list, total: res.total || list.length });
      })
      .catch((err) => {
        console.error('[问搭] 加载收藏失败:', err);
        util.toast('加载失败');
      })
      .finally(() => this.setData({ loading: false }));
  },

  onOpenDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}` });
  },

  onUnfavorite(e) {
    const id = e.detail.id;
    wx.showModal({
      title: '取消收藏？',
      content: '取消后可以随时再收藏回来。',
      success: (res) => {
        if (!res.confirm) return;
        api
          .toggleFavorite(id)
          .then(() => {
            util.toast('已取消收藏');
            this.loadFavorites();
          })
          .catch(() => util.toast('操作失败'));
      },
    });
  },
});
