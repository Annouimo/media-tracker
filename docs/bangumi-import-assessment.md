# Bangumi 数据接入评估报告（初版）

> **最终决定（2026-10-27）**：没有采用 `works.source` / `external_id`，迁移 0002 已移除；`works.id = bgm-{subject_id}` 已经能识别来源，生产导入只用 0001 schema。下面关于 0002 / B-lite 的段落是当时的评估，不是最终方案。
>
> **2026-10-27 更新（重要）**：本报告第 1、3.4、5 节关于“Bangumi 没有历史、每部作品只能写 1 条 log”的结论已被时间胶囊导出推翻。时间胶囊可以导出 **1266 条事件**，动画重建出 **1219 条 log**（其中 1176 条有精确时间）。最新方案和实测结果见 [bangumi-timeline-export.md](bangumi-timeline-export.md)。
>
> 本报告仍然有效的部分：项目数据结构、`works`/`logs` 字段映射、动画分类、评分/文案/隐私等风险分析。

---

> 评估对象：`media-tracker`（当前 `main`，已包含 M7 分类导航）
> Bangumi 账号：[Annouimo / 793266](https://bgm.tv/user/793266)
> 评估时间：2026-10-27
> 数据来源：Bangumi API v0 实测 + 项目源码 / README / migrations
>
> **结论先行：可以做。数据结构约 80% 匹配，建议按“只读快照 + 新增分类”接入，不建议做双向同步。**

---

## 1. 结论摘要

- 已实测拉取到 **307 条** Bangumi 收藏，公开可读，不需要 access token。
- 站点的 `works` + `logs` 能承载核心数据：标题、类型、年份、总集数、进度、状态、短评。
- Bangumi 的 5 种收藏状态可以一一映射到站点的 5 种状态。
- 站点在 M7 已经有分类机制，新增 **动画 / 游戏 / 音乐** 只需在 `shared/categories.ts` 加 3 行。
- 导入后预计：
  - `works`：284 → **591**（以 2026-10-27 生产备份为准：283 条旧数据 + 1 条新记录）
  - `logs`：372 → **569**（Bangumi 侧 197 条）
  - 公开作品：53 → **239**（新增 186 条）
- 主要缺口：
  1. **Bangumi 没有历史时间线**，`updated_at` 官方明确说明不可靠；184 条“看过”里有 82 条集中在 2023-05-28 / 2023-06-04 两天。
  2. 站点没有 **评分 / 封面 / 标签 / 平台 / 来源链接** 字段；87 条评分只能保留在原始 JSON 快照里。
  3. 站点文案和交互是**图书专用**的（读 / 章 / 本），动画需要显示“看 / 话 / 部”，涉及 20+ 处文案。
  4. 当前环境下生产 D1 没有可用的写入凭据；导入需要 Cloudflare API Token、DBX，或新增后台导入接口。
  5. 公开可见性由“曾经 `done` 或当前 `reading`”决定；导入后 186 条会公开。如果只想私下保存，需要新增可见性字段。

**建议**：先做“核心快照”版本（分类 + 307 部作品 + 197 条 log + 原始 JSON 留档），把 Bangumi 当作唯一写入源；评分、封面、历史日期等作为后续增强。

---

## 2. 当前项目的数据结构

### 2.1 两张主表

```sql
works (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  creator         TEXT NOT NULL DEFAULT '',
  release_year    INTEGER,
  type            TEXT NOT NULL DEFAULT 'Book',
  total_progress  INTEGER NOT NULL DEFAULT 1,  -- 总章节 / 总集数；1 = 未设置
  short_review    TEXT NOT NULL DEFAULT '',
  long_review_url TEXT NOT NULL DEFAULT '',
  added_at        INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  legacy_id       INTEGER,
  deleted_at      INTEGER
)

logs (
  id              TEXT PRIMARY KEY,
  work_id         TEXT NOT NULL REFERENCES works(id),
  seq             INTEGER NOT NULL,            -- 每部作品内递增
  event           TEXT NOT NULL,               -- progress | status | both
  status          TEXT NOT NULL,               -- wish | reading | done | paused | dropped
  progress        INTEGER NOT NULL,
  total_snapshot  INTEGER NOT NULL,
  round           INTEGER NOT NULL DEFAULT 1,
  logged_on       TEXT NOT NULL,               -- YYYY-MM-DD
  logged_at       INTEGER,                     -- epoch ms；NULL = 只有日期
  source          TEXT NOT NULL,               -- user | migration
  inferred        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  UNIQUE (work_id, seq)
)
```

### 2.2 状态与公开规则

- `works` **不保存状态**；当前状态 = 该作品 `seq` 最大的 log；没有 log = `wish` / 进度 0。
- 状态只有 5 种：`wish / reading / done / paused / dropped`。
- 公开条件（`worker/domain/state.ts`）：
  - 曾经有过 `done` log，**或**
  - 当前状态是 `reading`。
- 因此：想看、搁置、弃读，且从未读完的作品只在 `/admin` 出现。
- `finished_on` = 最近一次 `status='done'` 的 `logged_on`，公开列表按它倒序。

### 2.3 分类机制

`shared/categories.ts` 是唯一注册表：

```ts
export const CATEGORIES = [
  { slug: 'book',     label: '图书', path: '/books',     type: 'Book' },
  { slug: 'textbook', label: '教材', path: '/textbooks', type: 'Textbook' },
] as const
```

- 路由、顶部导航、公开 API、后台类型筛选都从这张表读取。
- 新增分类只需加一行；`works.type` 使用同一个 `type` 值。
- 公开详情 `/works/:id` 只判断“作品是否公开”，**不判断分类**；未注册分类的作品不会出现在列表里，但知道 id 仍可访问。
- 当前公开数量（README）：图书 49 + 教材 4 = 53。

### 2.4 导入基础设施

- `import_batches` 表已存在，但代码里**没有使用**；目前只用于旧数据迁移审计。
- 旧数据通过 `scripts/transform-legacy.ts` 生成 `works.json` / `logs.json` / SQL / manifest，再用 DBX 导入。
- 后台 API 没有批量导入端点，只有单条创建 / 编辑 / 进度 / 状态 / 撤销。
- `logs.source` 目前只允许 `user`、`migration`，没有 `bangumi`。

---

## 3. Bangumi 侧数据画像（实测）

### 3.1 账号与总量

- 账号：`Annouimo` / `793266`，2023-05-28 加入。
- 收藏总数：**307**，返回的 307 条全部 `private = false`。
  - 未授权请求本来就不会返回私有收藏；公开主页的分项计数（280 + 19 + 6 + 2）与 API `total` 完全一致，因此判断没有私有项。若要 100% 确认，需要带 token 再对一次 `total`。
- 收藏类型 × 条目类型：

| 条目类型 | 想看 | 看过 | 在看 | 搁置 | 抛弃 | 合计 |
|---|---:|---:|---:|---:|---:|---:|
| 动画 | 108 | 163 | 0 | 8 | 1 | **280** |
| 音乐 | 0 | 19 | 0 | 0 | 0 | **19** |
| 游戏 | 2 | 2 | 2 | 0 | 0 | **6** |
| 书籍 | 0 | 0 | 0 | 2 | 0 | **2** |
| 合计 | **110** | **184** | **2** | **10** | **1** | **307** |

- 导入后公开：动画 163 + 音乐 19 + 游戏 4 = **186**。
- 导入后仅在后台：**121**（想看 110 + 搁置 10 + 抛弃 1；其中想看包含 2 部游戏）。
- 书籍 2 本会并入现有 `/books`，且因为当前是搁置、从未读完，不会公开。

### 3.2 字段可用性

| 字段 | 是否可用 | 说明 |
|---|---|---|
| `subject.name` / `name_cn` | 是 | 23 条没有 `name_cn`，标题需回退到日文名 |
| `subject.date` | 是 | 2 条缺失（都是未开播动画），`release_year` 置 NULL |
| `subject.eps` | 是 | 27 条为 0：19 音乐 + 6 游戏 + 2 未开播动画 |
| `subject.volumes` | 是 | 仅书籍有意义；305 条为 0 |
| `ep_status` | 是 | 动画/书籍的已看集数或章节数 |
| `vol_status` | 是 | 书籍已读卷数 |
| `rate` | 是 | 87 条有评分，均值 7.39（1–10） |
| `comment` | 是 | **0 条有短评** |
| `tags` | 是 | 只有 2 条有用户标签（都是“二刷”） |
| `private` | 是 | 全部 false |
| `subject.images` | 是 | 站点不存封面 |
| `subject.short_summary` | 是 | 截断到约 120 字；站点不存简介 |
| `creator` | **否** | 收藏列表接口不返回作者/导演/制作；要额外请求 307 次条目详情 |
| `platform` | 仅详情 | TV / 剧场版 / 小说 / 漫画等；站点无字段 |
| 收藏历史 / 收藏时间 | **否** | API 没有时间线接口 |

### 3.3 API 约束（实测）

- **必须带 User-Agent**。不带 UA 返回 `403`：
  ```json
  {"title":"Forbidden","description":"Please set a 'User-Agent'"}
  ```
  建议格式：`annouimo/media-tracker (https://gallery.annouimo.com)`。
- 分页：OpenAPI 文档 `limit` 上限 **50**；实测传 100 也接受，但脚本应按 50 写，307 条约 7 次请求。
- 私有收藏：查看需要 `Authorization: Bearer <token>`；当前 307 条全部公开，不需要。
- 条目详情：`GET /v0/subjects/{id}`，包含 `infobox`（作者 / 导演 / 艺术家 / 开发等），307 次请求。
- 限速：OpenAPI 没写死上限；社区惯例约 1 req/s。按 1.1s 间隔，307 条详情约 5–6 分钟。
- `updated_at` 官方说明（原文）：
  > 本时间并不代表条目的收藏时间。修改评分，评价，章节观看状态等收藏信息时未更新此时间是一个 bug。请不要依赖此特性。
- **没有历史接口**：只能拿到“当前状态”，拿不到“什么时候改成看过/在看”。

### 3.4 日期质量（关键问题）

- `updated_at` 范围：2023-05-28 ～ 2026-03-15。
- 按年：2023 年 172 条、2024 年 88 条、2025 年 46 条、2026 年 1 条。
- 184 条“看过”分布在 88 个不同日期，但：
  - **2023-06-04：61 条**
  - **2023-05-28：21 条**
  - 两天合计 82 条，占 44.6%
- 这与账号 2023-05-28 加入、批量导入收藏的行为吻合。
- 如果直接把 `updated_at` 当作 `finished_on`：
  - 61 部作品会显示“读完于 2023-06-04”；
  - 公开页的日期排序会出现巨大堆叠；
  - 详情页的“读完于”会给出错误精度。

---

## 4. 字段映射建议

### 4.1 状态映射

| Bangumi `type` | 含义 | 站点 `status` | 是否写 log | 数量 |
|---|---|---|---|---:|
| 1 | 想看 | `wish` | 否（无 log 即 wish） | 110 |
| 2 | 看过 | `done` | 是 | 184 |
| 3 | 在看 | `reading` | 是 | 2 |
| 4 | 搁置 | `paused` | 是 | 10 |
| 5 | 抛弃 | `dropped` | 是 | 1 |

> Bangumi 的“看过”是**当前状态**；站点的公开规则是“曾经读完”。如果用户把一部看完的动画改成“在看”重刷，Bangumi 会丢失“看过”标记，导入后站点也不会知道它曾经读完。当前数据里没有这种动画，但这是同步时的语义差异。

### 4.2 条目类型映射

| `subject_type` | 含义 | 站点 `works.type` | 分类 | 数量 | 导入后公开 |
|---|---|---|---:|---:|---:|
| 1 | 书籍 | `Book` | `/books`（并入现有） | 2 | 0 |
| 2 | 动画 | `Anime` | `/anime`（新增） | 280 | 163 |
| 3 | 音乐 | `Music` | `/music`（新增） | 19 | 19 |
| 4 | 游戏 | `Game` | `/games`（新增） | 6 | 4 |
| 6 | 三次元 | `Real` | 暂不注册（0 条） | 0 | 0 |

### 4.3 字段映射

| Bangumi | 站点 | 规则 |
|---|---|---|
| `subject.id` | `works.id` | 建议 `bgm-{subject_id}`，确定性、可重复导入；如加 0002，则另存 `source='bangumi'` / `external_id` |
| `name_cn` → `name` | `works.title` | 优先 `name_cn`，为空回退 `name` |
| `infobox.作者 / 导演 / 艺术家 / 开发` | `works.creator` | 需要条目详情；按类型取键，缺失则空串 |
| `subject.date` | `works.release_year` | 取前 4 位；缺失为 NULL |
| `subject_type` | `works.type` | `Book / Anime / Music / Game` |
| `subject.eps` / `ep_status` | `works.total_progress` | `max(eps, ep_status, 1)`，见 4.4 |
| `ep_status` | `logs.progress` | 动画/书籍用 `ep_status`；音乐/游戏为 0 |
| `type` | `logs.status` | 见 4.1 |
| `updated_at` | `logs.logged_on` / `logged_at` | 按 Asia/Shanghai 取日期；`inferred=1` |
| `comment` | `works.short_review` | 当前全空；以后同步时注意 BBCode |
| `rate` / `tags` / `images` | — | 站点不存；保留在原始 JSON 快照 |
| `subject.id` | `works.legacy_id` | 不建议复用；语义是旧系统整数 id |

### 4.4 总集数 / 进度的特殊情况

**A. `ep_status > eps`（7 条）**

Bangumi 的分割放送条目经常出现“条目只登记 12 集，但用户看完了 25/38 集”：

| 作品 | `ep_status` | `eps` |
|---|---:|---:|
| 命运石之门 | 26 | 25 |
| 无职转生 第2部分 | 13 | 12 |
| BanG Dream! It's MyGO!!!!! | 14 | 13 |
| Re:从零开始的异世界生活 第二季 后半部分 | 25 | 12 |
| 关于我转生变成史莱姆这档事 第二季 第2部分 | 48 | 12 |
| JOJO的奇妙冒险 石之海 | 38 | 12 |
| 间谍过家家 | 25 | 12 |

建议 `total_progress = max(eps, ep_status, 1)`，保留真实进度，并在 manifest 里记录异常；不推荐把进度截断到 12。

**B. 看完但进度为 0（动画 20 条）**

- 其中 15 条是 TV 动画，`eps > 1`，例如《间谍过家家 第2部分》0/13、《JOJO 黄金之风》0/39。
- 另外 5 条是剧场版 / 特别篇（`eps = 1`），0/1 可以接受。
- 建议保留 0，不伪造进度；前端对 `status='done' && progress=0` 显示“已看完”，而不是“0 / 13 章”。

**C. `eps = 0`（27 条）**

- 19 音乐、6 游戏、2 未开播动画。
- `total_progress` 只能写 1（数据库 `CHECK >= 1`），站点会视为“未设置章节数”。
- 游戏的 2 条“在看”会以 `total_progress = 1` 进入 `reading`；之后在后台做状态操作时，现有的“二元作品”逻辑会弹“请输入章节数”，对游戏来说文案不合适。

**D. 书籍**

- 《无职转生》：`eps=262`，`vol_status=3`，当前搁置，进度 0。
- 《来自新世界》：`eps=6`，`vol_status=0`，当前搁置，进度 1。
- 站点 `total_progress=262` 会渲染 262 个进度格子；当前还能用，但如果以后导入上千话的长篇动画，进度格子会明显变慢。

### 4.5 一条示例

以《葬送的芙莉莲》为例（`subject_id = 400602`）：

```text
works:
  id             = bgm-400602
  title          = 葬送的芙莉莲
  creator        = 斎藤圭一郎        （需条目详情）
  release_year   = 2023
  type           = Anime
  total_progress = 28
  short_review   = ''
  long_review_url= ''
  added_at       = NULL
  created_at     = 导入时间
  updated_at     = 2024-03-24 的 epoch ms

logs:
  id             = bgm-400602-1
  work_id        = bgm-400602
  seq            = 1
  event          = both
  status         = done
  progress       = 28
  total_snapshot = 28
  round          = 1
  logged_on      = 2024-03-24
  logged_at      = 2024-03-24 的 epoch ms
  source         = migration
  inferred       = 1
```

---

## 5. 风险与缺口

### P0：会影响“数据是否正确/是否该公开”

1. **日期不可靠**
   - 82/184 条“看过”集中在两天；`updated_at` 官方声明不可依赖。
   - 影响：公开页排序、详情页“读完于”、后台“读完时间”排序、以后按年统计。
   - 可选处理：接受近似 + 标注“日期来自 Bangumi 最后更新时间”；或对导入作品隐藏完成日期；或只显示年份。

2. **公开可见性 / 隐私**
   - 站点没有单作品可见性字段；只要 `done` 或 `reading` 就公开。
   - 当前 307 条全部 `private=false`，所以不会泄露新内容；但未来如果 Bangumi 上有私有收藏，未授权 fetch 会直接看不到，带 token fetch 又会把它们变公开。
   - 如果本次只想“存一份”，需要新增 `visibility` / `is_public` 字段，或导入时把 `done` 改成非公开状态（不推荐）。

3. **生产写入通道**
   - 本机 `wrangler` 没有 `CLOUDFLARE_API_TOKEN`，无法直接写远程 D1。
   - 可选：申请 D1 Edit token；用 DBX 执行 SQL；或新增 `POST /admin/api/import`。
   - 无论哪种，导入前必须先做全库备份，并验证 `works/logs` 行数。

### P1：影响体验 / 保真度

4. **文案是图书专用**
   - `shared/constants.ts`：想读 / 在读 / 读完 / 弃读。
   - `src/lib/format.ts`：`X / Y 章`、`已读完`、`未分章`。
   - 页面：`在读：`、`读过`、`读完于`、`长评 →`、`N 本`、`章节数`。
   - 动画应显示“想看 / 在看 / 看过 / 抛弃”“X / Y 话”“看完于”。
   - 至少 20+ 处；建议抽 `CategoryCopy`，按分类取文案。

5. **评分丢失**
   - 87 条有评分（均值 7.39）：10 分 1 条、9 分 10 条、8 分 28 条、7 分 35 条、6 分 9 条、5 分 4 条。
   - 站点产品决策明确“不使用评分”；如果要保留，需加 `rating` 列 + 编辑/展示。
   - 不加列也可以：原始 JSON 快照里完整保留，只是站点不展示。

6. **creator 需要额外 307 次请求**
   - 收藏列表接口不返回作者/导演/制作。
   - 需要逐条请求 `/v0/subjects/{id}`，约 5–6 分钟。
   - 映射也有歧义：动画取“导演”还是“动画制作”？书籍取“作者”，音乐取“艺术家”，游戏取“开发”。
   - 不想要可以留空，站点允许 `creator=''`。

7. **来源链接 / 外部 id**
   - 站点没有 `source_url` / `external_id`。
   - `long_review_url` 可以塞 `https://bgm.tv/subject/{id}`，但 UI 会显示“长评 →”，语义不对。
   - 建议 0002 加 `source` / `external_id` / `source_url`，或在 MVP 阶段用确定性 id `bgm-{id}` 过渡。

### P2：可以以后再做

8. **平台 / 封面 / 简介 / 标签**
   - 动画的 TV / 剧场版 / OVA 只在 `subject.platform` 或 infobox 里；站点没有字段。
   - 封面和简介站点明确不要；原始 JSON 里有。
   - 用户标签只有 2 条，暂不值得建表。

9. **没有“曾经读完”的历史**
   - Bangumi 只给当前状态；重刷中的作品会从“看过”变成“在看”。
   - 当前 280 部动画里没有“在看”，所以这次不受影响；以后同步要注意保留旧的 done log。

10. **没有增量同步设计**
    - 一次性导入简单；定期同步需要 diff：
      - 作品元数据变了 → 更新 works；
      - 状态/进度变了 → 追加 seq+1 的 log；
      - 收藏被删除 → 软删除还是保留？
    - 建议先做一次性快照，同步留到第二阶段。

11. **长作品进度格子**
    - 现在最大 262 格（书籍）；以后遇到千话动画，前端进度格子会吃内存。
    - 可加虚拟滚动或“按卷/按 10 话”分组，非本次必需。

---

## 6. 方案对比

| 方案 | 做法 | 保真度 | 工作量 | 适用 |
|---|---|---|---|---|
| **A. 核心快照（推荐 MVP）** | 新增 3 个分类；307 works + 197 logs；原始 JSON 留档；确定性 id；日期 inferred；不存评分 | 核心状态/进度完整；评分/日期有缺口 | 1–1.5 天 | 想尽快在站点看到全部收藏 |
| **B. 完整接入** | A + 0002（source/external_id/rating/source_url）+ 分类文案 + 后台导入接口 + 测试 | 高 | 3–5 天 | 长期把站点当主 archive |
| **C. 独立归档** | 只保存原始 JSON / 独立表，不进 works/logs | 原始数据最高 | 0.5 天 | 只想备份，不展示 |

**推荐路径：B-lite（A + 0002 的 `source` / `external_id`），约 1.5–2 天。**

> B-lite = 表中的 A，加上 0002 的 `source` / `external_id` 两列；暂不做评分、分类文案、后台导入接口。这样 307 条有明确来源，后续同步不用靠 id 前缀猜，也不会把改动摊得太大。

- 先不碰评分、封面、平台，避免一次改太多。
- `source` / `external_id` 让 307 条有明确来源，后续同步不用靠 id 前缀猜。
- 文案本地化单独一个 PR，避免和导入混在一起。
- 原始 JSON 快照始终保留，作为“无损底稿”。

---

## 7. 建议的落地步骤

### Phase 0：准备

1. 备份生产 D1（`wrangler d1 export` 或 DBX 全量导出）。
2. 从 `main` 切分支，例如 `feat/bangumi-import`。
3. 确认 D1 写入方式：API Token / DBX / 后台导入接口。

### Phase 1：拉取与留档

新增 `scripts/import-bangumi.ts`（无运行时依赖，Bun/Node 均可）：

- 参数：`--user 793266`、`--with-details`、`--dry-run`。
- 拉取 7 页收藏（`limit=50`，1.1s 间隔，带 UA）。
- 可选拉取 307 条条目详情，取 `creator`。
- 保存：
  ```text
  archive/bangumi/
    raw/collections-000.json ... collections-300.json
    raw/subjects/{id}.json
    works.json
    logs.json
    import.sql
    manifest.json        # 条数、SHA-256、状态分布、异常列表
    README.md            # 导入 / 校验步骤
  ```
- `archive/` 已在 `.gitignore` 中，不会进版本库。
- 建议把当前 `.tmp/coll_*.json` 也归档进去；`.tmp/` 是临时目录，可能被清理。

### Phase 2：转换与本地验证

- 生成 307 条 works、197 条 logs。
- 规则见第 4 节；所有 log：
  - `source='migration'`
  - `inferred=1`
  - `round=1`
  - `seq=1`
  - `event`：`done` 且有进度用 `both`，否则 `status`
- 对本地 D1 执行，跑测试：
  ```bash
  bunx wrangler d1 migrations apply media-tracker-db --local
  bunx wrangler d1 execute media-tracker-db --local --file=archive/bangumi/import.sql
  bun run test
  ```
- 校验：
  - 307 条 works、197 条 logs、0 孤儿、`UNIQUE(work_id, seq)` 无冲突；
  - `progress <= total_snapshot`；
  - 状态分布：done 184 / paused 10 / dropped 1 / reading 2 / wish 110；
  - 公开数量：186。

### Phase 3：分类与文案

- `shared/categories.ts` 新增：
  ```ts
  { slug: 'anime', label: '动画', path: '/anime', type: 'Anime' },
  { slug: 'game',  label: '游戏', path: '/games', type: 'Game' },
  { slug: 'music', label: '音乐', path: '/music', type: 'Music' },
  ```
- 导航、路由、公开 API 自动生效。
- 文案：
  - 抽 `CATEGORY_COPY`（状态标签、进度单位、完成动词）；
  - 修改 `format.ts`、`PublicHome`、`PublicWork`、`AdminLibrary`、`AdminWorkProgress`、`WorkPreview`；
  - 后台的“本 / 章节数 / 未分章”也要按分类切换。
- 如果不改文案，也可以上线，但动画会显示“在读 / 读完 / 章”，体验不完整。

### Phase 4：生产导入

- 用写权限的 `CLOUDFLARE_API_TOKEN`：
  ```bash
  bunx wrangler d1 execute media-tracker-db --remote --file=archive/bangumi/import.sql
  ```
- 或 DBX 执行 SQL 文件。
- `wrangler d1 execute --file` 不是严格事务；导入前必须备份，失败时用备份恢复，不要在一个半导入的库上重跑。
- 导入后立即校验：
  ```sql
  SELECT COUNT(*) FROM works;   -- 591
  SELECT COUNT(*) FROM logs;    -- 569
  SELECT COUNT(*) FROM import_batches; -- +1
  ```
- 再验证公开 API：
  - `/api/public/categories/anime` → 163
  - `/api/public/categories/music` → 19
  - `/api/public/categories/games` → 4
  - `/api/public/categories/book` → 49
  - `/api/public/categories/textbook` → 4

### Phase 5：可选同步

- 第二阶段再做：
  - 以 `(source, external_id)` 查找；
  - 元数据变化才 UPDATE；
  - 状态/进度变化才追加 log；
  - 收藏删除只做 `deleted_at`，不删 log；
  - 私有收藏要么跳过，要么加可见性字段。
- 不建议做双向写回 Bangumi：站点是只读展示，Bangumi 仍是唯一写入源。

---

## 8. 需要拍板的问题

1. **公开范围**：186 条新作品是公开，还是只进 `/admin`？
   - 公开：符合现有“读完即公开”的设计。
   - 仅后台：需要新增 `visibility` 字段，工作量 +0.5–1 天。
2. **评分**：87 条评分是否要保留？
   - 不保留：只存在原始 JSON。
   - 保留：加 `rating` 列 + 编辑/展示，+0.5–1 天。
3. **日期**：`updated_at` 近似日期可以接受吗？
   - 接受 + 标 `inferred`；
   - 或前端对导入作品只显示年份；
   - 或先隐藏“读完于”，等以后手动补。
4. **creator**：动画取“导演”还是“动画制作”？书籍取“作者”、音乐取“艺术家”、游戏取“开发”是否同意？还是留空？
5. **文案**：是否要把动画文案改成“想看 / 在看 / 看过”“话”，还是先沿用“读 / 章”？
6. **同步**：一次性快照，还是以后定期同步？
7. **Schema**：是否接受 0002 加 `source` / `external_id`（推荐），还是只用 `bgm-{id}` 确定性 id？

---

## 9. 附：实测接口

```http
GET https://api.bgm.tv/v0/users/793266/collections?limit=50&offset=0
User-Agent: annouimo/media-tracker (https://gallery.annouimo.com)
```

```json
{
  "total": 307,
  "limit": 50,
  "offset": 0,
  "data": [
    {
      "subject_id": 101114,
      "subject_type": 1,
      "type": 4,
      "rate": 0,
      "ep_status": 0,
      "vol_status": 3,
      "comment": null,
      "tags": [],
      "private": false,
      "updated_at": "2026-03-15T14:25:22+08:00",
      "subject": {
        "id": 101114,
        "name": "無職転生 ～異世界行ったら本気だす～",
        "name_cn": "无职转生 ～到了异世界就拿出真本事～",
        "date": "2014-01-23",
        "eps": 262,
        "volumes": 26,
        "type": 1
      }
    }
  ]
}
```

```http
GET https://api.bgm.tv/v0/subjects/400602
User-Agent: annouimo/media-tracker (https://gallery.annouimo.com)
```

条目详情里可取：

```json
"infobox": [
  { "key": "导演", "value": "斎藤圭一郎" },
  { "key": "动画制作", "value": "MADHOUSE" },
  { "key": "原作", "value": "山田鐘人・アベツカサ（小学館…）" }
]
```

参考：

- [Bangumi API 文档](https://bangumi.github.io/api/)
- [User-Agent 建议](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md)
- [OpenAPI v0.yaml](https://raw.githubusercontent.com/bangumi/api/master/open-api/v0.yaml)
