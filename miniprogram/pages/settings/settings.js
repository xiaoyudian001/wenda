const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

Page({
  data: {
    settings: {},
    nickname: '',
    city: '',
    editingProfile: false,
    focusSection: '',
  },

  onShow(options) {
    util.guard(this); // 页面卸载后不再 setData
    this.loadSettings();
    // 从「我的」页带 focus 参数进来时，滚动到对应区块
    if (options && options.focus) {
      this.setData({ focusSection: options.focus });
    }
  },

  loadSettings() {
    api
      .getSettings()
      .then((settings) => {
        const app = getApp();
        const user = (app && app.globalData && app.globalData.userInfo) || {};
        this.setData({
          settings: settings || {},
          nickname: user.nickname || '我',
          city: user.city || '',
        });
      })
      .catch((err) => {
        console.error('[问搭] 加载设置失败:', err);
      });
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const patch = {};
    patch[key] = value;
    this.setData({ ['settings.' + key]: value });
    api
      .saveSettings(patch)
      .then(() => util.toast('已保存'))
      .catch(() => {
        util.toast('保存失败');
        this.loadSettings();
      });
  },

  onEditProfile() {
    this.setData({ editingProfile: true });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onCityInput(e) {
    this.setData({ city: e.detail.value });
  },

  onSaveProfile() {
    const nickname = (this.data.nickname || '').trim();
    const city = (this.data.city || '').trim();
    if (!nickname) {
      util.toast('昵称不能为空');
      return Promise.resolve();
    }
    return api
      .updateProfile({ nickname, city })
      .then((res) => {
        const user = (res && res.user) || { nickname, city };
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.userInfo = Object.assign({}, app.globalData.userInfo || {}, user);
        }
        this.setData({
          nickname: user.nickname || nickname,
          city: user.city || city,
          editingProfile: false,
        });
        util.toast('已保存');
      })
      .catch((err) => {
        console.error('[问搭] 保存资料失败:', err);
        util.toast(err.message || '保存失败');
      });
  },

  onCancelEdit() {
    this.setData({ editingProfile: false });
    this.loadSettings();
  },

  onClearCache() {
    wx.showModal({
      title: '清除本地缓存？',
      content: '会清空本机的搜索与页面缓存，不影响云端数据。',
      success: (res) => {
        if (!res.confirm) return;
        try {
          wx.clearStorageSync();
        } catch (e) {
          console.warn(e);
        }
        util.toast('已清除');
        this.loadSettings();
      },
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于问搭',
      content:
        '问搭 · 把选择困难，交给别人。\n\n' +
        '一个只解决「小纠结」的问答社区：吃什么、穿什么、买不买。\n' +
        '不用写长篇，不用当专家，把你的理由说出来就够了。\n\n' +
        '版本 v0.2 · 种子内容 ' + (this.data.settings.totalQuestions || 226) + ' 条',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  onFeedback() {
    tracker.track(tracker.EVENTS.SHARE_CLICK, '', { page: 'feedback' });
    wx.showModal({
      title: '意见反馈',
      editable: true,
      placeholderText: '说说你想改进的地方',
      success: (res) => {
        if (!res.confirm || !res.content) return;
        util.toast('已收到，谢谢反馈');
      },
    });
  },

  onPrivacy() {
    wx.showModal({
      title: '隐私与安全',
      content:
        '· 提问默认不带个人信息\n' +
        '· 位置仅到城市级，不会精确定位\n' +
        '· 匿名提问开启后，别人看不到你的昵称\n' +
        '· 你可以随时在「我的」里清除本地数据',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
