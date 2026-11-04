# 问搭 · 数据模型

## 集合总览

| 集合 | 用途 | 关键索引 |
|---|---|---|
| `questions` | 问题 | `status`、`cat`、`heat`、`createdAt` |
| `answers` | 回答 | `questionId`、`adopted`、`createdAt` |
| `users` | 用户 | `_id`（= openid） |
| `votes` | 投票与点赞记录 | `openid + questionId + type`、`openid + answerId + type` |
| `reports` | 举报 | `status`、`createdAt` |
| `events` | 事件埋点 | `event`、`createdAt` |

---

## questions

```js
{
  _id: 'q_1750000000000_a1b2',        // 时间戳 + openid 后 4 位
  cat: 'eat',                          // 分类 key
  catName: '吃什么',
  title: '今天中午一个人吃什么',          // ≤50 字
  desc: '公司在望京SOHO楼下，预算30以内',   // ≤300 字
  images: [],                         // 预留，V2
  options: [
    { key: 'o1', text: '川渝小面', votes: 42, isRecommend: false },
    { key: 'o2', text: '黄焖鸡',   votes: 15, isRecommend: true }
  ],
  totalVotes: 57,                     // = options.votes 之和
  answerCount: 2,
  adopted: false,
  adoptedAnswerId: null,
  asker: {
    _id: 'openid 或 anon',
    nickname: '提问小友10',
    avatarText: '提问'                // 头像用文字渲染，省图片存储
  },
  city: '北京',
  status: 'pending',                  // pending | answered | adopted | hidden
  anonymous: false,
  createdAt: 1750000000000,
  updatedAt: 1750000000000,
  heat: 128.4                         // 排序用，冗余字段
}
```

### heat 计算

```js
hoursOld = (now - createdAt) / 3600000
decay = max(0.35, 1 - hoursOld / 720)        // 30 天线性衰减
pendingBoost = (status === 'pending') ? 12 : 0
heat = round((totalVotes * 3 + answerCount * 6 + 20 + pendingBoost) * decay * 10) / 10
```

**为什么这么设计**：
- 票数权重高于回答数（投票是更强的信号）
- 待回答问题 +12，保证「没人答的问题」也有曝光，避免冷启动期广场全是已解决问题
- 时间衰减让新内容有机会，不让老内容霸榜

### status 流转

```
pending ──收到回答──→ answered ──被采纳──→ adopted
   └──────运营隐藏────────────────────────→ hidden
```

---

## answers

```js
{
  _id: 'a_1750000000000_a1b2',
  questionId: 'q_1750000000000_a1b2',
  author: {
    _id: 'openid',
    nickname: '吃货小陈',
    avatarText: '吃货',
    city: '北京'
  },
  content: '楼下的沙县其实比黄焖鸡强…',   // ≤500 字
  recommendOption: '沙县',               // 可空
  likes: 30,
  adopted: false,
  status: 'normal',                     // normal | hidden
  createdAt: 1750000000000
}
```

---

## users

```js
{
  _id: 'openid',                        // 直接用 openid 做主键
  openid: 'openid',
  nickname: '问搭用户a1b2',
  avatarText: 'a1',
  city: '未知',
  points: 120,                          // 决策积分
  answerCount: 12,
  adoptCount: 3,
  role: 'user',                         // user | ops | admin
  createdAt: serverDate()
}
```

### 积分规则

| 行为 | 积分 |
|---|---|
| 回答被采纳 | +10 |
| 提交回答 | +5 |
| 投票 / 点赞 | 0（防刷） |

积分只用于荣誉体系（称号、头像框），**不兑换实物、不涉及交易**，避免支付合规问题。

---

## votes

```js
{
  _id: 'auto',
  openid: 'openid',
  questionId: 'q_xxx',                  // 选项投票时
  optionKey: 'o2',
  answerId: 'a_xxx',                    // 点赞时
  type: 'option',                       // option | like
  createdAt: 1750000000000
}
```

**幂等设计**：写入前先查 `{openid, questionId, type:'option'}`，命中则拒绝重复投票。
查完再写存在极小竞态窗口，当前规模（千级日活）可接受；规模上去后改用唯一索引或事务。

---

## reports

```js
{
  _id: 'auto',
  targetId: 'q_xxx',
  targetType: 'question',               // question | answer
  reason: '内容不实',
  openid: '举报人 openid',
  status: 'pending',                    // pending | handled | dismissed
  createdAt: 1750000000000
}
```

---

## events

埋点集合，由 `qa` 云函数的 `track` action 批量写入。

```js
{
  _id: 'auto',
  openid: 'openid',
  event: 'question_view',        // 事件名，见 docs/METRICS.md
  targetId: 'q_xxx',
  params: { cat: 'eat' },
  createdAt: 1750000000000
}
```

**实现要点**：
- 客户端 `services/tracker.js` 批量攒批，攒够 10 条或超 15 秒发一次
- 上报失败自动回退队列，最多保留 50 条待重试
- 单次调用上限 50 条，防止被滥用写入海量数据

---

## 云函数 action 契约

### qa

| action | 入参 | 返回 |
|---|---|---|
| `bootstrap` | — | `{ user }` |
| `listQuestions` | `{ cat, sort, page, size }` | `{ list, total, hasMore }` |
| `getQuestion` | `{ id }` | `{ question, answers }` |
| `createQuestion` | `{ cat, title, desc, options, anonymous }` | `{ question }` |
| `addAnswer` | `{ questionId, content, recommendOption }` | `{ answer }` |
| `vote` | `{ questionId, optionKey }` | `{ question }` |
| `adopt` | `{ questionId, answerId }` | `{ question }` |
| `like` | `{ answerId }` | `{ likes, liked }` |
| `mine` | — | `{ user, myQuestions, myAnswers, stats }` |
| `report` | `{ targetId, targetType, reason }` | `{ reported }` |
| `track` | `{ events: [...] }` | `{ tracked }` |

### admin（需 role = admin / ops）

| action | 入参 | 返回 |
|---|---|---|
| `adminList` | `{ status, page, size }` | `{ list }` |
| `adminHide` | `{ id, status }` | `{ id, status }` |
| `adminStats` | — | `{ questionCount, answerCount, userCount, pendingCount }` |

### seed

| action | 说明 |
|---|---|
| `import` | 读取 `seed.bundle.json`，按 `_id` upsert 写入三个集合 |
| `clear` | 清除种子数据 |
| `check` | 返回当前数据量 |

---

## 安全要点

| 风险 | 处理 |
|---|---|
| 垃圾内容 | `msgSecCheck` 文字检测，命中直接拒绝；图片 V2 走 `imgSecCheck` |
| 刷票 | `votes` 表幂等校验，一人一票 |
| 刷回答 | 回答需通过内容审核；举报 + 后台隐藏 |
| 越权采纳 | 云端校验 `asker._id === openid` |
| 越权后台 | 云端校验 `user.role` |
| 隐私泄露 | 匿名提问时不写入提问者昵称；不采集位置 |
| 敏感信息 | 不在日志里打印 openid 以外的敏感字段 |

---

## 扩展预留

- `questions.images[]` — V2 支持带图提问
- `questions.location` — V2 同城玩法
- `answers.parentId` — V2 支持回答的评论
- `questions.tags[]` — V2 话题标签
- `users.familyId` — V3 家庭空间

新增字段一律**可选**，旧数据不需要迁移。
