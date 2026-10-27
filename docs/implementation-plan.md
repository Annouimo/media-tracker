# 我的阅藏 — 实施计划

> 基于 `README.md` 第 1–3 节的设计、`migrations/0001_init.sql` 的 schema，以及已经通过 DBX 完成的旧数据导入。
>
> 本文件是执行计划，不是新的设计决策；设计冲突时以 `README.md` 为准。

---

## 0. 当前基线

已完成：

- Vue 3 + TypeScript + Vite + Cloudflare Workers 骨架。
- `migrations/0001_init.sql`：`works` / `logs` / `import_batches`。
- `scripts/transform-legacy.ts`：旧数据转换脚本。
- DBX 已导入旧数据（用户确认完成）。
- `bun run typecheck`、`bun run build` 通过。
- 远程 D1 已完成只读校验（283/372 等，见 `archive/import/verification.txt`）。
- Node 24 已安装；`bun run dev:node` 可作为本地请求转发的 fallback。

尚未完成：

- 用 `wrangler.jsonc` 声明 `MEDIA_TRACKER_DB` 并重新部署，验证 `/api/health`。
- 任何 API 路由（`/api/*` 目前只有 `/api/health` 和 501 占位）。
- 公开首页 / 公开详情。
- Cloudflare Access 与 `/admin`。
- 进度页、状态机、添加/编辑 JSON。
- 自动化测试与上线。

设计文档：

- `README.md`：数据模型、API 边界、页面地图。
- `archive/MIGRATION_RECONCILIATION.md`：旧数据对账规则（gitignored）。
- `archive/import/README.md`：DBX 导入步骤与校验 SQL（gitignored）。

---

## 1. 范围与完成定义

### 1.1 本期范围

公开：

- 首页：当前在读一行、短评区、其余读过标题区（2–3 列）、搜索。
- 公开详情：摘要 + 可折叠完整记录（公开，允许暴露 paused/dropped）。
- 公开只读，不提供公开写接口。

私有：

- `/admin` 书架：全部作品、搜索、筛选、排序。
- `/admin/works/new`：JSON 添加。
- `/admin/works/:id/edit`：JSON 编辑元数据/短评/长评。
- `/admin/works/:id/progress`：点格子、状态、历史、撤销、二元转章节提示。
- 全部由 Cloudflare Access 保护。

### 1.2 Definition of Done

- [ ] 公开首页、公开详情与 PaperMod 风格一致，移动端可用。
- [ ] 公开 API 只返回“曾经读完”或“当前在读”的作品；wish / 仅 paused 不泄露。
- [ ] `/admin/*` 与 `/api/admin/*` 受 Access 保护；未登录返回 401/跳转。
- [ ] 进度格子只写 progress，点最后一格不自动 done；“读完”必须手动。
- [ ] 二元作品进入 reading 时提示章节数；可显式保持二元。
- [ ] 状态变更、进度变更、撤销都通过 log 快照；`works` 不保存 `status`。
- [ ] 添加/编辑 JSON 有校验、预览、重复提示；编辑不能绕过 log。
- [ ] 公开首页的“读过”按最近 done 日期倒序；重读作品仍在。
- [ ] 现有 283 本 / 372 条 log 的状态、进度、日期与旧版对账一致。
- [ ] 单元测试、API 集成测试、关键 E2E 通过。
- [ ] 生产部署、D1 备份、Workers 日志、Access 策略完成。

---

## 2. M0 — 环境与数据基线

目标：把“已经导入的数据”变成可复现、可本地开发、可部署的基线。

### 2.1 D1 binding（`wrangler.jsonc` + `MEDIA_TRACKER_DB`）

- [x] D1 数据库已由 DBX 导入：`media-tracker-db`。
- [x] D1 binding 写进 `wrangler.jsonc`，binding name 是 `MEDIA_TRACKER_DB`。
- [x] 不使用环境变量传 ID；`database_id` 是标识符，不是密钥。
- [x] Worker 通过 `env.MEDIA_TRACKER_DB` 访问。
- [x] `worker/index.ts` 的 `Bindings.MEDIA_TRACKER_DB` 已改为必填，并加了带 DB 检查的 `/api/health`；缺少 binding 时返回 `db: "missing_binding"`。
- [x] 如果 dashboard 之前手动建过 `MEDIA_TRACKER_DB`，删除它，避免与配置文件冲突。

