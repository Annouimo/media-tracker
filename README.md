# Annouimo 的陈列室 / media-tracker

一个单用户的阅读 / 动画档案：**公开的极简阅读列表** + **Cloudflare Access 保护的私人作品库**。

- 技术栈：Vue 3 + TypeScript + Vite + Cloudflare Workers（Static Assets）+ D1 + Hono + Bun
- 当前状态：M1–M10 已部署到生产（`gallery.annouimo.com`）；Cloudflare Access 应用还需把 Domain 更新为 `gallery.annouimo.com`
- 旧版代码和旧数据在 `archive/`，PaperMod 参考主题在 `reference/`；两者都在 `.gitignore` 中，不进入版本库

---

## 0. 已确定的产品决策

- 公开首页是纯文字极简列表，不使用封面、评分、标签。
- 公开页最上方是“在读”区块，和下面的分类 section 同一套版式（标题 + 网格），并显示进度（实际通常 1–2 本）。
- 公开页的“读过”= **曾经读完**，不是“最新状态为读完”；开始重读不会让作品从公开页消失。
- 公开详情页默认只展示摘要；完整历史放在同页可折叠的“完整记录”区域，公开可看，搁置/弃读可以暴露。
- 公开首页的“读过”是 2 列 row-major 标题网格（手机单列），按年份分组；排序仍是读完时间从新到旧。
- 公开页按分类切换：顶部导航就是分类列表（图书 / 教材 / 动画），每个分类一个独立 URL，页面版式相同；分类和分类文案在 `shared/categories.ts` / `shared/category-copy.ts` 注册。
- 分类文案按类别切换：图书用「读 / 章 / 本」，动画用「看 / 话 / 部」；状态、进度、按钮、后台表单都跟随作品类型。
- 私有管理面放在 `/admin`，由 Cloudflare Access 保护；包含全部 564 条作品（2026-10-27），包括想看、在看、搁置、弃看。
- 后台使用独立布局和顶部管理导航；公开站 header 不出现在 `/admin`。admin 路由懒加载，公开首屏不加载后台代码。
- 删除 `cover_url`、`rating`、`tags`；新增 `short_review`（纯文本）和 `long_review_url`（博客链接）。
- `works` 不保存 `status`；状态作为快照写入 `logs`，最新一条 log 就是当前状态。
- 点击进度格子只记录进度，不自动“读完”；“读完”必须手动点。
- `total_progress = 1` 视为“未设置章节数”，不再作为一种正式模式。
- 二元作品在进入 `reading` 状态时，提示手动输入章节数；可以显式选择继续保持二元。
- 样式使用原版 PaperMod 的设计 token，不引入它的 Hugo 模板，也不做自定义主题。
- 公开页不使用区块分割线，靠留白和字号分层；header 保持 1024px、无下边框，与 `www.annouimo.com` 一致。
- 搜索不是常驻控件：顶栏一个搜索按钮，点开输入框，输入即筛选当前分类。
- 旧 URL 不保留，使用全新的路由。
- 旧数据迁移的详细对账规则见 `archive/MIGRATION_RECONCILIATION.md`（本地文件，按 `.gitignore` 不进入 Git）。

### 0.1 Git 工作流

- `main`：只做稳定发布；只有调试通过、准备阶段性上线时才合并/推送。
- `dev`：日常开发分支；M1 及后续实现都提交到这里。
- 功能分支可以从 `dev` 切出，完成后合回 `dev`。
- Cloudflare Workers Builds：
  - Production branch = `main`
  - 启用 Preview Builds
  - Preview command = `bun run preview:ci`
  - `dev` push 后预览地址形如 `dev.gallery.annouimo.com`
- Previews 不继承 production 设置；`wrangler.jsonc` 的 `previews` 块提供 D1 binding。当前 preview 指向同一个 D1，写功能上线前应换成独立 preview D1。

---

## 1. 数据模型与状态机

### 1.1 原则

- `works` 存元数据和评论，不存状态、不存评分、不存封面、不存标签。
- `logs` 存**完整状态快照**：每条 log 同时有 `status`、`progress`、`total_snapshot`、`round`。
- 当前状态 = 该作品 `seq` 最大的 log；没有 log 的作品 = `wish` / 进度 0。
- `seq` 在每本作品内递增，不用全局自增，也不依赖 `created_at` 排序。
- 日志是只追加的；撤销只删除该作品最新一条 log。

### 1.2 Schema

```sql
CREATE TABLE works (
  id              TEXT PRIMARY KEY,       -- 保留旧 PocketBase id；新记录用 UUID
  title           TEXT NOT NULL,
  creator         TEXT NOT NULL DEFAULT '',
  release_year    INTEGER,                -- 0 -> NULL
  type            TEXT NOT NULL DEFAULT 'Book',
  total_progress  INTEGER NOT NULL DEFAULT 1 CHECK (total_progress >= 1),
  short_review    TEXT NOT NULL DEFAULT '',
  long_review_url TEXT NOT NULL DEFAULT '',
  added_at        INTEGER,                -- 可空；旧数据 52 条缺失
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  legacy_id       INTEGER,                -- 旧系统整数 id，仅用于审计
  deleted_at      INTEGER                 -- 软删除
);

CREATE TABLE logs (
  id              TEXT PRIMARY KEY,
  work_id         TEXT NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
  seq             INTEGER NOT NULL,       -- 每本作品内递增
  event           TEXT NOT NULL CHECK (event IN ('progress', 'status', 'both')),
  status          TEXT NOT NULL CHECK (status IN ('wish', 'reading', 'done', 'paused', 'dropped')),
  progress        INTEGER NOT NULL,
  total_snapshot  INTEGER NOT NULL,
  round           INTEGER NOT NULL DEFAULT 1,
  logged_on       TEXT NOT NULL,           -- YYYY-MM-DD（Asia/Shanghai）
  logged_at       INTEGER,                 -- epoch ms；NULL = 只有日期
  source          TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'migration')),
  inferred        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  UNIQUE (work_id, seq)
);

CREATE INDEX idx_logs_work_seq ON logs(work_id, seq DESC);
CREATE INDEX idx_logs_work_status ON logs(work_id, status);
CREATE INDEX idx_logs_timeline ON logs(logged_on DESC, created_at DESC);
```

