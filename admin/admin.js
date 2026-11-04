/**
 * 问搭 · 审核后台逻辑
 *
 * 两种模式：
 *   1. 演示模式（默认）：读取 seed/seed.bundle.json，用真实种子数据展示全部功能
 *   2. 线上模式：URL 加 ?api=<云函数 HTTP 服务地址>，走真实接口
 *
 * 例：index.html?api=https://你的服务地址/admin
 */
(function () {
  'use strict';

  var state = {
    page: 1,
    size: 20,
    status: '',
    keyword: '',
    total: 0,
    api: getQueryParam('api') || '',
    rows: [],
    online: false,
    view: 'questions',
    rPage: 1,
    rStatus: 'pending',
    rTotal: 0,
    rRows: [],
  };

  var REPORT_REASON = {
    spam: '垃圾广告',
    abuse: '辱骂攻击',
    privacy: '涉及隐私',
    other: '其他',
  };

  var REPORT_STATUS = {
    pending: '待处理',
    handled: '已处理',
    dismissed: '已驳回',
  };

  var CATS = {
    eat: { name: '吃什么', color: '#FF7A45' },
    wear: { name: '穿什么', color: '#597EF7' },
    play: { name: '去哪玩', color: '#36CFC9' },
    kid: { name: '带孩子', color: '#9254DE' },
    gift: { name: '送什么', color: '#EB2F96' },
    buy: { name: '买不买', color: '#52C41A' },
  };

  var STATUS_TEXT = {
    pending: '待回答',
    answered: '已有回答',
    adopted: '已采纳',
    hidden: '已隐藏',
  };

  function getQueryParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // ---------- 数据加载 ----------
  function loadDemo() {
    // 演示模式：直接读种子包
    return fetch('../seed/seed.bundle.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (bundle) {
        state.online = false;
        setConn('演示模式（本地种子数据）', 'off');
        var list = bundle.questions.slice();
        applyFilter(list);
        renderStats(bundle.stats);
      })
      .catch(function (err) {
        $('rows').innerHTML =
          '<tr><td colspan="6" class="empty">加载种子数据失败：' + esc(err.message) +
          '<br><br>请确认通过 HTTP 访问本页面（不能直接双击打开），或使用 ?api= 指定线上接口</td></tr>';
      });
  }

  function loadOnline() {
    var url = state.api + (state.api.indexOf('?') > -1 ? '&' : '?') +
      'action=adminList&status=' + encodeURIComponent(state.status) +
      '&page=' + state.page + '&size=' + state.size +
      (state.keyword ? '&keyword=' + encodeURIComponent(state.keyword) : '');

    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.code !== 0) throw new Error(res.message || '接口返回异常');
        state.online = true;
        setConn('已连接线上接口', 'ok');
        state.rows = res.data.list || [];
        state.total = res.data.total || state.rows.length;
        renderRows();
        fetch(state.api + '?action=adminStats')
          .then(function (r) { return r.json(); })
          .then(function (s) { if (s.code === 0) renderStats(s.data); })
          .catch(function () {});
      })
      .catch(function (err) {
        setConn('接口不可用，已降级为演示模式', 'off');
        console.warn('[问搭] 线上接口失败:', err);
        loadDemo();
      });
  }

  function applyFilter(list) {
    var out = list;
    if (state.status) {
      out = out.filter(function (q) { return q.status === state.status; });
    }
    if (state.keyword) {
      var kw = state.keyword.toLowerCase();
      out = out.filter(function (q) {
        return (q.title || '').toLowerCase().indexOf(kw) > -1 ||
          (q.desc || '').toLowerCase().indexOf(kw) > -1;
      });
    }
    state.total = out.length;
    var start = (state.page - 1) * state.size;
    state.rows = out.slice(start, start + state.size);
    renderRows();
  }

  function refresh() {
    if (state.api) loadOnline();
    else loadDemo();
  }

  // ---------- 渲染 ----------
  function setConn(text, cls) {
    var el = $('conn');
    el.textContent = text;
    el.className = 'conn ' + (cls || '');
  }

  function renderStats(s) {
    s = s || {};
    $('statQ').textContent = s.questionCount != null ? s.questionCount : '—';
    $('statA').textContent = s.answerCount != null ? s.answerCount : '—';
    $('statU').textContent = s.userCount != null ? s.userCount : '—';
    $('statP').textContent = s.pendingCount != null ? s.pendingCount : '—';
    var badge = $('reportBadge');
    if (s.reportCount != null) {
      $('statR').textContent = s.reportCount;
      badge.textContent = s.reportCount;
      badge.hidden = !s.reportCount;
    }
  }

  // ---------- 举报处理 ----------
  function loadReports() {
    if (!state.online) {
      // 演示模式：用种子包里的样例举报
      var all = window.__demoReports || [];
      var list = all.filter(function (r) {
        return !state.rStatus || r.status === state.rStatus;
      });
      state.rRows = list;
      state.rTotal = list.length;
      renderReports();
      if (!all.length) {
        $('reportRows').innerHTML =
          '<tr><td colspan="5" class="empty">演示模式下没有举报数据。<br><br>请用 ?api= 指定线上接口后查看。</td></tr>';
      }
      return Promise.resolve();
    }
    var url = state.api + (state.api.indexOf('?') > -1 ? '&' : '?') +
      'action=adminReports&status=' + encodeURIComponent(state.rStatus) +
      '&page=' + state.rPage + '&size=' + state.size;

    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.code !== 0) throw new Error(res.message || '接口返回异常');
        state.rRows = res.data.list || [];
        state.rTotal = res.data.total || state.rRows.length;
        renderReports();
      })
      .catch(function (err) {
        $('reportRows').innerHTML =
          '<tr><td colspan="5" class="empty">加载举报失败：' + esc(err.message) + '</td></tr>';
      });
  }

  function renderReports() {
    var tbody = $('reportRows');
    if (!state.rRows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">没有符合条件的举报</td></tr>';
    } else {
      tbody.innerHTML = state.rRows.map(function (r) {
        var isAnswer = r.targetType === 'answer';
        var st = r.status || 'pending';
        var canHandle = st === 'pending';
        return '<tr>' +
          '<td><span class="status status-' + st + '">' + (isAnswer ? '回答' : '问题') + '</span></td>' +
          '<td><div class="q-title">' + esc(r.detail || r.targetId) + '</div>' +
          '<div class="q-desc">对象 id：' + esc(r.targetId) + '</div></td>' +
          '<td>' + esc(REPORT_REASON[r.reason] || r.reason || '—') + '</td>' +
          '<td>' + (r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '—') + '</td>' +
          '<td><div class="actions">' +
          (canHandle
            ? '<button class="btn btn-mini btn-danger" onclick="adminHideTarget(\'' + r.targetType + '\', \'' + r.targetId + '\', \'' + r._id + '\')">隐藏内容</button>' +
              '<button class="btn btn-mini" onclick="adminDismissReport(\'' + r._id + '\')">驳回</button>'
            : '<span class="status status-' + st + '">' + (REPORT_STATUS[st] || st) + '</span>') +
          '</div></td>' +
          '</tr>';
      }).join('');
    }
    var maxPage = Math.max(1, Math.ceil(state.rTotal / state.size));
    $('rPageInfo').textContent = state.rPage + ' / ' + maxPage;
  }

  window.adminDismissReport = function (reportId) {
    if (!confirm('驳回这条举报？被举报内容会保留。')) return;
    fetch(state.api + (state.api.indexOf('?') > -1 ? '&' : '?') +
      'action=adminHandleReport&reportId=' + encodeURIComponent(reportId) + '&action=dismiss')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.code !== 0) throw new Error(res.message || '操作失败');
        loadReports();
        loadOnline();
      })
      .catch(function (err) { alert('操作失败：' + err.message); });
  };

  window.adminHideTarget = function (targetType, targetId, reportId) {
    if (!confirm('确定隐藏被举报的' + (targetType === 'answer' ? '回答' : '问题') + '？')) return;
    fetch(state.api + (state.api.indexOf('?') > -1 ? '&' : '?') +
      'action=adminHandleReport&reportId=' + encodeURIComponent(reportId) + '&action=hide')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.code !== 0) throw new Error(res.message || '操作失败');
        loadReports();
        loadOnline();
      })
      .catch(function (err) { alert('操作失败：' + err.message); });
  };

  function renderRows() {
    var tbody = $('rows');
    if (!state.rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">没有符合条件的问题</td></tr>';
    } else {
      tbody.innerHTML = state.rows.map(function (q) {
        var cat = CATS[q.cat] || { name: q.cat, color: '#86909C' };
        var st = q.status || 'pending';
        return '<tr>' +
          '<td><span class="cat-badge" style="background:' + cat.color + '">' + esc(cat.name) + '</span></td>' +
          '<td><div class="q-title">' + esc(q.title) + '</div>' +
          '<div class="q-desc">' + esc(q.desc || '') + '</div></td>' +
          '<td>' + (q.answerCount || 0) + '</td>' +
          '<td>' + (q.totalVotes || 0) + '</td>' +
          '<td><span class="status status-' + st + '">' + (STATUS_TEXT[st] || st) + '</span></td>' +
          '<td><div class="actions">' +
          '<button class="btn btn-mini" onclick="adminView(\'' + q._id + '\')">查看</button>' +
          '<button class="btn btn-mini btn-danger" onclick="adminHide(\'' + q._id + '\')">隐藏</button>' +
          '<button class="btn btn-mini" onclick="adminRestore(\'' + q._id + '\')">恢复</button>' +
          '</div></td>' +
          '</tr>';
      }).join('');
    }
    var maxPage = Math.max(1, Math.ceil(state.total / state.size));
    $('pageInfo').textContent = state.page + ' / ' + maxPage;
  }

  // ---------- 操作 ----------
  window.adminView = function (id) {
    var q = state.rows.filter(function (x) { return x._id === id; })[0];
    if (!q) return;
    alert(
      '标题：' + q.title + '\n\n' +
      '描述：' + (q.desc || '（无）') + '\n\n' +
      '选项：\n' + (q.options || []).map(function (o) {
        return '  · ' + o.text + '  (' + (o.votes || 0) + ' 票)';
      }).join('\n') + '\n\n' +
      '回答数：' + (q.answerCount || 0) + ' / 总票数：' + (q.totalVotes || 0) +
      '\n提问者：' + (q.asker ? q.asker.nickname : '—') + ' / ' + (q.city || '')
    );
  };

  window.adminHide = function (id) {
    if (!confirm('确定隐藏这条问题？')) return;
    if (state.online) {
      fetch(state.api + '?action=adminHide&id=' + encodeURIComponent(id) + '&status=hidden')
        .then(function (r) { return r.json(); })
        .then(function () { alert('已隐藏'); refresh(); })
        .catch(function () { alert('操作失败'); });
    } else {
      var q = state.rows.filter(function (x) { return x._id === id; })[0];
      if (q) q.status = 'hidden';
      alert('演示模式：已在本地标记为隐藏（未同步云端）');
      renderRows();
    }
  };

  window.adminRestore = function (id) {
    if (!confirm('恢复这条问题？')) return;
    if (state.online) {
      fetch(state.api + '?action=adminHide&id=' + encodeURIComponent(id) + '&status=answered')
        .then(function (r) { return r.json(); })
        .then(function () { alert('已恢复'); refresh(); })
        .catch(function () { alert('操作失败'); });
    } else {
      var q = state.rows.filter(function (x) { return x._id === id; })[0];
      if (q) q.status = 'answered';
      alert('演示模式：已在本地恢复（未同步云端）');
      renderRows();
    }
  };

  // ---------- 事件绑定 ----------
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        state.status = btn.getAttribute('data-status');
        state.page = 1;
        refresh();
      });
    });

    $('refreshBtn').addEventListener('click', function () {
      if (state.view === 'reports') loadReports();
      else refresh();
    });
    $('prevBtn').addEventListener('click', function () {
      if (state.page > 1) { state.page--; refresh(); }
    });
    $('nextBtn').addEventListener('click', function () {
      var maxPage = Math.max(1, Math.ceil(state.total / state.size));
      if (state.page < maxPage) { state.page++; refresh(); }
    });

    // ---------- 视图切换（内容管理 / 举报处理） ----------
    Array.prototype.forEach.call(document.querySelectorAll('.view-tab'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.view-tab'), function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        state.view = btn.getAttribute('data-view');
        $('view-questions').hidden = state.view !== 'questions';
        $('view-reports').hidden = state.view !== 'reports';
        if (state.view === 'reports') loadReports();
      });
    });

    // ---------- 举报状态筛选 ----------
    Array.prototype.forEach.call(document.querySelectorAll('.rtab'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.rtab'), function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        state.rStatus = btn.getAttribute('data-rstatus');
        state.rPage = 1;
        loadReports();
      });
    });

    $('rPrevBtn').addEventListener('click', function () {
      if (state.rPage > 1) { state.rPage--; loadReports(); }
    });
    $('rNextBtn').addEventListener('click', function () {
      var maxPage = Math.max(1, Math.ceil(state.rTotal / state.size));
      if (state.rPage < maxPage) { state.rPage++; loadReports(); }
    });

    var timer = null;
    $('search').addEventListener('input', function (e) {
      state.keyword = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.page = 1;
        if (state.online) refresh();
        else applyFilter(window.__demoAll || []);
      }, 300);
    });
  }

  // 演示模式下缓存全量数据供搜索使用
  var origLoadDemo = loadDemo;
  loadDemo = function () {
    return fetch('../seed/seed.bundle.json')
      .then(function (r) { return r.json(); })
      .then(function (bundle) {
        window.__demoAll = bundle.questions;
        window.__demoReports = bundle.demoReports || [];
        state.online = false;
        setConn('演示模式（本地种子数据）', 'off');
        applyFilter(bundle.questions.slice());
        renderStats(bundle.stats);
        var pendingReports = (bundle.demoReports || []).filter(function (r) {
          return r.status === 'pending';
        }).length;
        $('statR').textContent = pendingReports;
        $('reportBadge').textContent = pendingReports;
        $('reportBadge').hidden = !pendingReports;
      })
      .catch(function (err) {
        $('rows').innerHTML =
          '<tr><td colspan="6" class="empty">加载种子数据失败：' + esc(err.message) +
          '<br><br>请通过 HTTP 访问本页面，或使用 ?api= 指定线上接口</td></tr>';
      });
  };
  void origLoadDemo;

  bind();
  refresh();
})();