> 自动部署使用 `wrangler deploy`，Wrangler 以配置文件为 source of truth。dashboard-only D1 binding 会被覆盖，所以 D1 必须留在 `wrangler.jsonc`。

如果 DBX 是直接执行 DDL，而不是走 Wrangler migrations，未来 schema 变更前需要单独跑一次 migration（DBX 或显式 Wrangler 配置）。当前远程库没有 `d1_migrations`。

### 2.2 远程基线校验

已完成（只读 token；详细结果在 `archive/import/verification.txt`）：

| 项目 | 值 |
|---|---:|
| works | 283 |
| logs | 372 |
| works_with_logs | 79 |
| date_only | 218 |
| timestamped | 154 |
| inferred | 67 |
| missing_added_at | 52 |
| legacy_id | 244 |
| orphan_logs | 0 |
| status | wish 204 / reading 2 / done 51 / paused 26 / dropped 0 |
| public ever done | 51 |
| public currently reading | 2 |
| total_snapshot mismatch | 4 |
| status events | 77 |
| chapter / binary | 40 / 243 |

### 2.3 本地 D1 / 测试数据

生产 D1 不通过环境变量或本地脚本连接。本地开发/测试使用独立的 D1 binding，具体在 M1 的 Vitest/Workers 测试配置里建立：

- 使用 `tests/fixtures/seed.sql`（小规模、脱敏），不使用 283 本个人数据。
- `archive/import/*` 是 gitignored 的本地文件，不进入 CI。
- 远程数据只通过 DBX / Cloudflare 控制台维护。

### 2.4 自定义域名与部署

- [x] 域名完全由 Cloudflare Dashboard 管理，不进入构建配置，也没有 `PUBLIC_HOST`。
- [x] `wrangler.jsonc` 不含 `routes`，并设置 `workers_dev: false`；按 Cloudflare 文档，这样 `wrangler deploy` 不会覆盖 dashboard 域名。
- [x] 一个 Worker 可以绑定多个域名；增加域名只需在 Domains & Routes 里 Add Custom Domain。
- [x] `package.json` 设置 `packageManager: bun@1.4.3`，适配 Workers Builds 的 Bun 工具链。
- [x] 部署方式确定为 Cloudflare Workers Builds 连接 GitHub，自动构建/部署。
- [ ] 在 Cloudflare Dashboard 连接 GitHub 仓库，配置 build/deploy command（见 README 5.5）。
- [ ] 首次部署创建 `media-tracker.annouimo.com` custom domain。
- [ ] Access application（M3）：`/admin/*`、`/api/admin/*`。

Workers Builds 目标配置：

| 设置 | 值 |
|---|---|
| Build command | `bun run build` |
| Deploy command | `bun run deploy:ci` |
| Build variables | 无 |

### 2.4.1 Git 分支与 Preview

- `main`：稳定发布，Cloudflare Production branch。
- `dev`：日常开发分支；M1+ 都提交到 `dev`。
- Cloudflare 启用 Preview Builds；Preview command = `bun run preview:ci`。
- `dev` push 后预览地址：`dev.media-tracker.annouimo.com`（模式 `dev.media-tracker.annouimo.com`）。
- Previews 不继承 production 设置；`wrangler.jsonc` 的 `previews` 块提供 D1 binding。当前指向同一个 D1，写功能上线前换独立 preview D1。

### 2.5 本地开发运行时

Cloudflare 当前的 Miniflare 请求转发依赖 undici dispatcher，Bun 的 `fetch()` 会忽略它：

- `bun run build`、`bun run typecheck` 可用 Bun；
- `vite dev` / `wrangler dev` 的请求转发需要 Node；
- 已提供 `bun run dev:node`（`node node_modules/vite/bin/vite.js`）作为 fallback。

### 2.6 依赖

