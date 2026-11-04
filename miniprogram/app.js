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

  onLaunch(options) {
    this.globalData.launchOptions = options || {};
    this.initDataLayer();
  },

  onShow(options) {
    tracker.track(tracker.EVENTS.APP_OPEN, '', { source: 'app_show' });
    this.trackShareEnter(options);
  },

  onHide() {
    // 退到后台时把队列里的埋点刷出去，避免丢失
    tracker.flush();
  },

  /**
   * 分享来源归因。
   * 小程序通过分享卡片进入时，onShow 的 options.scene 会带上场景值，
   * 这里记录成 share_enter 事件，用于计算裂变系数 K。
   */
  trackShareEnter(options) {
    if (!options || !options.scene) return;
    const app = getApp();
    // 场景值 1007/1008/1044 等代表「从分享卡片进入」
    const isFromShare = [1007, 1008, 1044].indexOf(options.scene) > -1;
    if (!isFromShare) return;
    tracker.track(tracker.EVENTS.SHARE_ENTER, options.query && options.query.id ? options.query.id : '', {
      scene: options.scene,
      path: options.path || '',
    });
    void app;
  },

  /**
   * 初始化数据层。
   * 优先用云函数；若未部署云开发环境，自动降级为本地 mock，
   * 保证小程序在「没配后端」的情况下也能完整跑通所有交互。
   */
  initDataLayer() {
    const that = this;

    // 游客模式（appid = touristappid）没有云环境，直接走本地 mock，
    // 避免云调用挂起导致列表一直加载不出来
    if (this.isGuestMode()) {
      console.warn('[问搭] 游客模式，使用本地 mock 数据层');
      that.globalData.useMock = true;
      return;
    }

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
        timeout: 8000,
        success(res) {
          const r = res.result || {};
          const user = r.data && r.data.user;
          if (r.code === 0 && user) {
            that.globalData.openid = user.openid || user._id || '';
            that.globalData.userInfo = user;
            return;
          }
          // 云函数可达但返回异常（如集合未创建）：降级到 mock，
          // 否则后续每个页面请求都会失败
          console.warn('[问搭] 云函数返回异常，降级为本地 mock:', r.message || r);
          that.globalData.useMock = true;
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

  /** 是否为游客模式（无 AppID，无法使用云开发与上传） */
  isGuestMode() {
    try {
      if (typeof wx.getAccountInfoSync !== 'function') return true;
      const info = wx.getAccountInfoSync();
      const appId = info && info.miniProgram && info.miniProgram.appId;
      return !appId || appId === 'touristappid';
    } catch (e) {
      return true;
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
