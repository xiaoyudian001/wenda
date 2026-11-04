/** 问搭 · 通用工具 */

/** 相对时间 */
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const d = Math.floor(h / 24);
  if (d < 30) return d + ' 天前';
  return Math.floor(d / 30) + ' 个月前';
}

/** 头像配色（按 id 稳定分配） */
function avatarClass(id) {
  const s = String(id || '');
  const c = (s.charCodeAt(s.length - 1) || 0) % 4;
  return ['', 'g', 'b', 'p'][c];
}

/** 分类元信息 */
function categoryMeta(key, categories) {
  const list = categories || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].key === key) return list[i];
  }
  return { key: key, name: key, icon: '📌', color: '#86909C' };
}

/** 计算选项条宽度与百分比 */
function optionMetrics(options) {
  const list = options || [];
  const max = list.length ? Math.max.apply(null, list.map((o) => o.votes || 0)) : 0;
  const total = list.reduce((s, o) => s + (o.votes || 0), 0);
  return list.map((o) => ({
    ...o,
    barWidth: max ? Math.round(((o.votes || 0) / max) * 100) : 0,
    pct: total ? Math.round(((o.votes || 0) / total) * 100) : 0,
  }));
}

/** 轻提示 */
function toast(title, icon) {
  wx.showToast({ title, icon: icon || 'none', duration: 1800 });
}

/**
 * 给页面加“卸载守卫”。
 *
 * 背景：页面 onUnload 后，异步回调里再调 setData 会抛错，
 *       Promise 变成未处理的 rejected，控制台报 Unhandled promise rejection。
 *       页面切换时很容易触发。
 *
 * 用法：页面 onLoad 里调用一次 util.guard(this);
 *       之后 setData 在页面卸载后会自动变成空操作。
 */
function guard(page) {
  if (!page || page._guarded) return page;
  page._guarded = true;
  page._unloaded = false;

  const rawSetData = page.setData && page.setData.bind(page);
  if (rawSetData) {
    page.setData = function (patch, callback) {
      if (page._unloaded) {
        if (typeof callback === 'function') callback();
        return;
      }
      return rawSetData(patch, callback);
    };
  }

  // 包装已有的 onUnload（如果页面自己定义了）
  const rawOnUnload = page.onUnload;
  page.onUnload = function () {
    page._unloaded = true;
    if (typeof rawOnUnload === 'function') {
      try {
        rawOnUnload.call(page);
      } catch (e) {
        console.warn('[问搭] onUnload 执行出错:', e);
      }
    }
  };

  return page;
}

module.exports = { timeAgo, avatarClass, categoryMeta, optionMetrics, toast, guard };