- [ ] 添加 `zod`（共享校验）。
- [ ] 添加测试依赖：`vitest`、`@cloudflare/vitest-pool-workers`。
- [ ] 后续 E2E 再加 `@playwright/test`。
- [ ] `tsconfig.json` / `tsconfig.worker.json` 都 include `shared/**/*.ts`。

**M0 验收**：远程 D1 已跑出 283/372、79 个有日志作品、204/2/51/26/0；D1 binding 已写入 `wrangler.jsonc`；域名由 Dashboard 管理且构建无域名/D1 环境变量；部署验证待重新部署；Access 在 M3。

---

## 3. M1 — 共享契约、领域逻辑、数据访问层

目标：先把“状态机 + 查询”写对，再接 UI。

### 3.1 共享类型与 schema

新增：

```text
shared/
  types.ts        # Work, Log, PublicWork, AdminWork, status/event unions
  schemas.ts      # Zod: createWork, updateWork, progress, status, round
  dates.ts        # date-only / Asia/Shanghai helpers (optional)
```

要求：

- `status` / `event` / `source` 用字面量 union，不散落字符串。
- API 请求/响应类型与前端共用。
- `CreateWorkInput` 与 `UpdateWorkInput` 分开：后者不允许 status/progress。

### 3.2 领域逻辑

新增 `worker/domain/`：

- `state.ts`
  - `deriveCurrentState(latestLog | null): { status, progress, round }`
  - `assertTransition(current, next)`
  - `needsTotalProgress(work, nextStatus)`
  - `buildSnapshotLog(...)`
- `dates.ts`
  - `localDay(epochMs, 'Asia/Shanghai')`
  - `parseDateOnly` / `parseDateTime`
  - `formatDay` / `relativeDay`（前端可用共享版本）
- `validation.ts`
  - progress 范围、total_progress、URL、review 长度。

### 3.3 数据访问层

新增 `worker/db/`：

- `queries.ts`
  - `listWorksWithLatestLog()`
  - `getWorkWithLatestLog(id)`
  - `listLogsForWork(id)`
  - `publicHome()`（reading / reviews / archive）
  - `publicWork(id)`（曾读完或当前 reading）
  - `adminState()`
- `mutations.ts`
  - `createWorkWithInitialLog()`
  - `appendLog()`（batch：读 max seq + insert + 可选 update works.total_progress）
  - `setStatus()` / `setProgress()` / `startRound()`
  - `undoLatestLog()`
- `mappers.ts`
  - DB row → API DTO；不要把 `legacy_id`、`created_at` 暴露到公开响应。

### 3.4 单元测试

- [ ] 204/2/51/26/0 当前状态。
- [ ] 79 works with logs。
- [ ] 4 条 total_snapshot 不一致保留。
- [ ] 20 组同日 0/1 的 latest 进度为 1。
- [ ] 151 条原始 date-only + 67 条推断 = 218 条 `logged_at NULL`。
- [ ] 点最后一格不产生 done。
- [ ] 二元作品进入 reading 返回 `needs_total_progress`。
- [ ] 有日志时回到 wish 被拒绝。
- [ ] 撤销只允许最新 seq。

**M1 验收**：不写页面，仅用测试/脚本证明领域逻辑与导入数据一致。

### 3.5 M1 完成记录（dev）

- `shared/types.ts` / `constants.ts` / `dates.ts` / `schemas.ts`
- `worker/domain/state.ts` / `errors.ts` / `dates.ts`
- `worker/db/queries.ts` / `mutations.ts`
- `test/domain/*.test.ts`、`test/db/*.test.ts`
- `test/fixtures/seed.sql`：5 本 / 8 条 log 的脱敏 fixture
- `bun run test`：27 passed
- `bun run typecheck`、`bun run typecheck:test`、`bun run build` 通过
- 当前状态查询在远程全量 D1 上验证：283 行，wish 204 / reading 2 / done 51 / paused 26

---

## 4. M2 — 公开 API 与公开页面

### 4.1 API

新增 `worker/routes/public.ts`：

- `GET /api/public/home`
  - `reading`: 当前 status=reading，按最近活动倒序。
  - `reviews`: 曾读完 + 短评非空，按 finished_on 倒序。
  - `archive`: 曾读完 + 短评为空，按 finished_on 倒序。