字段说明：

- `event`：`progress` = 只改进度；`status` = 只改状态；`both` = 一次操作同时改了状态和进度（例如开始新一轮、或读完并补进度）。
- `status` 是快照，不是增量。状态变更时也要把当前 `progress` 写进去；进度变更时也要把当前 `status` 写进去。
- `logged_at IS NULL` 表示“只有日期”，用来保留旧数据里 151 条 `00:00:00` 的日期精度。
- `source = 'migration'` 且 `inferred = 1` 表示迁移时推断出来的历史状态事件。

### 1.3 当前状态查询

```sql
SELECT
  w.*,
  COALESCE(l.status, 'wish')       AS status,
  COALESCE(l.progress, 0)          AS progress,
  l.total_snapshot,
  l.round,
  l.logged_on,
  l.logged_at,
  l.event,
  (SELECT MAX(logged_on)
     FROM logs
    WHERE work_id = w.id AND status = 'done') AS finished_on
FROM works w
LEFT JOIN logs l
  ON l.work_id = w.id
 AND l.seq = (SELECT MAX(seq) FROM logs WHERE work_id = w.id)
WHERE w.deleted_at IS NULL;
```

公开可见性：

- 作品**曾经有 `done` 事件**，或**当前状态为 `reading`**，才进入公开 API。
- 公开首页的“读过”使用 `finished_on IS NOT NULL`，所以重读中的作品仍然在。
- 只想读、搁置且从未读完的作品不进入公开 API。

### 1.4 状态机

| 当前 | 动作 | 新状态 | 进度 | log.event |
|---|---|---|---|---|
| `wish` | 开始阅读 | `reading` | 0 或用户填的值 | `both` |
| `reading` | 点格子 / 记录进度 | `reading` | 新进度 | `progress` |
| `reading` | 手动“读完” | `done` | 保持当前进度 | `status` |
| `reading` | 搁置 | `paused` | 保持当前进度 | `status` |
| `reading` | 弃读 | `dropped` | 保持当前进度 | `status` |
| `paused` | 继续阅读 | `reading` | 保持当前进度 | `status` |
| `dropped` | 重新开始 | `reading` | 保持当前进度 | `status` |
| `done` | 开始新一轮 | `reading` | 0，`round + 1` | `both` |
| 任意 | 回到 `wish` | 不允许（有日志时 409） | — | — |

规则：

- 点击最后一格只写 `event='progress'`，`status` 保持 `reading`；是否读完由用户手动决定。
- `done` 时进度不要求等于 total（旧数据里就有读完但进度未满的作品）。
- 状态变更如果不带进度，写入当前进度快照；进度变更如果不带状态，写入当前状态快照。
- 撤销只允许删除该作品 `seq` 最大的一条 log。

### 1.5 二元模式规则

`total_progress = 1` 表示“未设置章节数”，不是正式模式。

- 从非 `reading` 状态进入 `reading` 时，如果 `total_progress = 1`，API 返回 `409 needs_total_progress`。
- 前端弹窗要求输入章节数；请求带 `totalProgress`，服务端在同一个 `batch()` 里更新 `works.total_progress` 并写 log，避免“章节数改了但状态没变”。
- 用户可以显式选择“不按章节记录”，请求带 `confirm_binary: true`，则保持 `total_progress = 1`，作品页的进度 tab 只显示“标记读完”+ 状态按钮。
- 已经是 `reading` 的二元作品，在下一次进度/状态操作时提示。
- 已经 `done` 的二元作品，只有重读进入 `reading` 时才提示；不重读就不需要章节格子。
- `/admin` 提供“未设置章节数”筛选，方便逐步补全 243 本旧二元作品。
- 从 binary 转 chapter 时，若原状态是 `done`，提供“按已读完处理”选项：写入 `progress = total_progress, status = done` 的 `both` log，避免突然变成只读了 1 章。

### 1.6 日期、排序与不可变

- `logged_on` 在写入时按 `Asia/Shanghai` 计算并冻结；公开页按它分组/排序。
- 有时间精度的 `logged_at` 写 epoch ms；只有日期时写 `NULL`。
- `finished_on` 取最近一次 `status='done'` 的 `logged_on`；公开首页第二部分的排序用它倒序。
- `created_at` 是记录实际写入时间，不用于业务排序；迁移时保留旧 `created`。
- logs 不可修改；只允许删除最新一条用于撤销。

---

## 2. 公开 / 后台 API 边界

### 2.1 权限

- Cloudflare Access 应用路径：`/admin*`
  - 同一个应用同时覆盖 `/admin` 页面和 `/admin/api/*`，只产生一个 AUD。
- 公开只读：
  - `/`
  - `/works/:id`
  - `/api/public/*`
