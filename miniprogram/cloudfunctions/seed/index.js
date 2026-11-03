/**
 * 问搭 · 种子数据导入云函数
 *
 * action：
 *   import   导入 / 覆盖种子数据（把 seed.bundle.json 写入云数据库）
 *   clear    清空业务数据（仅管理员）
 *   check    检查当前数据量
 *
 * 用法：在微信开发者工具中右键云函数 → 上传并部署，然后本地调用：
 *   wx.cloud.callFunction({ name: 'seed', data: { action: 'import' } })
 */
const cloud = require('wx-server-sdk');
const fs = require('fs');
const path = require('path');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const QUESTION = 'questions';
const ANSWER = 'answers';
const USER = 'users';

function ok(data) {
  return { code: 0, data };
}
function fail(message) {
  return { code: 1, message };
}

/** 读取随函数打包的种子包 */
function loadBundle() {
  const candidates = [
    path.join(__dirname, 'seed.bundle.json'),
    path.join(__dirname, '..', '..', 'data', 'seed.json'),
    path.join(process.cwd(), 'seed.bundle.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.warn('[问搭] 读取种子包失败:', p, e.message);
    }
  }
  return null;
}

/** 批量写入（每批 20 条，符合云数据库单次写入上限） */
async function batchInsert(collection, docs, size = 20) {
  let count = 0;
  for (let i = 0; i < docs.length; i += size) {
    const chunk = docs.slice(i, i + size);
    for (const doc of chunk) {
      await db.collection(collection).add({ data: doc });
      count++;
    }
  }
  return count;
}

/** 按 _id 覆盖写入（先查存在再决定 add 或 set） */
async function upsertById(collection, docs, size = 20) {
  let added = 0;
  let updated = 0;
  for (let i = 0; i < docs.length; i += size) {
    const chunk = docs.slice(i, i + size);
    for (const doc of chunk) {
      const exist = await db.collection(collection).where({ _id: doc._id }).limit(1).get();
      if (exist.data.length) {
        const { _id, ...rest } = doc;
        await db.collection(collection).where({ _id }).update({ data: rest });
        updated++;
      } else {
        await db.collection(collection).add({ data: doc });
        added++;
      }
    }
  }
  return { added, updated };
}

exports.main = async (event) => {
  const action = event.action || 'import';

  try {
    if (action === 'check') {
      const [q, a, u] = await Promise.all([
        db.collection(QUESTION).count(),
        db.collection(ANSWER).count(),
        db.collection(USER).count(),
      ]);
      return ok({ questionCount: q.total, answerCount: a.total, userCount: u.total });
    }

    if (action === 'clear') {
      const bundle = loadBundle();
      const questionIds = bundle ? bundle.questions.map((q) => q._id) : [];
      const answerIds = bundle ? bundle.answers.map((a) => a._id) : [];

      for (let i = 0; i < questionIds.length; i += 20) {
        await db.collection(QUESTION).where({ _id: db.command.in(questionIds.slice(i, i + 20)) }).remove();
      }
      for (let i = 0; i < answerIds.length; i += 20) {
        await db.collection(ANSWER).where({ _id: db.command.in(answerIds.slice(i, i + 20)) }).remove();
      }
      return ok({ cleared: true });
    }

    if (action === 'import') {
      const bundle = loadBundle();
      if (!bundle) {
        return fail(
          '找不到种子数据文件。请把 seed/seed.bundle.json 复制到 cloudfunctions/seed/ 目录下后重新部署。'
        );
      }

      const usersResult = await upsertById(USER, bundle.users);
      const questionsResult = await upsertById(QUESTION, bundle.questions);
      const answersResult = await upsertById(ANSWER, bundle.answers);

      return ok({
        users: usersResult,
        questions: questionsResult,
        answers: answersResult,
        stats: bundle.stats,
      });
    }

    return fail(`未知 action: ${action}`);
  } catch (err) {
    console.error('[问搭] seed 执行失败:', err);
    return fail(err.message || '导入失败');
  }
};
