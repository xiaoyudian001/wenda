const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

Page({
  data: {
    qid: '',
    question: null,
    answers: [],
    options: [],
    catName: '',
    catColor: '#86909C',
    avatarCls: '',
    createdText: '',
    canAdopt: false,
    replyOpen: false,
    replyText: '',
  },

  onLoad(options) {
    const qid = options.id || '';
    this.setData({ qid });
    tracker.track(tracker.EVENTS.DETAIL_VIEW, qid, { from: 'deep_link' });
    this.loadDetail();
  },

  onShow() {
    // 从「我的」页采纳后返回，需要刷新
    if (this.data.qid && this._loaded) this.loadDetail();
  },

  loadDetail() {
    api
      .getQuestion(this.data.qid)
      .then((res) => {
        if (!res || !res.question) {
          util.toast('问题不存在');
          return;
        }
        this._loaded = true;
        const q = res.question;
        const meta = util.categoryMeta(q.cat, api.CATEGORIES);
        const app = getApp();
        const myId = (app && app.globalData && app.globalData.userInfo && app.globalData.userInfo._id) || 'me';

        const answers = (res.answers || []).map((a) => ({
          ...a,
          timeText: util.timeAgo(a.createdAt),
          avatarCls: util.avatarClass(a.author && a.author._id),
        }));

        this.setData({
          question: q,
          answers,
          options: util.optionMetrics(q.options),
          catName: q.catName || meta.name,
          catColor: meta.color,
          avatarCls: util.avatarClass(q.asker && q.asker._id),
          createdText: util.timeAgo(q.createdAt),
          canAdopt: q.asker && q.asker._id === myId,
        });
      })
      .catch((err) => {
        console.error('[问搭] 加载详情失败:', err);
        util.toast('加载失败');
      });
  },

  onVote(e) {
    const key = e.currentTarget.dataset.key;
    tracker.track(tracker.EVENTS.OPTION_VOTE, this.data.qid, { optionKey: key });
    api
      .vote(this.data.qid, key)
      .then((res) => {
        if (res && res.question) {
          this.setData({ options: util.optionMetrics(res.question.options) });
          util.toast('已投票');
        }
      })
      .catch((err) => {
        console.error('[问搭] 投票失败:', err);
        util.toast('投票失败');
      });
  },

  onLike(e) {
    const id = e.currentTarget.dataset.id;
    tracker.track(tracker.EVENTS.ANSWER_LIKE, id, { questionId: this.data.qid });
    api
      .like(id)
      .then((res) => {
        const answers = this.data.answers.map((a) =>
          a._id === id ? { ...a, likes: res.likes, liked: res.liked } : a
        );
        this.setData({ answers });
      })
      .catch(() => util.toast('操作失败'));
  },

  onAdopt(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '采纳这条回答？',
      content: '采纳后作者会收到通知，你的这个问题也就解决啦。',
      confirmText: '采纳',
      success: (res) => {
        if (!res.confirm) return;
        tracker.track(tracker.EVENTS.ANSWER_ADOPT, this.data.qid, { answerId: id });
        api
          .adopt(this.data.qid, id)
          .then(() => {
            util.toast('已采纳');
            this.loadDetail();
          })
          .catch((err) => {
            console.error('[问搭] 采纳失败:', err);
            util.toast('采纳失败');
          });
      },
    });
  },

  onToggleReply() {
    this.setData({ replyOpen: true });
  },

  onCloseReply() {
    this.setData({ replyOpen: false });
  },

  onPanelTap() {
    // 阻止点击面板内部冒泡到遮罩
  },

  onReplyInput(e) {
    this.setData({ replyText: e.detail.value });
  },

  onSubmitAnswer() {
    const content = (this.data.replyText || '').trim();
    if (!content) {
      util.toast('先写点什么');
      return;
    }
    api
      .addAnswer(this.data.qid, content, null)
      .then(() => {
        tracker.track(tracker.EVENTS.ANSWER_PUBLISH, this.data.qid, { length: content.length });
        this.setData({ replyOpen: false, replyText: '' });
        util.toast('回答成功');
        this.loadDetail();
      })
      .catch((err) => {
        console.error('[问搭] 提交回答失败:', err);
        util.toast('提交失败');
      });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },

  onShare() {
    tracker.track(tracker.EVENTS.SHARE_CLICK, this.data.qid, { page: 'detail' });
    wx.showShareMenu({ withShareTicket: true });
    const q = this.data.question;
    if (q) {
      wx.setClipboardData({
        data: `「${q.title}」${q.desc}\n—— 来自问搭，把选择困难交给别人`,
        success: () => util.toast('内容已复制，去分享吧'),
      });
    }
  },

  onShareAppMessage() {
    const q = this.data.question;
    return {
      title: q ? `${q.title} · 问搭` : '问搭 · 把选择困难交给别人',
      path: `/pages/detail/detail?id=${this.data.qid}`,
    };
  },
});