- Worker 在 `/admin/api/*` 上校验 `Cf-Access-Jwt-Assertion`（`ACCESS_TEAM_DOMAIN` + `ACCESS_AUD`），不能只依赖页面被 Access 保护。
- Access 未配置时 admin API fail closed：返回 503 `access_not_configured`。
- 本地开发用 `.dev.vars` 里的 `DEV_AUTH_BYPASS=1` 跳过 Access 校验；只对 localhost 生效。
- 不提供公开写入接口。

### 2.2 公开 API

#### `GET /api/public/categories/:slug`

返回**一个分类**的公开页面数据。`slug` 来自 `shared/categories.ts`，当前是 `book` / `textbook` / `anime`；未注册的 slug 返回 404。

```ts
{
  reading: PublicWork[],   // 该分类下 status = reading，按最近活动倒序
  reviews: PublicWork[],   // 该分类下曾经读完 + 有短评，按 finished_on 倒序
  archive: PublicWork[]    // 该分类下曾经读完 + 没有短评，按 finished_on 倒序
}
```

`PublicWork`：

```ts
{
  id: string
  title: string
  creator: string
  release_year: number | null
  type: string
  total_progress: number
  short_review: string
  long_review_url: string
  status: 'wish' | 'reading' | 'done' | 'paused' | 'dropped'
  progress: number
  finished_on: string | null
  is_reading: boolean
  is_read: boolean
}
```

每个分类一次返回该分类的全部公开作品（2026-10-27：图书 49、教材 4、动画 166），加 ETag/缓存；搜索在前端做，不单独建搜索接口。`/api/public/home` 已移除。

#### `GET /api/public/works/:id`

- 仅当作品“曾经读完”或“当前在读”时返回，否则 404。
- 返回 `PublicWork` + 公开日志历史：

```ts
{
  work: PublicWork,
  logs: Array<{
    status: string
    progress: number
    total_snapshot: number
    round: number
    logged_on: string
    logged_at: number | null
    event: 'progress' | 'status' | 'both'
  }>
}
```

公开详情页默认只展示摘要；“完整记录”折叠区使用这里的 `logs`，允许暴露 `paused` / `dropped`。

### 2.3 后台 API

#### `GET /admin/api/state`

返回全部作品、当前状态和全部 logs，供后台首页、书架和作品页使用。当前规模（283 本 / 迁移后约 372 条 logs）一次返回即可；后台响应 `Cache-Control: no-store`。

#### `GET /admin/api/works`

返回全部作品的精简列表（`id`、`title`、`creator`、`type`），供添加页和作品页元数据 tab 做同名同作者查重，避免拉全量 state。响应 `Cache-Control: no-store`。

#### `POST /admin/api/works`

创建作品。请求体是第 3.7 节的 JSON schema。行为：

- `title` 必填；
- `status` 省略 = `wish`，不创建 log；
- `status = reading` 时创建初始 `both` log（progress 默认 0）；
- `status = done` 时创建初始 `both` log（progress 默认 `total_progress`，`finished_on` 默认今天）；
- 支持 `short_review`、`long_review_url`；
- 不接受客户端传 `id`、`legacy_id`、`created_at`。

#### `PATCH /admin/api/works/:id`

只修改元数据和评论：`title`、`creator`、`release_year`、`type`、`total_progress`、`short_review`、`long_review_url`。

- 不接受 `status` / `progress`；这两者只能通过 log 接口修改。
- 修改 `total_progress` 时，不重写历史 `total_snapshot`；如果降低到低于当前进度，返回 422 警告/拒绝。

#### `POST /admin/api/works/:id/progress`

```ts
{
  progress: number
  loggedOn?: string
  loggedAt?: number
  totalProgress?: number   // 二元作品首次进入 reading 时一并设置
  confirmBinary?: boolean  // 显式保持 total_progress = 1
}
```

- 写入 `event='progress'`，`status` 取当前快照；
- 当前状态为 `wish` 时，同时转为 `reading`，`event='both'`；
- 当前状态为 `paused` / `dropped` 时，默认保持原状态，除非另调 continue 接口；
- 如果 `total_progress = 1` 且要进入 `reading`，返回 `409 needs_total_progress`，除非带 `totalProgress > 1` 或 `confirmBinary: true`。

#### `POST /admin/api/works/:id/status`

```ts
{
  status: 'reading' | 'done' | 'paused' | 'dropped'
  loggedOn?: string
  totalProgress?: number
  confirmBinary?: boolean
}
```

- 写入 `event='status'`，`progress` 取当前快照；
- 进入 `reading` 且 `total_progress = 1` 时返回 `409 needs_total_progress`，除非带 `totalProgress > 1` 或 `confirmBinary: true`；
- 不允许回到 `wish`（有日志时 409）。

#### `POST /admin/api/works/:id/rounds`

开始新一轮：`round + 1`，`status='reading'`，`progress=0`，`event='both'`；二元作品同样触发章节数提示。

#### `DELETE /admin/api/logs/:id`

撤销：只允许删除该作品 `seq` 最大的 log，删除后当前状态自然回到上一条快照。

### 2.4 错误、缓存与安全

- 错误统一 `{ error: string, message: string }`。
- 状态码：`400` 参数错误、`401/403` 未认证、`404` 不存在或不可公开、`409` 状态冲突/需要章节数、`422` 业务校验失败。
- 写接口校验 `Origin`，配合 Access Cookie；不做跨域。
- Worker API 响应加 CSP / HSTS / Referrer-Policy / X-Content-Type-Options / X-Frame-Options。
- 公开 API 加 `ETag`/`Cache-Control`；后台 API `no-store`。
- 管理员页面加 `X-Robots-Tag: noindex`；公开页面允许索引。
- 搜索在当前规模下客户端完成，不需要 D1 FTS。

