/**
 * 问搭 · 本地草稿
 *
 * 背景：用户提问写到一半可能切走（接电话、去看别的 App）。
 *       没有草稿的话回来就全丢了，重新打字很挫败。
 *
 * 规则：
 *   1. 只存自己的草稿，不碰其他人的数据
 *   2. 发布成功后清除草稿
 *   3. 用户主动「清空」时也清除草稿
 *   4. 草稿只在本机，云端不存
 */
const DRAFT_KEY = 'wenda_ask_draft_v1';

/** 读取草稿 */
function readDraft() {
  try {
    const d = wx.getStorageSync(DRAFT_KEY);
    if (!d || typeof d !== 'object') return null;
    // 只有标题或描述有内容才算有效草稿
    const hasContent = !!(d.title || d.desc || (d.options || []).some((o) => o && o.trim()));
    return hasContent ? d : null;
  } catch (e) {
    console.warn('[问搭] 读取草稿失败:', e);
    return null;
  }
}

/** 保存草稿 */
function saveDraft(draft) {
  try {
    const payload = {
      cat: draft.cat || '',
      title: draft.title || '',
      desc: draft.desc || '',
      options: Array.isArray(draft.options) ? draft.options : [],
      anonymous: !!draft.anonymous,
      updatedAt: Date.now(),
    };
    wx.setStorageSync(DRAFT_KEY, payload);
    return true;
  } catch (e) {
    console.warn('[问搭] 保存草稿失败:', e);
    return false;
  }
}

/** 清除草稿 */
function clearDraft() {
  try {
    wx.removeStorageSync(DRAFT_KEY);
    return true;
  } catch (e) {
    console.warn('[问搭] 清除草稿失败:', e);
    return false;
  }
}

/** 草稿最后编辑时间（用于提示） */
function draftTime() {
  const d = readDraft();
  return d ? d.updatedAt : 0;
}

module.exports = { readDraft, saveDraft, clearDraft, draftTime, DRAFT_KEY };
