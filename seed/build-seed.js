#!/usr/bin/env node
/**
 * 问搭 · 种子数据编译器
 *
 * 输入（多个纯文本源文件，便于非技术人员直接编辑内容）：
 *   seed/questions.src.txt   已采纳的问题（8 列：cat|title|desc|options|answerer|answerContent|answerOption|city）
 *   seed/questions3.src.txt  已采纳的问题（第二批，同上格式）
 *   seed/answers2.src.txt    补充的第二条回答（6 列：cat|title|answerer|answerContent|answerOption|city）
 *   seed/pending.src.txt     待回答的问题（6 列：cat|title|desc|options|city|askerName）
 *
 * 输出：
 *   seed/questions.json   问题（含选项与统计）
 *   seed/answers.json     回答
 *   seed/users.json       虚拟用户
 *   seed/index.json       汇总清单
 *   seed/seed.bundle.json 全量包（云函数一次性导入用）
 *
 * 用法：node seed/build-seed.js
 */
const fs = require('fs');
const path = require('path');

const SEED_DIR = __dirname;

const CATEGORIES = {
  eat: { key: 'eat', name: '吃什么', icon: '🍜', color: '#FF7A45' },
  wear: { key: 'wear', name: '穿什么', icon: '👕', color: '#597EF7' },
  play: { key: 'play', name: '去哪玩', icon: '🎈', color: '#36CFC9' },
  kid: { key: 'kid', name: '带孩子', icon: '🧸', color: '#9254DE' },
  gift: { key: 'gift', name: '送什么', icon: '🎁', color: '#EB2F96' },
  buy: { key: 'buy', name: '买不买', icon: '🛒', color: '#52C41A' },
};

const BASE_TIME = Date.parse('2026-11-01T09:00:00+08:00');
const HOUR = 3600 * 1000;

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

/** 基于字符串生成稳定短 ID，保证构建可复现 */
function shortId(prefix, str, i) {
  let h = 0;
  for (let k = 0; k < str.length; k++) h = (h * 31 + str.charCodeAt(k)) >>> 0;
  return `${prefix}_${pad(i, 3)}${h.toString(36).slice(0, 4)}`;
}