---

## 3. 页面地图与首页布局

### 3.1 路由

| 路由 | 权限 | 内容 |
|---|---|---|
| `/` | 公开 | 重定向到第一个分类（`/books`） |
| `/books` | 公开 | 图书分类页：在读 + 短评 + 读过标题区，搜索在顶栏 |
| `/textbooks` | 公开 | 教材分类页；版式与 `/books` 相同 |
| `/anime` | 公开 | 动画分类页；版式与 `/books` 相同，文案切换为「在看 / 看过 / 话」 |
| `/works/:id` | 公开 | 公开详情（摘要 + 可折叠完整记录） |
| `/admin` | Access | 后台首页：在读作品的章节格子聚合，快速记录进度 |
| `/admin/library` | Access | 全部作品书架：搜索、筛选、排序、入口 |
| `/admin/works/new` | Access | 表单添加作品（可切 JSON 模式） |
| `/admin/works/:id` | Access | 作品工作页：进度（默认）+ 元数据两个 tab |

旧路由 `/admin/works/:id/progress`、`/admin/works/:id/edit` 保留重定向到新作品页（后者带 `?tab=metadata`）；其余旧 URL 不保留。后台建议作为独立入口整页加载，避免 SPA 客户端路由绕过 Access。

新增分类只需在 `shared/categories.ts` 增加一行（`slug` / `label` / `path` / `type`）：路由、顶部导航和公开 API 都从这张表读取；作品的 `works.type` 使用同一个 `type` 值。

### 3.2 公开分类页

每个分类页（`/books`、`/textbooks`、`/anime`）共用一套版式，结构从上到下：

1. **页面标题**
   - 可见的分类标题（40px，如「图书」「动画」）。
   - 下方一行计数：`读过 51 本 · 在读 2 本`；动词和单位走 `CategoryCopy`（动画为 `看过 X 部 · 在看 Y 部`）。
   - 搜索激活时显示 `搜索：关键词` 和「清除」。

2. **在读**
   - 和下面的 section 完全同一套版式：`section-head`（24px 标题 + 条数）+ 2 列 `archive-grid`；没有背景块。
   - 每条：书名链接（18px）+ 同一行的进度（`16 / 59 章`；动画用 `话`）；二元作品显示「未分章 / 未分话」。
   - 不展示最近活动或读完日期；没有在读作品时整块隐藏。

3. **短评**
   - 只显示该分类下“曾经读完 + `short_review` 非空”的作品；标题 `短评` + 条数。
   - 每条一行：书名链接（18px）+ 同一行的短评（16px，单行省略，hover 显示全文）；不显示日期，不使用卡片/分割线。
   - 与下面的“读过”共用同一套标题字号和节奏。

4. **读过（其余）**
   - 只显示该分类下“曾经读完 + 没有短评”的作品；标题用 `copy.readSection` + 条数。
   - row-major 网格：和“在读”同一套 2 列 `archive-grid`，手机 1 列；先左到右、再下一行，保持读完时间倒序。
   - 按年份分组（`2026`、`2025`…，13px 标签），组内只有书名链接（18px），不显示作者/年份/评分。
   - 不使用 CSS `columns`（column-major 会破坏时间顺序）。

5. **搜索**
   - 顶栏右侧一个「搜索」文字按钮（仅分类页显示），点击弹出输入框；不是常驻输入框。
   - 输入即筛选当前分类的书名、作者、短评；Esc 或「完成」关闭，关键词保留。
   - 关闭后页面标题下显示 `搜索：关键词` + 「清除」；切换分类时清空；无结果显示极简空状态。
   - 弹层无边框，用底色和阴影；输入框无边框。

顶部菜单是分类链接，末尾是外部的「博客 ↗」（返回个人博客首页，图标与博客站「陈列室 ↗」一致）；当前分类带下划线（状态提示，不是分割线），logo 回到 `/` 后重定向到第一个分类。分类页之间切换是独立路由，浏览器前进/后退正常。

视觉：

- 内容宽 720px；页面标题 40px、区块标题 24px、列表/短评标题 18px、短评正文 16px、meta 14px、计数/年份 13px。
- 头部保持 1024px、无下边框，与 `www.annouimo.com` 一致；不使用卡片、区块分割线、阴影（搜索弹层除外）。
- favicon：深紫渐变圆角方块 + 黄铜「A」字展架（横杠是展台，圆点是展品/射灯）；文件在 `public/favicon.svg`。
- 重读中的作品会同时出现在“在读”和“读过”区，这是预期行为。

### 3.3 公开详情

- 仅对“曾经读完”或“当前在读”的作品开放；否则 404。
- 摘要区：
  - 标题（40px）
  - 作者 / 年份 / 类型 / 当前状态 / 最近读完日期
  - 进度摘要（如 `30 / 30 章`；二元作品显示“已读完”）
  - 短评全文
  - 长评链接（`https://`，新窗口打开，`rel="noopener noreferrer"`）
- “完整记录”：
  - 默认全量展开，不再提供展开/收起；按时间正序列出状态/进度事件。
  - 显示日期、状态、进度；允许暴露 `paused` / `dropped`。
  - 不显示任何私有备注（当前模型也没有私有备注）。
- 页面不使用分割线；区块之间只用留白。
- 不使用封面。
- 返回链接指向作品所属分类（如「← 返回教材」）；未登记类型回退到首页。