- `GET /api/public/works/:id`
  - 仅曾读完或当前 reading。
  - 返回 `work` + `logs`（公开完整记录）。
  - 非公开 404。
- ETag / Cache-Control。
- 公开响应不包含 `legacy_id`、`created_at`、`updated_at`。

### 4.2 前端

新增：

```text
src/router.ts
src/pages/PublicHome.vue
src/pages/PublicWork.vue
src/components/
  SiteHeader.vue
  SiteFooter.vue
  ThemeToggle.vue
  SearchInput.vue
  ReadingLine.vue
  ReviewRow.vue
  TitleColumns.vue
  HistoryList.vue
src/lib/api.ts
```

公开首页：

- 顶部 `在读：Title · Title`；无在读隐藏。
- 短评区：标题 + 纯文本短评，3 行截断，按 finished_on 倒序。
- 其余读过：2–3 列标题列表，手机单列，按 finished_on 倒序。
- 搜索：客户端过滤 title / creator / short_review，同时作用于两个区。
- 空状态、加载态、错误态。

公开详情：

- PaperMod post 布局：标题 40px、meta 14px、正文 18px。
- 摘要：作者/年份/类型/状态/最近读完/进度摘要/短评全文/长评链接。
- “完整记录”`<details>`：公开 logs，按 seq 正序；允许 paused/dropped。
- 长评链接 `target="_blank" rel="noopener noreferrer"`。

**M2 验收**：公开 API 不泄露 wish / 仅 paused；首页三块与详情在桌面/手机正常；重读作品同时出现在“在读”和“读过”。

### 4.3 M2 完成记录（dev）

- `worker/routes/public.ts`：`/api/public/home`、`/api/public/works/:id`、ETag/304
- `worker/lib/etag.ts`
- `src/router.ts`、`src/lib/api.ts`、`src/lib/format.ts`
- `src/pages/PublicHome.vue`、`PublicWork.vue`、`NotFound.vue`
- `src/components/SiteHeader.vue`、`SiteFooter.vue`、`ThemeToggle.vue`
- 首页：当前在读、短评、读过 2 列、客户端搜索
- 详情：摘要 + 可折叠完整记录
- `test/api/public.test.ts`：公开 API/404/ETag/health
- `bun run test`：32 passed
- 本地 `dev.media-tracker.annouimo.com` 已验证 health；公开 API 已用完整本地数据验证（Great Expectations / The Week Junior 在读，51 本读过）

---

## 5. M3 — Access 与后台书架

### 5.1 Access 校验

新增 `worker/middleware/access.ts`：

- 读取 `Cf-Access-Jwt-Assertion`。
- 校验 `iss` / `aud` / `exp`；JWKS 缓存。
- `DEV_AUTH_BYPASS=1` 仅本地生效。
- 失败返回 401（API）或跳转（页面）。

### 5.2 后台 API

- `GET /api/admin/state`：全部 works + latest state + logs。
- `GET /api/admin/me`（可选）：返回 Access email。
- `Cache-Control: no-store`。

### 5.3 后台书架

新增：

```text
src/pages/admin/AdminLayout.vue
src/pages/admin/AdminLibrary.vue
src/lib/admin-api.ts
```

功能：

- 全部作品表格/列表。
- 搜索 title/creator。
- 筛选：status、type、year、未设置章节数、有/无短评。
- 排序：最近活动、添加时间、书名、读完时间。
- 行入口：公开详情、编辑、进度。
- 顶部入口：添加作品。
- `X-Robots-Tag: noindex`。

**M3 验收**：未登录访问 `/admin` 会走 Access；`/api/admin/*` 未认证返回 401；书架能看到 283 本，且公开页仍只看得到 53 本公开作品。

---

## 6. M4 — 进度页、状态机、撤销

### 6.1 API

- `POST /api/admin/works/:id/progress`
  - `{ progress, loggedOn?, loggedAt?, totalProgress?, confirmBinary? }`
- `POST /api/admin/works/:id/status`
  - `{ status, loggedOn?, totalProgress?, confirmBinary? }`
- `POST /api/admin/works/:id/rounds`
- `DELETE /api/admin/logs/:id`（仅最新）