/** 确定性伪随机：同样的字符串永远得到同样的序列 */
function seededRandom(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return function next() {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readSrc(file) {
  const full = path.join(SEED_DIR, file);
  if (!fs.existsSync(full)) return [];
  return fs
    .readFileSync(full, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function splitCols(line, expected, file, index) {
  const cols = line.split('|').map((s) => s.trim());
  if (cols.length !== expected) {
    throw new Error(`${file} 第 ${index + 1} 行字段数不对（期望 ${expected}，实际 ${cols.length}）`);
  }
  return cols;
}

function parseOptions(raw) {
  if (!raw || raw === '-') return [];
  return raw.split('^').map((s) => s.trim()).filter(Boolean);
}

function build() {
  const errors = [];
  const users = new Map();
  const questions = [];
  const answers = [];

  const ensureUser = (id, nickname, city, role = 'user') => {
    if (!users.has(id)) {
      users.set(id, {
        _id: id,
        nickname,
        avatarText: nickname.slice(0, 2),
        city: city || '未知',
        points: 0,
        answerCount: 0,
        adoptCount: 0,
        role,
        isSeed: true,
      });
    }
    return users.get(id);
  };

  /**
   * 按昵称统一注册：同一个人（同昵称）永远只有一个 user id。
   * 否则同一条问题下会出现两个「厨房小张」，看起来像 bug。
   */
  const userIdByName = new Map();
  const ensureUserByName = (nickname, city) => {
    if (!userIdByName.has(nickname)) {
      const id = 'u_' + shortId('n', nickname, userIdByName.size).slice(2);
      userIdByName.set(nickname, id);
    }
    return ensureUser(userIdByName.get(nickname), nickname, city);
  };

  // ---------- 1. 已采纳问题 ----------
  // 支持多个源文件，按顺序拼接
  const QUESTION_SOURCES = ['questions.src.txt', 'questions3.src.txt'];
  const parsedQuestions = [];
  QUESTION_SOURCES.forEach((file) => {
    readSrc(file).forEach((line, i) => {
      try {
        const [cat, title, desc, optRaw, answerer, answerContent, answerOption, city] = splitCols(
          line, 8, file, i
        );
        if (!CATEGORIES[cat]) throw new Error(`${file} 第 ${i + 1} 行分类非法：${cat}`);
        if (!answerContent) throw new Error(`${file} 第 ${i + 1} 行回答为空`);
        parsedQuestions.push({
          cat,
          title,
          desc,
          optionTexts: parseOptions(optRaw),
          answerer,
          answerContent,
          answerOption,
          city,
        });
      } catch (e) {
        errors.push(e.message);
      }
    });
  });

  parsedQuestions.forEach((p, i) => {
    const rnd = seededRandom(p.title);
    const qid = shortId('q', p.title, i);
    const createdAt = BASE_TIME + i * 5 * HOUR;

    const answerIdx = p.optionTexts.indexOf(p.answerOption);
    const options = p.optionTexts.map((text, oi) => {
      const isPick = oi === answerIdx;
      const votes = isPick ? 14 + Math.floor(rnd() * 42) : Math.floor(rnd() * (isPick ? 6 : 18));
      return { key: `o${oi + 1}`, text, votes, isRecommend: isPick };
    });
    const totalVotes = options.reduce((s, o) => s + o.votes, 0);

    const askerId = `u_ask_${pad((i % 11) + 1)}`;
    const askerName = `提问小友${pad((i % 11) + 1)}`;
    ensureUser(askerId, askerName, p.city);

    const ansUser = ensureUserByName(p.answerer, p.city);
    const ansId = ansUser._id;
    ansUser.answerCount += 1;
    ansUser.adoptCount += 1;
    ansUser.points += 10;

    const ansId2 = shortId('a', p.title + p.answerer, i);

    questions.push({
      _id: qid,
      cat: p.cat,
      catName: CATEGORIES[p.cat].name,
      title: p.title,
      desc: p.desc,
      images: [],
      options,
      totalVotes,
      answerCount: 1,
      adopted: true,
      adoptedAnswerId: ansId2,
      asker: { _id: askerId, nickname: askerName, avatarText: askerName.slice(-2) },
      city: p.city,
      status: 'adopted',
      anonymous: false,
      createdAt,
      updatedAt: createdAt + 2 * HOUR,
      isSeed: true,
      seedIndex: i,
    });

    answers.push({
      _id: ansId2,
      questionId: qid,
      author: { _id: ansId, nickname: p.answerer, avatarText: p.answerer.slice(0, 2), city: p.city },
      content: p.answerText,
      recommendOption: answerIdx >= 0 ? p.optionTexts[answerIdx] : null,
      likes: Math.floor(rnd() * 32),
      adopted: true,
      status: 'normal',
      createdAt: createdAt + 2 * HOUR,
      isSeed: true,
    });
  });

  // ---------- 2. 第二条回答 ----------
  const a2Lines = readSrc('answers2.src.txt');
  a2Lines.forEach((line, i) => {
    try {
      const [cat, title, answerer, answerContent, answerOption, city] = splitCols(line, 6, 'answers2.src.txt', i);
      const q = questions.find((x) => x.title === title && x.cat === cat);
      if (!q) throw new Error(`answers2.src.txt 第 ${i + 1} 行找不到对应问题：${cat} / ${title}`);

      const ansUser = ensureUserByName(answerer, city);
      const ansId = ansUser._id;
      ansUser.answerCount += 1;
      ansUser.points += 5;

      const rnd = seededRandom(title + answerer);
      const answerId = shortId('a2', title + answerer, i);

      answers.push({
        _id: answerId,
        questionId: q._id,
        author: { _id: ansId, nickname: answerer, avatarText: answerer.slice(0, 2), city },
        content: answerContent,
        recommendOption: answerOption || null,
        likes: Math.floor(rnd() * 18),
        adopted: false,
        status: 'normal',
        createdAt: q.createdAt + 4 * HOUR,
        isSeed: true,
      });

      q.answerCount += 1;
      // 第二条回答的推荐项也计入该选项票数（增量只算一次，避免 totalVotes 与选项票数不一致）
      const opt = q.options.find((o) => o.text === answerOption);
      if (opt) {
        const inc = 3 + Math.floor(rnd() * 10);
        opt.votes += inc;
        q.totalVotes += inc;
      }
      q.updatedAt = Math.max(q.updatedAt, q.createdAt + 4 * HOUR);
    } catch (e) {
      errors.push(e.message);
    }
  });

  // ---------- 3. 待回答问题 ----------
  const pLines = readSrc('pending.src.txt');
  pLines.forEach((line, i) => {
    try {
      const [cat, title, desc, optRaw, city, askerName] = splitCols(line, 6, 'pending.src.txt', i);
      if (!CATEGORIES[cat]) throw new Error(`pending.src.txt 第 ${i + 1} 行分类非法：${cat}`);
      const optionTexts = parseOptions(optRaw);
      const rnd = seededRandom(title);
      const options = optionTexts.map((text, oi) => ({
        key: `o${oi + 1}`,
        text,
        votes: Math.floor(rnd() * 12),
        isRecommend: false,
      }));
      const totalVotes = options.reduce((s, o) => s + o.votes, 0);
      const qid = shortId('qp', title, i);
      const createdAt = BASE_TIME + (parsedQuestions.length + i) * 3 * HOUR;
      const askerId = `u_ask_${pad((i % 11) + 1)}`;
      const asker = ensureUser(askerId, askerName || '提问小友', city);

      questions.push({
        _id: qid,
        cat,
        catName: CATEGORIES[cat].name,
        title,
        desc,
        images: [],
        options,
        totalVotes,
        answerCount: 0,
        adopted: false,
        adoptedAnswerId: null,
        asker: { _id: askerId, nickname: askerName || '提问小友', avatarText: (askerName || '提问小友').slice(0, 2) },
        city,
        status: 'pending',
        anonymous: false,
        createdAt,
        updatedAt: createdAt,
        isSeed: true,
        seedIndex: parsedQuestions.length + i,
      });
      void asker;
    } catch (e) {
      errors.push(e.message);
    }
  });

  if (errors.length) {
    console.error(`❌ 共 ${errors.length} 行有问题：`);
    errors.forEach((e) => console.error('   ' + e));
    process.exit(1);
  }

  // ---------- 4. 热度分 ----------
  const now = BASE_TIME + 600 * HOUR;
  questions.forEach((q) => {
    const hoursOld = (now - q.createdAt) / HOUR;
    const decay = Math.max(0.35, 1 - hoursOld / 720);
    const pendingBoost = q.status === 'pending' ? 12 : 0;
    q.heat = Math.round((q.totalVotes * 3 + q.answerCount * 6 + 20 + pendingBoost) * decay * 10) / 10;
  });

  const userList = [...users.values()];

  const stats = {
    questionCount: questions.length,
    answerCount: answers.length,
    userCount: userList.length,
    pendingCount: questions.filter((q) => q.status === 'pending').length,
    adoptedCount: questions.filter((q) => q.status === 'adopted').length,
    byCategory: Object.keys(CATEGORIES).reduce((acc, k) => {
      acc[k] = questions.filter((q) => q.cat === k).length;
      return acc;
    }, {}),
  };

  const bundle = {
    questions,
    answers,
    users: userList,
    categories: Object.values(CATEGORIES),
    stats,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(SEED_DIR, 'questions.json'), JSON.stringify(questions, null, 2), 'utf8');
  fs.writeFileSync(path.join(SEED_DIR, 'answers.json'), JSON.stringify(answers, null, 2), 'utf8');
  fs.writeFileSync(path.join(SEED_DIR, 'users.json'), JSON.stringify(userList, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(SEED_DIR, 'index.json'),
    JSON.stringify({ stats, categories: bundle.categories, files: ['users', 'questions', 'answers'] }, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(SEED_DIR, 'seed.bundle.json'), JSON.stringify(bundle, null, 2), 'utf8');

  // 供 HTML 原型直接 <script> 引入
  const protoDir = path.join(SEED_DIR, '..', 'prototype');
  if (fs.existsSync(protoDir)) {
    fs.writeFileSync(
      path.join(protoDir, 'seed.bundle.js'),
      '/* 自动生成，请勿手改；改内容请编辑 seed/*.src.txt 后运行 build-seed.js */\n' +
        'window.SEED_BUNDLE = ' + JSON.stringify(bundle) + ';\n',
      'utf8'
    );
  }

  // 供小程序 mock 数据层使用
  const mpDir = path.join(SEED_DIR, '..', 'miniprogram', 'data');
  if (fs.existsSync(mpDir)) {
    fs.writeFileSync(path.join(mpDir, 'seed.json'), JSON.stringify(bundle), 'utf8');
  }

  console.log('✅ 种子数据构建完成');
  console.log(`   问题 ${stats.questionCount}（已采纳 ${stats.adoptedCount} / 待回答 ${stats.pendingCount}）`);
  console.log(`   回答 ${stats.answerCount} / 用户 ${stats.userCount}`);
  console.log('   分类分布:', JSON.stringify(stats.byCategory));
}

try {
  build();
} catch (err) {
  console.error('❌ 构建失败:', err.stack);
  process.exit(1);
}
