const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

const CATS = [
  { key: 'all', name: '全部', icon: '✨' },
  { key: 'eat', name: '吃什么', icon: '🍜' },
  { key: 'wear', name: '穿什么', icon: '👕' },
  { key: 'play', name: '去哪玩', icon: '🎈' },
  { key: 'kid', name: '带孩子', icon: '🧸' },
  { key: 'gift', name: '送什么', icon: '🎁' },
  { key: 'buy', name: '买不买', icon: '🛒' },
  { key: 'pending', name: '待回答', icon: '⏳' },
];

Page({
  data: {
    cats: CATS,
    cat: 'all',
    sort: 'hot',
    list: [],
    page: 1,
    hasMore: false,
    loading: false,
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    tracker.track(tracker.EVENTS.APP_OPEN, '', { page: 'index', cat: this.data.cat });
  },

  onPullDownRefresh() {
    this.setData({ page: 1 });
    this.loadData().then(() => wx.stopPullDownRefresh());
  },

  loadData() {
    if (this.data.loading) return Promise.resolve();
    this.setData({ loading: true });
    const { cat, sort, page } = this.data;
    return api
      .listQuestions({ cat, sort: sort === 'pending' ? 'hot' : sort, page, size: 10 })
      .then((res) => {
        const list = res.list || [];
        this.setData({
          list: page === 1 ? list : this.data.list.concat(list),
          hasMore: !!res.hasMore,
          page: page + 1,
        });
      })
      .catch((err) => {
        console.error('[问搭] 加载问题列表失败:', err);
        util.toast('加载失败，请重试');
      })
      .finally(() => this.setData({ loading: false }));
  },

  onCat(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ cat: key, page: 1, list: [] });
    tracker.track(tracker.EVENTS.LIST_VIEW, '', { cat: key });
    this.loadData();
  },

  onSort(e) {
    const sort = e.currentTarget.dataset.sort;
    this.setData({ sort, page: 1, list: [] });
    this.loadData();
  },

  onLoadMore() {
    this.loadData();
  },

  onOpenDetail(e) {
    tracker.track(tracker.EVENTS.DETAIL_VIEW, e.detail.id, { cat: this.data.cat });
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}` });
  },

  onCompose() {
    wx.switchTab({ url: '/pages/ask/ask' });
  },

  onShareAppMessage() {
    tracker.track(tracker.EVENTS.SHARE_CLICK, '', { page: 'index' });
    return {
      title: '问搭 · 把选择困难交给别人',
      path: '/pages/index/index',
    };
  },
});
