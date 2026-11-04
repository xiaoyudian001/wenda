const CATEGORIES = [
  { key: 'eat', name: '吃什么', icon: '🍜', color: '#FF7A45' },
  { key: 'wear', name: '穿什么', icon: '👕', color: '#597EF7' },
  { key: 'play', name: '去哪玩', icon: '🎈', color: '#36CFC9' },
  { key: 'kid', name: '带孩子', icon: '🧸', color: '#9254DE' },
  { key: 'gift', name: '送什么', icon: '🎁', color: '#EB2F96' },
  { key: 'buy', name: '买不买', icon: '🛒', color: '#52C41A' },
];

const tracker = require('./services/tracker.js');

const PAGE_SIZE = 10;

App({
  globalData: {
    openid: '',
    userInfo: null,
    // 数据层：云函数不可用时自动降级到本地 mock
    useMock: true,
    mockStore: null,
  },

  onLaunch() {
    this.initDataLayer();
  },

  onShow() {
    tracker.track(tracker.EVENTS.APP_OPEN, '', { source: 'app_show' });
  },

  onHide() {
    // 退到后台时把队列里的埋点刷出去，避免丢失
    tracker.flush();
  },

  /**
   * 初始化数据层。
   * 优先用云函数；若未部署云开发环境，自动降级为本地 mock，
   * 保证小程序在「没配后端」的情况下也能完整跑通所有交互。
   */
  initDataLayer() {
    const that = this;
    if (typeof wx.cloud === 'undefined') {
      console.warn('[问搭] 未检测到 wx.cloud，使用本地 mock 数据层');
      that.globalData.useMock = true;
      return;
    }
    try {
      wx.cloud.init({ env: wx.cloud.DYNAMIC_CURRENT_ENV, traceUser: true });
      that.globalData.useMock = false;
      wx.cloud.callFunction({
        name: 'qa',
        data: { action: 'bootstrap' },
        success(res) {
          const r = res.result || {};
          if (r.code === 0 && r.user) {
            that.globalData.openid = r.user.openid || '';
            that.globalData.userInfo = r.user;
          } else {
            // 云函数可达但没有数据，自动灌入种子数据
            wx.cloud.callFunction({
              name: 'seed',
              data: { action: 'import' },
              success(seedRes) {
                console.log('[问搭] 种子数据导入:', seedRes.result);
              },
              fail(err) {
                console.error('[问搭] 种子数据导入失败:', err);
              },
            });
          }
        },
        fail(err) {
          console.warn('[问搭] 云函数调用失败，降级为本地 mock:', err);
          that.globalData.useMock = true;
        },
      });
    } catch (e) {
      console.warn('[问搭] 云开发初始化异常，使用本地 mock:', e);
      that.globalData.useMock = true;
    }
  },

  /** 供页面读取分类 */
  getCategories() {
    return CATEGORIES;
  },

  /** 调试开关：在 app.globalData.debugTrack = true 时打印埋点 */
  enableTrackDebug() {
    this.globalData.debugTrack = true;
  },
});