### 3.4 后台首页 `/admin` 与书架 `/admin/library`

后台使用独立布局：不渲染公开站的 header/footer。顶部是管理 header：

- 品牌“Annouimo 的陈列室 · 管理”（回到 `/admin`，即后台首页）；
- 导航：首页、书架、添加作品；
- 右侧：公开站点（新窗口）、主题切换、Access 邮箱、退出（`/cdn-cgi/access/logout`）。

**后台首页 `/admin`**：

- 聚合所有 `status = reading` 作品的章节格子；点格子直接记录进度。
- 记录日期默认今天，可改成过去的日期补录（`logged_on`，只保留日期）。
- 每本显示书名、作者、`进度 / 总章节`、最近活动；可一键“读完”或打开作品页。
- 未分章的在读作品显示“标记读完”。
- 没有在读作品时提示并链接到书架。
- 记录成功/读完用 toast 提示。

**书架 `/admin/library`**：

- 全部作品（含想读、在读、搁置、弃读、已读完）。
- 搜索：书名/作者。
- 筛选：分类、状态、年份、是否设置章节数、是否有短评；有筛选条件时显示“清除筛选”。
- 排序：最近活动、添加时间、书名、读完时间。
- 表格列：作品、分类、作者、状态、进度、最近活动、添加、读完、短评、操作。
- 书名进入作品工作页；操作列只保留公开页 ↗（新窗口，仅公开作品）。元数据在作品页内切 tab，不再单独放编辑入口。
- 桌面端表头 sticky；≤768px 改为卡片列表（保留作品、分类、状态、进度、最近活动、操作）。
- 视觉沿用 PaperMod token；后台内容宽度 1200px。
- admin 路由懒加载：公开首屏不包含后台代码。

### 3.5 添加作品 / 元数据编辑

添加页和作品页的「元数据」tab 共用 `src/components/admin/WorkForm.vue`：

- 字段：标题（必填）、作者、年份、分类（从 `shared/categories.ts` 注册表选择）、总章节数、短评、长评链接；新建时还有初始状态、初始进度、读完日期。
- 初始 log 只在新建时显式选择非 wish 的初始状态（在读/读完/搁置/弃读）时创建；默认 wish 不创建，也不出现在公开历史里。初始 log 是补录状态所必需的，不是每次新建都写。
- 客户端校验（必填、数字范围、URL、进度不超过总章节数、未分章提示）；服务端仍用同一套 Zod schema 兜底。
- 实时预览（书名/作者/年份/分类/状态/进度/短评/长评）。
- 同 title + creator 时警告，但允许继续。
- “JSON 模式”可切换到原始 JSON 编辑（新建用 create schema，编辑用 update schema），应用时校验；适合特殊字段或粘贴。
- 有未保存修改时，离开页面、切换 tab 或关闭标签会提示。
- 新建保存后进入作品页（默认进度 tab）；元数据保存后 toast「已保存」，留在元数据 tab。
- 元数据 tab 不显示状态/进度/读完日期的编辑；这些只读，进度在「进度」tab 修改，避免绕过 log 快照。

### 3.6 作品页 `/admin/works/:id`

一个页面承载进度和元数据，顶部统一：

- 面包屑：作品库 / 书名。
- 作品头：书名、作者/年份/分类；公开作品右侧有「公开页 ↗」（新窗口）。
- 两个 tab：`进度`（默认）、`元数据`；`?tab=metadata` 可直接打开元数据 tab。
- 书架点书名 → 进度 tab；元数据 tab 在作品页内切换；旧 `/progress`、`/edit` 地址重定向到这里。

**进度 tab**：

- sticky 操作栏：当前状态 + 进度、状态按钮、记录日期。
  - 记录日期默认今天；改成过去的日期可以补录（补录写 `logged_on`，只保留日期，不写时间）。
- 章节格子：
  - 点格子写 `event='progress'`；
  - 最后一格不自动读完；
  - 格子单色：已读 `--primary`，未读 `--border`，当前格 outline。
- 状态按钮：开始/继续阅读、读完、搁置、弃读；回到想读不提供。
- 二元作品：显示“标记读完”+ 状态按钮，不显示一格网格。
- 二元转章节提示：原生 `<dialog>` 输入章节数，或显式保持二元；Esc 可关闭。
- 完整历史：按 `seq` 倒序，标出 `progress` / `status` / `both`。
- 撤销：只允许撤销最新一条 log；先点“撤销”，再点“确认撤销”，不再使用浏览器 `confirm`。

**元数据 tab**：

- 顶部只读提示：当前状态、进度；状态和进度到「进度」tab 修改。
- `WorkForm`：标题/作者/年份/分类/总章节/短评/长评 + 实时预览 + JSON 模式。
- 保存后 toast「已保存」，留在 tab；有未保存修改时切换 tab / 离开页面会提示。
- 「取消」切回进度 tab，不会跳离作品页。

### 3.7 添加 JSON schema

```json
{
  "title": "Designing Data-Intensive Applications",
  "creator": "Martin Kleppmann",
  "release_year": 2017,
  "type": "Book",
  "total_progress": 12,
  "status": "done",
  "progress": 12,
  "finished_on": "2026-10-18",
  "short_review": "……",
  "long_review_url": "https://blog.example.com/posts/ddia"
}
```

