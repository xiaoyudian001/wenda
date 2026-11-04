const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

const TYPE_META = {
  answer: { icon: '💬', text: '回答了你的问题' },
  adopt: { icon: '🏆', text: '采纳了你的回答' },
  like: { icon: '👍', text: '赞了你的回答' },
  system: { icon: '🔔', text: '系统消息' },
};

Page({
  data: {
    list: [],
    unreadCount: 0,
    page: 1,
    hasMore: false,
    loading: false,
    allRead: false,
  },

  onShow() {
    util.guard(this); // 页面卸载后不再 setData
    tracker.track(tracker.EVENTS.LIST_VIEW, '', { page: 'notifications' });
    this.refresh();
  },

  /** 重新从第一页拉取（每次进入页面都刷新，避免重复追加） */
  refresh() {
    this.setData({ page: 1, list: [], hasMore: false });
    return this.load();
  },

  load() {
    if (this.data.loading) return Promise.resolve();
    this.setData({ loading: true });
    const page = this.data.page;
    return api
      .listNotifications({ page, size: 20 })
      .then((res) => {
        const list = (res.list || []).map((n) => {
          const meta = TYPE_META[n.type] || TYPE_META.system;
          return {
            ...n,
            icon: meta.icon,
            typeText: meta.text,
            timeText: util.timeAgo(n.createdAt),
          };
        });
        this.setData({
          list: page === 1 ? list : this.data.list.concat(list),
          hasMore: !!res.hasMore,
          page: page + 1,
        });
        // 拉取后自动把本页标记已读，并同步刷新未读数
        const ids = list.filter((n) => !n.read).map((n) => n._id);
        if (!ids.length) {
          this.setData({ unreadCount: res.unreadCount || 0 });
          return;
        }
        return api
          .readNotifications(ids)
          .then(() => {
            // 已读后重新拉一次统计，保证未读数与列表一致
            return api.listNotifications({ page: 1, size: 1 });
          })
          .then((stat) => {
            this.setData({
              unreadCount: stat.unreadCount || 0,
              list: this.data.list.map((n) =>
                ids.indexOf(n._id) > -1 ? Object.assign({}, n, { read: true }) : n
              ),
            });
          })
          .catch(() => {
            // 标记已读失败时保持原状，不谎报已读
          });
      })
      .catch((err) => {
        console.error('[问搭] 加载通知失败:', err);
        util.toast('加载失败');
      })
      .finally(() => this.setData({ loading: false }));
  },

  onLoadMore() {
    if (this.data.hasMore && !this.data.loading) this.load();
  },

  onReachBottom() {
    this.onLoadMore();
  },

  onOpen(e) {
    const qid = e.currentTarget.dataset.qid;
    if (qid) wx.navigateTo({ url: `/pages/detail/detail?id=${qid}` });
  },

  onReadAll() {
    if (!this.data.unreadCount) {
      util.toast('没有未读消息');
      return;
    }
    wx.showModal({
      title: '全部标为已读？',
      content: '会把当前所有未读通知标记为已读。',
      success: (res) => {
        if (!res.confirm) return;
        api
          .readNotifications([])
          .then(() => {
            util.toast('已全部标为已读');
            this.setData({ page: 1, list: [], unreadCount: 0 });
            return this.load();
          })
          .catch(() => util.toast('操作失败'));
      },
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
