const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');

Page({
  data: {
    categories: [],
    cat: 'eat',
    title: '',
    desc: '',
    options: ['', '', ''],
    anonymous: false,
    submitting: false,
  },

  onLoad() {
    this.setData({ categories: api.CATEGORIES });
  },

  onCat(e) {
    this.setData({ cat: e.currentTarget.dataset.key });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ desc: e.detail.value });
  },

  onOptionInput(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.options.slice();
    list[idx] = e.detail.value;
    this.setData({ options: list });
  },

  onAddOption() {
    if (this.data.options.length >= 6) {
      util.toast('最多 6 个选项');
      return;
    }
    this.setData({ options: this.data.options.concat(['']) });
  },

  onDelOption(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.options.slice();
    list.splice(idx, 1);
    this.setData({ options: list.length ? list : [''] });
  },

  onAnonymousChange(e) {
    this.setData({ anonymous: e.detail.value });
  },

  onReset() {
    this.setData({ title: '', desc: '', options: ['', '', ''], anonymous: false });
  },

  onSubmit() {
    if (this.data.submitting) return;
    const title = (this.data.title || '').trim();
    if (!title) {
      util.toast('先写下你的问题');
      return;
    }
    const meta = util.categoryMeta(this.data.cat, api.CATEGORIES);
    const payload = {
      cat: this.data.cat,
      catName: meta.name,
      title,
      desc: (this.data.desc || '').trim(),
      options: this.data.options,
      anonymous: this.data.anonymous,
    };

    this.setData({ submitting: true });
    api
      .createQuestion(payload)
      .then((res) => {
        const qid = res && res.question && res.question._id;
        tracker.track(tracker.EVENTS.QUESTION_PUBLISH, qid || '', {
          cat: payload.cat,
          hasOptions: (payload.options || []).filter(Boolean).length,
          anonymous: !!payload.anonymous,
        });
        this.setData({ title: '', desc: '', options: ['', '', ''], anonymous: false, submitting: false });
        util.toast('发布成功！已推送给附近的人');
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 800);
        if (res && res.question && res.question._id) {
          // 预留：成功后可跳转到详情页
          this._newQid = res.question._id;
        }
      })
      .catch((err) => {
        console.error('[问搭] 发布失败:', err);
        this.setData({ submitting: false });
        util.toast('发布失败，请重试');
      });
  },

  onBack() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