字段规则：

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `title` | 是 | — | 非空 |
| `creator` | 否 | `""` | 作者/创作者 |
| `release_year` | 否 | `null` | 0/空视为未知 |
| `type` | 否 | `Book` | `Book` / `Textbook` / 以后扩展 |
| `total_progress` | 是 | — | 新作品要求 > 1；确实没有章节时允许 1 并警告 |
| `status` | 否 | `wish` | `wish/reading/done/paused/dropped` |
| `progress` | 否 | 0 / total | `done` 时默认 total |
| `finished_on` | 否 | 今天 | `status=done` 时作为初始 log 日期 |
| `short_review` | 否 | `""` | 纯文本，保留换行 |
| `long_review_url` | 否 | `""` | 只接受 `https://` |

不接受 `id`、`legacy_id`、`created_at`、`updated_at`、`deleted_at`。

### 3.8 PaperMod 样式落地

参考 `reference/hugo-PaperMod` 的原始主题，不引入 Hugo 模板：

- 设计 token 直接对齐 `theme-vars.css`：
  - `--gap: 24px`、`--content-gap: 20px`
  - `--nav-width: 1024px`、`--main-width: 720px`
  - `--header-height: 60px`、`--footer-height: 60px`
  - `--radius: 8px`
  - 浅色/深色使用原版 `--theme / --entry / --primary / --secondary / --tertiary / --content / --code-bg / --border`
- 字体：原版系统字体栈，补中文 fallback（PingFang SC / Hiragino Sans GB / Microsoft YaHei）。
- 头部：logo 24px/700，菜单 16px，active 下划线，右侧太阳/月亮切换。
- 主题：`data-theme` + `localStorage['pref-theme']`，与原版 PaperMod 行为一致。
- 正文：18px/1.6；页面标题 40px；区块标题 24px；meta 14px `--secondary`。
- 首页：无卡片；短评行用 `--border` 分隔；标题区 2–3 列。
- 详情：PaperMod post 布局；长评链接下划线。
- 后台：同 token，宽度 900–960px；输入框/JSON 编辑器用 `--code-bg` + `--border` + 8px 圆角。
- 进度格子：单色，不使用旧版文学配色。
- 响应式：`max-width: 768px` 时 `--gap: 14px`，标题缩小，标题区单列。
- 可访问性：`:focus-visible` 2px outline；尊重 `prefers-reduced-motion`。

---

## 4. 项目结构

```text
.
├── src/                 # Vue 客户端
│   ├── App.vue
│   ├── main.ts
│   ├── router.ts
│   ├── style.css
│   ├── components/      # SiteHeader / SiteSearch / AdminHeader / WorkPreview / WorkForm / ChapterGrid
│   ├── layouts/         # PublicLayout / AdminLayout
│   ├── lib/
│   └── pages/           # PublicHome / PublicWork / admin（Dashboard / Library / ...）
├── shared/              # 共享类型、Zod schema、日期工具、分类注册表
├── worker/              # Cloudflare Worker / API
│   ├── index.ts
│   ├── domain/          # 状态机、日期、领域错误
│   ├── db/              # D1 查询与写入
│   ├── routes/          # public / admin API
│   └── middleware/      # Access JWT
├── test/                # 领域/DB/API 测试 + 脱敏 fixture
├── public/              # 静态资源、_headers、favicon
├── migrations/          # D1 migrations
│   └── 0001_init.sql
├── scripts/             # 数据转换与校验 SQL
│   ├── transform-legacy.ts
│   └── verify-d1.sql
├── docs/
│   └── implementation-plan.md
├── archive/             # 旧代码/旧数据 + archive/import/（gitignored）
├── reference/           # PaperMod 参考主题（gitignored）
├── .dev.vars.example
├── .github/workflows/ci.yml
├── wrangler.jsonc
├── vite.config.ts
├── tsconfig.json
├── tsconfig.worker.json
└── README.md
```

D1 binding 在 `wrangler.jsonc` 中声明（`MEDIA_TRACKER_DB`），因为 Wrangler 以配置文件为准；自定义域名在 Cloudflare Dashboard 的 Domains & Routes 管理。

---

## 5. 本地开发

### 5.1 环境变量

**构建不需要任何域名或 D1 环境变量。**

- D1 在 `wrangler.jsonc` 中声明，binding name 为 `MEDIA_TRACKER_DB`；不要同时在 dashboard 再建一个同名 binding，避免配置冲突。
- 自定义域名在 Workers & Pages → Worker → Settings → Domains & Routes 绑定；一个 Worker 可以绑多个域名，代码不需要知道。
- `wrangler.jsonc` 设置了 `workers_dev = false` 且不包含 `routes`，这样 `wrangler deploy` 不会覆盖 dashboard 管理的域名。

### 5.2 安装与运行

```bash
bun install
bun run dev        # Workers 本地请求转发需要 Node，见下
bun run dev:node   # 已安装 Node 时的替代命令
```

Cloudflare 当前的 Miniflare 请求转发依赖 undici dispatcher，Bun 的 `fetch()` 会忽略它。因此：

- `bun run build`、`bun run typecheck` 可以正常用 Bun；
- `vite dev` / `wrangler dev` 的本地请求转发需要 Node；
- 没有 Node 时，本地开发暂时只能跑 build/静态检查，不能点开本地页面。

### 5.3 其他命令

```bash
bun run typecheck   # vue-tsc + tsc(worker)
bun run build       # 类型检查 + vite build（无域名/D1 环境变量依赖）
bun run preview     # build 后预览
bun run deploy      # 本地手动 build + wrangler deploy（备用）
bun run deploy:ci   # Workers Builds 的 deploy command
bun run test        # Vitest + Workers pool（用测试用 D1 fixture）
bun run typecheck:test
```

