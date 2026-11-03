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
  }

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

    $('refreshBtn').addEventListener('click', refresh);
    $('prevBtn').addEventListener('click', function () {
      if (state.page > 1) { state.page--; refresh(); }
    });
    $('nextBtn').addEventListener('click', function () {
      var maxPage = Math.max(1, Math.ceil(state.total / state.size));
      if (state.page < maxPage) { state.page++; refresh(); }
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
        state.online = false;
        setConn('演示模式（本地种子数据）', 'off');
        applyFilter(bundle.questions.slice());
        renderStats(bundle.stats);
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