写入：

- `db.batch()`：读 max seq + insert log + 必要时 update works.total_progress。
- `event`：progress / status / both。
- 状态快照：每条 log 都写 `status` + `progress` + `total_snapshot` + `round`。

### 6.2 前端

新增 `src/pages/admin/AdminWorkProgress.vue`：

- 当前状态/进度/总章节/最近活动。
- 章节格子：
  - done 用 `--primary`，未读 `--border`，当前格 outline。
  - 点格子只写 progress；最后一格不自动 done。
- 状态按钮：开始/继续、读完、搁置、弃读；不提供回到 wish。
- “读完”手动，允许进度未满。
- 二元作品：显示“标记读完”+ 状态按钮；进入 reading 时弹章节数输入，或显式保持二元。
- 历史：按 seq 倒序，标 progress/status/both。
- 撤销：只允许最新一条。
- 进度页返回后台书架/公开详情。

**M4 验收**：状态机覆盖全部转换；二元 409 流程可走通；撤销后当前状态回到上一条快照；点最后一格不会自动 done。

---

## 7. M5 — 添加/编辑 JSON

### 7.1 API

- `POST /api/admin/works`
  - 校验 `shared/schemas.ts` 的 create schema。
  - `status=wish` 不建 log；`reading`/`done`/`paused`/`dropped` 创建初始 log。
  - 不接受 `id`、`legacy_id`、`created_at`。
- `PATCH /api/admin/works/:id`
  - 只允许元数据/评论。
  - 拒绝 status/progress/finished_on。
  - `total_progress` 降低到低于当前进度时 422。

### 7.2 前端

新增：

```text
src/pages/admin/AdminWorkNew.vue
src/pages/admin/AdminWorkEdit.vue
src/components/JsonEditor.vue
src/components/WorkPreview.vue
```

功能：

- JSON textarea + schema 示例 + 格式化按钮。
- 解析 → Zod 校验 → 预览 → 保存。
- 预览显示将创建的初始 log。
- 重复检测：同 title + creator 警告但允许。
- 编辑模式：status/progress 只读，链接到进度页。
- 移动端可用。

**M5 验收**：添加 wish/reading/done 三种作品；done 会创建初始 log；编辑不能绕过 log；重复标题给出警告。

---

## 8. M6 — 测试、安全、部署

### 8.1 测试

- 单元：domain state/dates/validation。
- API 集成：`@cloudflare/vitest-pool-workers` + D1 migrations + fixtures。
- 数据迁移：对比 283/372、204/2/51/26/0、公开 53、218 date-only、67 inferred、4 mismatch、20 same-day、0 orphan。
- E2E：公开首页/详情、Access 后台、进度、读完、撤销、添加 JSON。
- CI：`bun run typecheck && bun run build && bun run test`。

### 8.2 安全

- `/admin/*` 和 `/api/admin/*` 双重保护（Access + JWT 校验）。
- 写接口校验 `Origin`。
- Worker 响应加 CSP/HSTS/Referrer-Policy/X-Content-Type-Options。
- `/admin/*` `noindex`。
- 公开 API 不返回内部字段。
- 修改密码/Token 不适用（Access 管理）。

### 8.3 部署

- D1：`wrangler d1 migrations apply`；迁移前 `d1 export`。
- Workers：preview → production；自定义子域。
- Access：生产 application + policy；本地 bypass。
- 观测：Workers Logs、错误率、D1 查询。
- 回滚：Workers 版本回滚；D1 Time Travel；旧 PocketBase 只读保留。
- 旧 URL 不保留。

**M6 验收**：生产 URL 可公开访问；`/admin` 走 Access；关键 E2E 通过；D1 备份存在。

---

## 9. API / 路由清单