CI 在 `.github/workflows/ci.yml`：Bun 1.4.3 + Node 22，执行 typecheck、typecheck:test、test、build。

M1–M6 测试使用 `test/fixtures/seed.sql` 的小型脱敏数据（6 本 / 9 条 log），不接触生产数据。当前 79 个测试全部通过。

### 5.4 D1

远程 D1 已通过 DBX 导入并完成只读校验。2026-10-27 备份/发布时：

```text
284 works / 372 logs（含 M5 预览测试新增的“测试书”1 本）
wish 205 / reading 2 / done 51 / paused 26 / dropped 0
公开 API 首页：reading 2 / reviews 1 / archive 50
```

原始导入基线是 283 works / 372 logs。

详细结果在 `archive/import/verification.txt`（gitignored）。

生产 Worker 使用 `wrangler.jsonc` 里的 **`MEDIA_TRACKER_DB`** binding。本地开发/测试的 D1 会在 M1 的 Vitest/Workers 测试配置里单独处理，不使用生产 ID。

注意：远程库目前没有 `d1_migrations`（DBX 直接执行的 DDL）。未来 schema 变更需要单独跑一次 migration（DBX 或显式 Wrangler 配置），不能依赖当前的自动部署。

### 5.5 Workers Builds（GitHub 自动部署）

Cloudflare Dashboard → Workers & Pages → Connect to Git：

| 设置 | 值 |
|---|---|
| Repository / branch | 你的 GitHub 仓库 / `main` |
| Build command | `bun run build` |
| Deploy command | `bun run deploy:ci` |
| Root directory | `/` |

**不需要 Build variables。**

D1 binding 已经声明在 `wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "MEDIA_TRACKER_DB",
    "database_name": "media-tracker-db",
    "database_id": "<database-id>"
  }
]
```

如果之前在 Worker 的 Settings → Bindings 手动建过 `MEDIA_TRACKER_DB`，删掉它；现在以 `wrangler.jsonc` 为准。

在 **Settings → Domains & Routes** 绑定域名：

```text
gallery.annouimo.com
```

要加第二个域名，就在同一个地方继续 Add Custom Domain；不需要改代码，也不需要重新设置构建变量。

说明：

- `wrangler.jsonc` 里没有 `routes`，并设置 `workers_dev: false`；Cloudflare 文档说明这样可以让域名完全由 dashboard 管理。
- `package.json` 的 `packageManager` 固定 Bun；`bun.lock` 决定依赖安装。
- Vite 插件生成的 `dist/media_tracker/wrangler.json` 包含 `MEDIA_TRACKER_DB` D1 binding，但**不包含** custom domain route。
- 自动部署使用 `wrangler deploy`；部署后访问 `/api/health`，确认返回 `{"ok":true,"db":"ok"}`。
- D1 binding 现在在配置文件里，不会再被 `wrangler deploy` 清掉；域名仍然完全由 Dashboard 管理。

### 5.5.1 Cloudflare Access

在 Zero Trust → Access → Applications 添加一个 Self-hosted 应用：

```text
Domain: gallery.annouimo.com
Path:   /admin*
```

`/admin*` 同时保护后台页面和 `/admin/api/*`，只需要一个 AUD。

当前配置已写入 `wrangler.jsonc` 的 `vars` 和 `previews.vars`：

```text
ACCESS_TEAM_DOMAIN=https://annouimo.cloudflareaccess.com
ACCESS_AUD=25eda77e...a417a5
```

Access 边缘已验证：`/admin` 和 `/admin/api/state` 都会 302 到 `annouimo.cloudflareaccess.com` 登录页，JWKS 返回 2 个 key。production 与 preview 使用同一个 Zero Trust 策略/AUD。

本地 Access bypass：

```bash
# .dev.vars
DEV_AUTH_BYPASS=1
```

该 bypass 只对 localhost 生效。Access 未配置时 `/admin/api/*` 返回 503，不会静默放行。

### 5.6 构建输出

- `dist/client/`：静态资源
- `dist/media_tracker/`：Worker bundle + 生成后的 wrangler 配置

`public/_headers` 负责静态资源的 HSTS/CSP/X-Robots；Worker 的 API 响应由 `worker/middleware/security.ts` 加安全头。

---

## 6. 迁移摘要与下一步

旧数据迁移的完整对账规则在 `archive/MIGRATION_RECONCILIATION.md`（本地文件，按 `.gitignore` 不进入 Git）。

转换后的 DBX 导入文件在 `archive/import/`（同样不进 Git）：

- `works.json`：283 行
- `logs.json`：372 行（295 原始 + 77 条状态事件）
- `works.sql` / `logs.sql`：literal INSERT 兜底
- `manifest.json`：条数、SHA-256、异常、校验结果

### 5.7 D1 备份

2026-10-27 的备份在 `archive/backup/media-tracker-2026-10-27.sql`（gitignored）：

- 284 works / 372 logs / 0 import_batches
- 官方 `wrangler d1 export` 被只读 token 拒绝（Authentication error 10000）
- 因此该文件通过只读 `/query` 拉取 schema + 全量数据生成；恢复前建议再用写权限 token 做一次官方 export
- `README.md`：DBX 导入步骤、必须关闭 “Empty string as NULL”、导入顺序和校验 SQL

关键数字：

- works 283、logs 295；迁移后 logs 372（295 + 77 条状态事件）。
- 旧状态：wish 204、reading 2、done 51、paused 26、dropped 0。
- 77 条状态事件中：10 条使用真实 `updated` 时间，67 条为历史推断（`inferred=1`，只有日期）。
- 151 条日志只有日期；迁移后 `logged_at IS NULL` 共 218 条。
- 52 条缺 `added_at`；244 条有 `legacy_id`（1..245，缺 241）。
- 4 条 `total_snapshot` 与当前 `total_progress` 不一致；20 组同日 0/1 日志；0 条孤儿日志。

