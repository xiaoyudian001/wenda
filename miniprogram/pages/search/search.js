const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

Page({
  data: {
    keyword: '',
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    loading: false,
    searched: false,
  },

  onLoad(options) {
    const kw = options.keyword || '';
    if (kw) {
      this.setData({ keyword: kw });
      this.doSearch();
    }
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onConfirm() {
    this.doSearch();
  },

  onClear() {
    this.setData({ keyword: '', list: [], total: 0, searched: false, page: 1 });
  },

  doSearch() {
    const keyword = (this.data.keyword || '').trim();
    if (!keyword) {
      util.toast('输入点什么再搜');
      return;
    }
    tracker.track(tracker.EVENTS.LIST_VIEW, '', { page: 'search', keyword });
    this.setData({ loading: true, page: 1 });
    api
      .searchQuestions({ keyword, page: 1, size: 20 })
      .then((res) => {
        const list = (res.list || []).map((q) => ({
          ...q,
          catName: q.catName || util.categoryMeta(q.cat, api.CATEGORIES).name,
        }));
        this.setData({
          list,
          total: res.total || list.length,
          hasMore: !!res.hasMore,
          page: 2,
          searched: true,
        });
      })
      .catch((err) => {
        console.error('[问搭] 搜索失败:', err);
        util.toast('搜索失败');
      })
      .finally(() => this.setData({ loading: false }));
  },

  onLoadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });
    api
      .searchQuestions({ keyword: this.data.keyword.trim(), page: this.data.page, size: 20 })
      .then((res) => {
        const more = (res.list || []).map((q) => ({
          ...q,
          catName: q.catName || util.categoryMeta(q.cat, api.CATEGORIES).name,
        }));
        this.setData({
          list: this.data.list.concat(more),
          hasMore: !!res.hasMore,
          page: this.data.page + 1,
        });
      })
      .catch(() => util.toast('加载失败'))
      .finally(() => this.setData({ loading: false }));
  },

  onOpenDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}` });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