| 方法 | 路径 | 权限 | 用途 |
|---|---|---|---|
| GET | `/api/health` | 公开 | 健康检查 |
| GET | `/api/public/home` | 公开 | 首页三块数据 |
| GET | `/api/public/works/:id` | 公开 | 公开摘要 + 完整记录 |
| GET | `/api/admin/state` | Access | 后台全量 |
| POST | `/api/admin/works` | Access | 创建作品 |
| PATCH | `/api/admin/works/:id` | Access | 编辑元数据/评论 |
| POST | `/api/admin/works/:id/progress` | Access | 记录进度 |
| POST | `/api/admin/works/:id/status` | Access | 状态变更 |
| POST | `/api/admin/works/:id/rounds` | Access | 开始新一轮 |
| DELETE | `/api/admin/logs/:id` | Access | 撤销最新 log |

页面：

| 路径 | 权限 |
|---|---|
| `/` | 公开 |
| `/works/:id` | 公开（仅公开作品） |
| `/admin` | Access |
| `/admin/works/new` | Access |
| `/admin/works/:id/edit` | Access |
| `/admin/works/:id/progress` | Access |

---

## 10. 测试与数据策略

- 不要用 283 本个人数据跑 CI；用 `tests/fixtures/seed.sql`（5–10 本，覆盖 wish/reading/done/paused、binary/chapter、date-only/timestamped）。
- 本地完整数据用 `archive/import/*.sql`；它们 gitignored。
- 迁移对账脚本可作为一次性脚本，不放进 CI；CI 只跑小型 fixture 的领域断言。
- E2E 使用 fixture，不依赖远程 D1。
- 公开 API 泄露测试必须包含：
  - wish 作品不在 home；
  - 仅 paused 作品不在 home；
  - 直接访问非公开 `/works/:id` 返回 404；
  - 公开响应没有 `legacy_id` / `created_at` / `updated_at`。

---

## 11. 风险与待确认

1. **D1 database_id**：`wrangler.jsonc` 仍是注释占位；M0 必须补。
2. **DBX 直接建表 vs Wrangler migrations**：M0 跑一次 `wrangler d1 migrations apply` 记录 0001，避免后续迁移状态漂移。
3. **Access + SPA**：后台建议独立入口整页加载；`/api/admin/*` 必须校验 JWT，不能只靠页面保护。
4. **Access JWT 校验**：需要 team domain / AUD；JWKS 缓存。
5. **公开详情范围**：已确认“摘要 + 可折叠完整记录”，完整记录公开。
6. **二元转章节**：已确认进入 reading 时提示；已 done 不重读不提示；无章节书可显式保持二元。
7. **数据异常**：4 条 total_snapshot 不一致、20 组同日 0/1、52 条 added_at NULL、121 条 year 0 —— 显示时不要伪造，后台可编辑。
8. **搜索**：当前规模客户端过滤；不做 FTS。
9. **短评长度**：建议先不限制存储，首页 3 行截断；详情全文。
10. **旧 URL**：不保留；旧 id 只用于数据库，不用于新路由。
11. **时区**：`logged_on` 固定 Asia/Shanghai；不要用运行环境时区。
12. **写入原子性**：D1 没有交互式事务；用 `db.batch()`。
13. **D1 参数上限**：批量写入时注意 100 个绑定参数；必要时拆分。
14. **个人数据**：`archive/`、`archive/import/` 不进 Git；CI 用 fixture。

---

## 12. 粗略排期（个人项目）

| 里程碑 | 内容 | 粗估 |
|---|---|---|
| M0 | D1 binding、远程校验、本地 D1、Access 配置 | 0.5–1 天 |
| M1 | 共享类型、领域逻辑、DB 层、单测 | 1–2 天 |
| M2 | 公开 API + 首页 + 详情 | 2–3 天 |
| M3 | Access + 后台书架 | 1–2 天 |
| M4 | 进度页 + 状态机 + 撤销 | 2–3 天 |
| M5 | 添加/编辑 JSON | 1–2 天 |
| M6 | 测试、安全、部署 | 1–2 天 |

不是承诺工期，只是按依赖关系给的量级。

---

## 13. 下一步

先做 M0，不写页面：

1. 绑定 D1；
2. 记录远程校验结果；
3. 本地导入并跑通；
4. 补 `zod` / 测试依赖；
5. 建 `shared/` / `worker/domain/` / `worker/db/` 骨架。

M0 完成后，M1 的领域测试能证明 283/372 的状态与进度正确，再开始 M2 的公开页面。