建议顺序：

1. 建 D1、执行 `migrations/0001_init.sql`；
2. 用 DBX 导入 `works.json`，再导入 `logs.json`（或走 SQL 兜底）；
3. 跑 `archive/import/README.md` 的校验 SQL；
4. 公开首页只读；
5. 公开详情 + 完整记录；
6. Access + `/admin` 书架；
7. 进度页 / 状态机 / 撤销；
8. 添加/编辑 JSON；
9. 搜索、响应式、测试、上线。

---

## 7. 说明

- `archive/` 和 `reference/` 只保留在本地，不进入 Git。
- 旧 URL 不迁移；旧 id 保留在数据库里，但新路由使用新的路径。
- 状态是 log 快照，`works` 不保存 `status`。
- 公开详情页已确认采用“摘要 + 可折叠完整记录”；完整记录公开，允许暴露搁置/弃读。


---

## 7. 发布记录

### 2026-10-27 — M1–M6

- release merge：`9479db6`
- 生产：`https://media-tracker.annouimo.com`
- `/api/health` → 200
- `/api/public/home` → 200（reading 2 / reviews 1 / archive 50）
- `/admin`、`/admin/api/state` → 302 到 Cloudflare Access
- API 响应包含 HSTS / CSP / Referrer-Policy / X-Content-Type-Options / X-Frame-Options
- D1 备份：`archive/backup/media-tracker-2026-10-27.sql`（gitignored）

### 2026-10-27 — M7 分类导航

- release merge：`6098c8c`（`dev` → `main`）
- 顶部导航改为分类切换：`/books` 图书、`/textbooks` 教材；`/` 重定向到第一个分类
- 公开 API：`GET /api/public/categories/:slug` 取代 `/api/public/home`；未注册分类 404
- 分类在 `shared/categories.ts` 注册；详情页返回链接跟随作品分类
- CI 通过（typecheck / typecheck:test / test / build，69 个测试）
- Workers Builds：success（2026-10-27 15:22 +08，Version ID `8f8f71cf`）
- 线上验证：`/textbooks` 渲染「教材 · 我的阅藏」与 4 本教材；`/api/public/categories/book` 返回图书的在读/短评/读过，`/api/public/categories/textbook` 返回 4 本教材

### 2026-10-27 — M8 后台首页与精修

- release merge：`875d09a`（`dev` → `main`）
- 后台首页 `/admin`：在读作品的章节格子聚合、快速记录、补录日期、一键读完
- 书架移到 `/admin/library`；导航改为 首页 / 书架 / 添加作品，返回链接与面包屑同步
- 表单化新建/编辑（保留 JSON 模式）、进度页日期/弹窗/行内撤销、toast、相对日期、分类中文标签
- 书架手机端卡片视图、桌面端 sticky 表头；新增 `GET /admin/api/works` 精简查重接口
- 修复 `--background` 未定义造成的黑底黑字（主按钮、已读格子、撤销确认、添加作品按钮等）
- CI 通过（typecheck / typecheck:test / test / build，72 个测试）
- Workers Builds：success（2026-10-27 16:35 +08，Version ID `50f8aaa8`）
- 线上验证：`/api/health` 200，`/api/public/categories/book` 200；生产 CSS 含 `--background`，`AdminDashboard` chunk 已上线

### 2026-10-27 — M9 Bangumi 动画导入与分类文案

- 数据来源：Bangumi 收藏 API + 时间胶囊（HTML）导出；只导动画，音乐/游戏/书籍丢弃
- 导入：280 works / 1219 logs；公开 166 部（163 当前看完 + 2 搁置 + 1 弃看，后三者曾看完）；114 部仅后台
- 时间线：1266 条事件，1176 条精确时间 log + 43 条 inferred（28 部无单独事件，用 `updated_at` 兜底）
- 分类：新增 `/anime`；`shared/category-copy.ts` 按分类切换状态/进度/按钮/表单文案
- Schema：不新增字段，`works.id = bgm-{subject_id}`；批次来源记录在 `import_batches.source = 'bangumi-anime'`
- 生产验证：`/api/public/categories/anime` → 200 / archive 166（20 条 progress=0）；`book` 49、`textbook` 4
- 详情样例：`/api/public/works/bgm-400602` → 30 条 log、28/28 看完
- 生产部署：main 自动部署；`/admin` 仍由 Cloudflare Access 保护（302）

### 2026-10-27 — M10 公开页改版、作品页合并与改名

- release merge：`4843a91`（`dev` → `main`）
- 公开页：可见分类标题 + 计数、在读/短评/读过统一 section、短评与书名同行、读过 row-major 2 列 + 年份、顶栏搜索按钮 + 弹层
- 后台：`/admin/works/:id` 合并进度/元数据 tab；书架书名进入作品页，操作列只留公开页；`/progress`、`/edit` 重定向
- 站点名改为「Annouimo 的陈列室」；生产域名 `gallery.annouimo.com`
- CI 通过（typecheck / 79 个测试 / build）；main 自动部署
- 生产验证：新品牌已上线；`/api/health` 200；`/api/public/categories/book` 200
- 注意：Access 应用要把 Domain 更新为 `gallery.annouimo.com`；`/admin` 目前返回 200，`/admin/api/state` 仍 401
