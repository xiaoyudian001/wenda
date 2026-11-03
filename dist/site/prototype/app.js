/**
 * 问搭 · 原型交互脚本
 * 用真实的种子数据驱动，可以完整走一遍：浏览 → 提问 → 回答 → 投票 → 采纳 → 分享
 */
(function () {
  'use strict';

  var DB = window.SEED_BUNDLE || { questions: [], answers: [], users: [], categories: [] };
  var state = {
    tab: 'home',
    cat: 'all',
    sort: 'hot',
    view: 'list',
    currentQid: null,
    liked: {},
    myQuestions: [],
    myAnswers: [],
  };

  var screen = document.getElementById('screen');
  var tabbar = document.getElementById('tabbar');

  var CATS = DB.categories || [];
  var CAT_MAP = {};
  CATS.forEach(function (c) { CAT_MAP[c.key] = c; });

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function timeAgo(ts) {
    var diff = Date.now() - ts;
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    return Math.floor(d / 30) + ' 个月前';
  }

  function avatarClass(id) {
    var s = String(id || '');
    var c = (s.charCodeAt(s.length - 1) || 0) % 4;
    return ['', 'g', 'b', 'p'][c];
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 250);
    }, 1900);
  }

  function findQ(id) {
    for (var i = 0; i < DB.questions.length; i++) if (DB.questions[i]._id === id) return DB.questions[i];
    return null;
  }

  function answersOf(qid) {
    return DB.answers.filter(function (a) { return a.questionId === qid; });
  }

  function sortedQuestions() {
    var list = DB.questions.filter(function (q) {
      if (state.cat === 'all') return true;
      if (state.cat === 'pending') return q.status === 'pending';
      return q.cat === state.cat;
    });
    if (state.sort === 'new') {
      list.sort(function (a, b) { return b.createdAt - a.createdAt; });
    } else if (state.sort === 'hot') {
      list.sort(function (a, b) { return b.heat - a.heat; });
    }
    return list;
  }

  // ---------- 渲染：广场 ----------
  function renderHome() {
    var cats = [{ key: 'all', name: '全部', icon: '✨' }]
      .concat(CATS)
      .concat([{ key: 'pending', name: '待回答', icon: '⏳' }]);

    var html = '<div class="appbar"><div class="appbar-row">' +
      '<div><h1>问搭</h1><div class="sub">把选择困难，交给别人</div></div>' +
      '<div style="font-size:22px;cursor:pointer" onclick="app.toast(\'这个位置放提问入口\')">✍️</div>' +
      '</div></div>';

    html += '<div class="cats">' + cats.map(function (c) {
      return '<div class="cat-chip ' + (state.cat === c.key ? 'on' : '') + '" onclick="app.setCat(\'' + c.key + '\')">' +
        c.icon + ' ' + c.name + '</div>';
    }).join('') + '</div>';

    html += '<div style="display:flex;gap:8px;padding:10px 14px 2px">' +
      '<div class="cat-chip ' + (state.sort === 'hot' ? 'on' : '') + '" style="font-size:12px;padding:4px 11px" onclick="app.setSort(\'hot\')">🔥 最热</div>' +
      '<div class="cat-chip ' + (state.sort === 'new' ? 'on' : '') + '" style="font-size:12px;padding:4px 11px" onclick="app.setSort(\'new\')">🕐 最新</div>' +
      '</div>';

    var list = sortedQuestions();
    if (!list.length) {
      html += '<div class="empty"><div class="empty-ico">🍃</div>' +
        '<div class="empty-title">这个分类还没有问题</div>' +
        '<div class="empty-desc">来提第一个问题吧</div></div>';
    } else {
      html += '<div class="list">' + list.map(cardHtml).join('') + '</div>';
    }
    return html;
  }

  function cardHtml(q) {
    var cat = CAT_MAP[q.cat] || { name: q.cat, color: '#86909C' };
    var opts = q.options || [];
    var max = opts.length ? Math.max.apply(null, opts.map(function (o) { return o.votes; })) : 0;
    var total = q.totalVotes || 0;

    var optsHtml = opts.slice(0, 3).map(function (o) {
      var pct = total ? Math.round((o.votes / total) * 100) : 0;
      var w = max ? Math.round((o.votes / max) * 100) : 0;
      return '<div class="opt ' + (o.isRecommend ? 'pick' : '') + '">' +
        '<div class="bar" style="width:' + w + '%"></div>' +
        '<span class="txt">' + (o.isRecommend ? '✓ ' : '') + esc(o.text) + '</span>' +
        '<span class="pct">' + pct + '%</span>' +
        '</div>';
    }).join('');

    return '<div class="card" onclick="app.open(\'' + q._id + '\')">' +
      '<div class="card-head">' +
      '<span class="cat-tag" style="background:' + cat.color + '">' + cat.name + '</span>' +
      '<span class="city">📍' + esc(q.city) + '</span>' +
      '</div>' +
      '<div class="card-title">' + esc(q.title) + '</div>' +
      '<div class="card-desc">' + esc(q.desc) + '</div>' +
      (optsHtml ? '<div class="options">' + optsHtml + '</div>' : '') +
      '<div class="card-foot">' +
      '<div style="display:flex;gap:12px">' +
      '<span class="foot-item">💬 ' + q.answerCount + ' 回答</span>' +
      '<span class="foot-item">📊 ' + total + ' 人选</span>' +
      '</div>' +
      (q.adopted ? '<span class="badge-adopt">🏆 已解决</span>' : '<span class="foot-item" style="color:var(--primary)">等待回答 →</span>') +
      '</div></div>';
  }

  // ---------- 渲染：详情 ----------
  function renderDetail() {
    var q = findQ(state.currentQid);
    if (!q) return renderHome();
    var cat = CAT_MAP[q.cat] || { name: q.cat, color: '#86909C' };
    var list = answersOf(q._id).slice().sort(function (a, b) {
      if (a.adopted !== b.adopted) return a.adopted ? -1 : 1;
      return b.likes - a.likes;
    });

    var opts = q.options || [];
    var max = opts.length ? Math.max.apply(null, opts.map(function (o) { return o.votes; })) : 0;
    var total = q.totalVotes || 0;

    var html = '<div class="appbar plain"><div class="appbar-row">' +
      '<div class="back" onclick="app.back()">←</div>' +
      '<div style="font-size:16px;font-weight:600">问题详情</div>' +
      '<div style="width:30px"></div>' +
      '</div></div>';

    html += '<div class="detail-card">' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">' +
      '<span class="cat-tag" style="background:' + cat.color + '">' + cat.name + '</span>' +
      '<span class="city">📍' + esc(q.city) + '</span>' +
      '</div>' +
      '<div class="detail-title">' + esc(q.title) + '</div>' +
      '<div class="detail-desc">' + esc(q.desc) + '</div>' +
      (opts.length ? '<div class="options" id="voteBox">' + opts.map(function (o) {
        var pct = total ? Math.round((o.votes / total) * 100) : 0;
        var w = max ? Math.round((o.votes / max) * 100) : 0;
        return '<div class="opt ' + (o.isRecommend ? 'pick' : '') + '" onclick="app.vote(\'' + q._id + '\',\'' + o.key + '\')">' +
          '<div class="bar" style="width:' + w + '%"></div>' +
          '<span class="txt">' + (o.isRecommend ? '✓ ' : '') + esc(o.text) + '</span>' +
          '<span class="pct">' + pct + '%</span></div>';
      }).join('') + '</div>' : '') +
      '<div class="asker" style="margin-top:14px;margin-bottom:0">' +
      '<div class="avatar ' + avatarClass(q.asker._id) + '">' + esc(q.asker.avatarText) + '</div>' +
      '<div><div class="asker-name">' + esc(q.asker.nickname) + '</div>' +
      '<div class="asker-time">' + timeAgo(q.createdAt) + ' 提问</div></div>' +
      '</div></div>';

    html += '<div class="section-title">全部回答 (' + list.length + ')</div>';

    if (!list.length) {
      html += '<div class="empty" style="padding:36px 30px">' +
        '<div class="empty-ico">💭</div>' +
        '<div class="empty-title">还没有人回答</div>' +
        '<div class="empty-desc">第一个回答的人，会被记住很久</div></div>';
    } else {
      html += list.map(function (a) {
        var liked = state.liked[a._id];
        return '<div class="answer ' + (a.adopted ? 'adopted' : '') + '">' +
          (a.adopted ? '<div class="adopt-flag">🏆 已采纳</div>' : '') +
          '<div class="asker">' +
          '<div class="avatar ' + avatarClass(a.author._id) + '">' + esc(a.author.avatarText) + '</div>' +
          '<div><div class="asker-name">' + esc(a.author.nickname) + '</div>' +
          '<div class="asker-time">' + timeAgo(a.createdAt) + ' · ' + esc(a.author.city || '') + '</div></div>' +
          '</div>' +
          '<div class="answer-content">' + esc(a.content) + '</div>' +
          (a.recommendOption ? '<div class="rec">👍 我选：' + esc(a.recommendOption) + '</div>' : '') +
          '<div class="answer-foot">' +
          '<span class="like ' + (liked ? 'on' : '') + '" onclick="app.like(\'' + a._id + '\')">' +
          (liked ? '❤️ ' : '🤍 ') + a.likes + '</span>' +
          (q.asker._id === 'me' && !q.adopted ? '<span style="cursor:pointer;color:var(--gold);font-weight:600" onclick="app.adopt(\'' + q._id + '\',\'' + a._id + '\')">采纳这条</span>' : '') +
          '</div></div>';
      }).join('');
    }

    html += '<div class="actionbar">' +
      '<button class="btn btn-ghost" onclick="app.share()">分享</button>' +
      '<button class="btn btn-primary" onclick="app.toast(\'这是回答输入框（原型未实现输入）\')">我来回答</button>' +
      '</div>';

    return html;
  }

  // ---------- 渲染：提问 ----------
  function renderAsk() {
    var catHtml = CATS.map(function (c) {
      return '<div class="pick-cat ' + (state.askCat === c.key ? 'on' : '') + '" onclick="app.setAskCat(\'' + c.key + '\')">' +
        c.icon + ' ' + c.name + '</div>';
    }).join('');

    var optHtml = (state.askOpts || []).map(function (o, i) {
      return '<div class="opt-input"><span class="idx">' + (i + 1) + '</span>' +
        '<input class="input" placeholder="选项 ' + (i + 1) + '" value="' + esc(o) + '" oninput="app.setOpt(' + i + ', this.value)">' +
        '<div class="del-btn" onclick="app.delOpt(' + i + ')">×</div></div>';
    }).join('');

    return '<div class="appbar plain"><div class="appbar-row">' +
      '<div class="back" onclick="app.back()">←</div>' +
      '<div style="font-size:16px;font-weight:600">提个问题</div>' +
      '<div style="width:30px"></div>' +
      '</div></div>' +
      '<div class="form">' +
      '<div class="form-group"><div class="form-label">选择分类 <span class="req">*</span></div>' +
      '<div class="pick-cats">' + catHtml + '</div></div>' +

      '<div class="form-group"><div class="form-label">你的问题 <span class="req">*</span></div>' +
      '<input class="input" placeholder="例如：今天中午吃什么" value="' + esc(state.askTitle || '') + '" oninput="app.setAskTitle(this.value)">' +
      '<div class="hint">像平时跟朋友说话那样问，越具体越容易得到好答案</div></div>' +

      '<div class="form-group"><div class="form-label">补充说明</div>' +
      '<textarea class="textarea" placeholder="说清楚你的限制条件（预算、人数、忌口、时间…）" oninput="app.setAskDesc(this.value)">' + esc(state.askDesc || '') + '</textarea></div>' +

      '<div class="form-group"><div class="form-label">给出几个选项 <span style="font-size:11px;color:var(--text-sub);font-weight:400">（选填，但强烈建议）</span></div>' +
      '<div class="opt-inputs" id="optInputs">' + optHtml + '</div>' +
      '<div class="add-opt" onclick="app.addOpt()">+ 再加一个选项</div>' +
      '<div class="hint">带选项的问题平均能多拿到 3 倍回答，因为回答者只要点一下就好</div></div>' +

      '<div class="form-group"><div class="form-label">匿名提问</div>' +
      '<div class="hint" style="margin-top:0">开启后，别人只看到问题，看不到你的昵称</div></div>' +
      '</div>' +
      '<div class="actionbar">' +
      '<button class="btn btn-ghost" onclick="app.back()">取消</button>' +
      '<button class="btn btn-primary" onclick="app.submitAsk()">发布问题</button>' +
      '</div>';
  }

  // ---------- 渲染：我的 ----------
  function renderMine() {
    var answered = DB.answers.filter(function (a) { return a.author._id === 'me'; }).length;
    var adopted = DB.answers.filter(function (a) { return a.author._id === 'me' && a.adopted; }).length;

    var html = '<div class="profile"><div class="profile-top">' +
      '<div class="avatar">我</div>' +
      '<div><div class="profile-name">我</div>' +
      '<div class="profile-sub">决策积分 120 · 已解决 3 个问题</div></div>' +
      '</div></div>';

    html += '<div class="stats">' +
      '<div class="stat"><div class="stat-num">' + state.myQuestions.length + '</div><div class="stat-label">我的提问</div></div>' +
      '<div class="stat"><div class="stat-num">' + answered + '</div><div class="stat-label">我的回答</div></div>' +
      '<div class="stat"><div class="stat-num">' + adopted + '</div><div class="stat-label">被采纳</div></div>' +
      '</div>';

    html += '<div class="menu">' +
      menuItem('📝', '我的提问', state.myQuestions.length) +
      menuItem('💬', '我的回答', answered) +
      menuItem('🏆', '我的采纳', adopted) +
      menuItem('🔖', '我的收藏', 0) +
      menuItem('📊', '决策复盘', 3) +
      '</div>';

    html += '<div class="menu">' +
      menuItem('⚙️', '设置', '') +
      menuItem('🛡️', '隐私与安全', '') +
      menuItem('💬', '意见反馈', '') +
      '</div>';

    if (state.myQuestions.length) {
      html += '<div class="section-title">我提过的问题</div><div class="list">' +
        state.myQuestions.map(cardHtml).join('') + '</div>';
    }
    return html;
  }

  function menuItem(ico, name, count) {
    return '<div class="menu-item" onclick="app.toast(\'' + name + '（原型未实现）\')">' +
      '<span class="mi-ico">' + ico + '</span><span>' + name + '</span>' +
      (count !== '' ? '<span style="margin-left:auto;color:var(--text-sub);font-size:12px">' + count + '</span>' : '') +
      '<span class="mi-arrow">›</span></div>';
  }

  // ---------- 路由 ----------
  function render() {
    var html;
    if (state.view === 'detail') html = renderDetail();
    else if (state.view === 'ask') html = renderAsk();
    else if (state.tab === 'mine') html = renderMine();
    else html = renderHome();

    screen.innerHTML = html;
    screen.scrollTop = 0;
    renderTabbar();
  }

  function renderTabbar() {
    var tabs = [
      { key: 'home', ico: '🏠', name: '广场' },
      { key: 'ask', ico: '➕', name: '提问' },
      { key: 'mine', ico: '👤', name: '我的' },
    ];
    tabbar.innerHTML = tabs.map(function (t) {
      var active = (t.key === 'home' && state.tab === 'home' && state.view === 'list') ||
        (t.key === 'mine' && state.tab === 'mine' && state.view === 'list') ||
        (t.key === 'ask' && state.view === 'ask');
      return '<div class="tab ' + (active ? 'active' : '') + '" onclick="app.tab(\'' + t.key + '\')">' +
        '<span class="ico">' + t.ico + '</span><span>' + t.name + '</span></div>';
    }).join('');
  }

  // ---------- 交互 ----------
  var app = {
    tab: function (key) {
      if (key === 'ask') {
        state.view = 'ask';
        state.askCat = state.askCat || 'eat';
        state.askTitle = state.askTitle || '';
        state.askDesc = state.askDesc || '';
        state.askOpts = state.askOpts || ['', '', ''];
      } else {
        state.view = 'list';
        state.tab = key;
      }
      render();
    },
    setCat: function (c) { state.cat = c; render(); },
    setSort: function (s) { state.sort = s; render(); },
    open: function (qid) { state.currentQid = qid; state.view = 'detail'; render(); },
    back: function () { state.view = 'list'; state.tab = 'home'; render(); },
    toast: toast,

    setAskCat: function (c) { state.askCat = c; render(); },
    setAskTitle: function (v) { state.askTitle = v; },
    setAskDesc: function (v) { state.askDesc = v; },
    setOpt: function (i, v) { state.askOpts[i] = v; },
    addOpt: function () {
      state.askOpts = (state.askOpts || []).concat(['']);
      render();
    },
    delOpt: function (i) {
      state.askOpts.splice(i, 1);
      if (!state.askOpts.length) state.askOpts = [''];
      render();
    },

    submitAsk: function () {
      if (!state.askTitle || !state.askTitle.trim()) { toast('先写下你的问题'); return; }
      var opts = (state.askOpts || []).filter(function (o) { return o && o.trim(); });
      var q = {
        _id: 'q_me_' + Date.now(),
        cat: state.askCat,
        catName: (CAT_MAP[state.askCat] || {}).name,
        title: state.askTitle.trim(),
        desc: (state.askDesc || '').trim(),
        images: [],
        options: opts.map(function (o, i) { return { key: 'o' + (i + 1), text: o.trim(), votes: 0, isRecommend: false }; }),
        totalVotes: 0,
        answerCount: 0,
        adopted: false,
        adoptedAnswerId: null,
        asker: { _id: 'me', nickname: '我', avatarText: '我' },
        city: '上海',
        status: 'pending',
        anonymous: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        heat: 20,
        isLocal: true,
      };
      DB.questions.unshift(q);
      state.myQuestions.unshift(q);
      state.askTitle = ''; state.askDesc = ''; state.askOpts = ['', '', ''];
      toast('发布成功！已推送给附近的人');
      state.view = 'list'; state.tab = 'home'; state.cat = 'all';
      render();
    },

    vote: function (qid, key) {
      var q = findQ(qid);
      if (!q) return;
      var o = q.options.filter(function (x) { return x.key === key; })[0];
      if (!o) return;
      o.votes += 1; q.totalVotes += 1;
      toast('已投票：' + o.text);
      render();
    },

    like: function (aid) {
      var a = DB.answers.filter(function (x) { return x._id === aid; })[0];
      if (!a) return;
      if (state.liked[aid]) { a.likes -= 1; delete state.liked[aid]; }
      else { a.likes += 1; state.liked[aid] = true; }
      render();
    },

    adopt: function (qid, aid) {
      var q = findQ(qid);
      if (!q) return;
      q.adopted = true; q.status = 'adopted'; q.adoptedAnswerId = aid;
      answersOf(qid).forEach(function (a) { a.adopted = (a._id === aid); });
      toast('已采纳，答案作者会收到通知');
      render();
    },

    share: function () {
      var mask = document.createElement('div');
      mask.className = 'share-mask show';
      mask.innerHTML = '<div class="share-arrow">⬆️</div>' +
        '<div style="font-size:16px;font-weight:600">分享给微信好友</div>' +
        '<div style="font-size:13px;opacity:.8;line-height:1.6">把这个纠结交给朋友，<br>看看他们怎么选</div>';
      mask.onclick = function () { mask.remove(); };
      document.querySelector('.phone').appendChild(mask);
    },
  };

  window.app = app;
  render();
})();
