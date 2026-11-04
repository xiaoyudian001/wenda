const api = require('../../services/api.js');
const util = require('../../utils/index.js');
const tracker = require('../../services/tracker.js');
const draft = require('../../services/draft.js');

Page({
  data: {
    categories: [],
    cat: 'eat',
    title: '',
    desc: '',
    options: ['', '', ''],
    anonymous: false,
    submitting: false,
    draftRestored: false,
  },

  onLoad() {
    util.guard(this); // 页面卸载后不再 setData
    this.setData({ categories: api.CATEGORIES });
    this.restoreDraft();
    // 读取用户偏好：设置页里的「默认匿名提问」要真正作用到表单
    return api
      .getSettings()
      .then((settings) => {
        // 草稿里的选择优先于全局默认
        const current = this.data;
        this.setData({
          anonymous: current.draftRestored ? current.anonymous : !!settings.anonymousDefault,
        });
      })
      .catch(() => {});
  },

  /** 恢复上次未完成的草稿 */
  restoreDraft() {
    const d = draft.readDraft();
    if (!d) return;
    this.setData({
      cat: d.cat || this.data.cat,
      title: d.title || '',
      desc: d.desc || '',
      options: Array.isArray(d.options) && d.options.length ? d.options : ['', '', ''],
      anonymous: !!d.anonymous,
      draftRestored: true,
    });
  },

  /** 把当前表单存成草稿 */
  persistDraft() {
    if (!this.data.title && !this.data.desc) {
      // 什么都没填就别存，避免留下空壳草稿
      draft.clearDraft();
      return;
    }
    draft.saveDraft({
      cat: this.data.cat,
      title: this.data.title,
      desc: this.data.desc,
      options: this.data.options,
      anonymous: this.data.anonymous,
    });
  },

  onCat(e) {
    this.setData({ cat: e.currentTarget.dataset.key });
    this.persistDraft();
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
    this.persistDraft();
  },

  onDescInput(e) {
    this.setData({ desc: e.detail.value });
    this.persistDraft();
  },

  onOptionInput(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.options.slice();
    list[idx] = e.detail.value;
    this.setData({ options: list });
    this.persistDraft();
  },

  onAddOption() {
    if (this.data.options.length >= 6) {
      util.toast('最多 6 个选项');
      return;
    }
    this.setData({ options: this.data.options.concat(['']) });
    this.persistDraft();
  },

  onDelOption(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.options.slice();
    list.splice(idx, 1);
    this.setData({ options: list.length ? list : [''] });
    this.persistDraft();
  },

  onAnonymousChange(e) {
    this.setData({ anonymous: e.detail.value });
    this.persistDraft();
  },

  onReset() {
    draft.clearDraft();
    return api
      .getSettings()
      .then((settings) => {
        this.setData({
          title: '',
          desc: '',
          options: ['', '', ''],
          anonymous: !!settings.anonymousDefault,
          draftRestored: false,
        });
      })
      .catch(() => {
        this.setData({ title: '', desc: '', options: ['', '', ''], anonymous: false, draftRestored: false });
      });
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
        this.setData({ title: '', desc: '', options: ['', '', ''], submitting: false, draftRestored: false });
        draft.clearDraft(); // 发布成功，草稿就没用了
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
