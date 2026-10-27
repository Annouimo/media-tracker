# Bangumi 时间胶囊导出报告（动画）

> 评估时间：2026-10-27
> 账号：[Annouimo / 793266](https://bgm.tv/user/793266)
> 数据来源：Bangumi 收藏 API + 时间胶囊 HTML 实测
>
> **结论：时间胶囊可以导出。已跑通原型：只取动画，280 部作品 → 1219 条 log，其中 1176 条有精确时间。**
>
> 本报告取代初版报告中“Bangumi 没有历史、每部作品只能写 1 条 log”的结论；初版的数据结构、字段映射和风险分析仍然有效：[bangumi-import-assessment.md](bangumi-import-assessment.md)。

---

## 1. 结论摘要

- 时间胶囊是 **HTML 页面**，不是 API；按 `type=progress` / `type=subject` 分页，每页 20 条。
- 实测动画时间线：**48 页进度 + 16 页收藏**，共 1266 条事件；动画相关 1235 条。
- 时间范围：**2023-05-28 10:05 ～ 2025-08-26 20:04**（Asia/Shanghai）。
- 只导入动画后：
  - `works`：**280** 部；
  - `logs`：**1219** 条；其中 **1176 条**来自时间线、**43 条**为兜底推断；
  - 公开：**166** 部（163 部当前看完 + 2 部搁置 + 1 部弃读，后三者曾有看完记录）；
  - 仅后台：**114** 部。
- 28 部作品在时间线里没有单独事件（2023 年批量导入），用收藏接口的 `updated_at` 兜底。
- 8 条 SP/总集篇/特别篇被跳过；1 条数据矛盾（《轻音少女 第二季》当前“想看”但时间线有“看过”）按当前收藏状态重置。
- 相比初版的 197 条 log，这次是 **1219 条**，日期精度也从“全部近似”变成“1176 条精确”。

---

## 2. 时间胶囊的结构

### 2.1 地址与分页

```text
https://bgm.tv/user/793266/timeline?type=all&page=N
https://bgm.tv/user/793266/timeline?type=progress&page=N   # 进度
https://bgm.tv/user/793266/timeline?type=subject&page=N    # 收藏/状态
https://bgm.tv/user/793266/timeline?type=say&page=N        # 吐槽/改名
```

- 每页 20 条；页面底部有“下一页”。
- 进度：48 页（第 48 页 9 条，第 49 页为空）。
- 收藏：16 页（第 16 页 17 条，第 17 页为空）。
- `type=all` 是全集；`type=say` 实测只有 2 条改名记录，没有可用评论，可以忽略。

### 2.2 单条事件

每条是 `<li id="tml_...">`，关键字段：

| 字段 | 位置 | 示例 |
|---|---|---|
| 精确时间 | `span.titleTip` 的 `title` | `2023-10-14 08:03` |
| 动作 | `span.info_full` 的文本 | `看过 ep.1 冒険の終わり` |
| 条目 | 卡片里的 `bgm.tv/subject/{id}` | `https://bgm.tv/subject/400602` |
| 章节 | 动作链接 `bgm.tv/subject/ep/{id}` | `ep.1` |
| 用户评分 | `div.collectInfo` 的 `starsN` | `stars8` = 8 分 |
| 聚合数量 | 文本里的 `N 部番组` | `等 28 部番组` |

### 2.3 动画动作分布

| 来源 | 动作 | 数量 | 含义 |
|---|---|---:|---|
| 进度 | `看过 ep.N` | 865 | 看了一集 |
| 进度 | `完成了 X of Y 话` | 80 | 看完，带进度/总集数 |
| 收藏 | `想看` | 101 | → `wish` |
| 收藏 | `看过` | 89 | → `done` |
| 收藏 | `在看` | 87 | → `reading`（历史状态，当前动画没有在读） |
| 收藏 | `搁置了` | 10 | → `paused` |
| 收藏 | `抛弃了` | 3 | → `dropped` |

> 87 条“在看”是时间线最有价值的部分：收藏接口只能看到当前状态，时间线能看到“什么时候开始看、后来有没有重看”。

---

## 3. 导出流程

### Phase 1：拉当前收藏（280 部动画）

- `GET /v0/users/793266/collections?limit=50&offset=...`，7 页，`total=307`；
- 过滤 `subject_type=2`，得到 280 部动画；
- 取当前状态、`ep_status`、`eps`、`rate`、`comment`、`updated_at`、标题、日期。

### Phase 2：拉时间胶囊（64 页）

- 进度 48 页 + 收藏 16 页；
- 浏览器 UA，1.5s 间隔，失败重试；
- 原始 HTML 约 **2.5MB**；
- 解析成 1266 条 `timeline-events.json`。

### Phase 3：章节号归一化（151 次请求）

时间线里的 `ep.N` 有时是**绝对集数**，不是条目内的相对集数：

- 《进击的巨人 最终季 Part.2》时间线写 `ep.76` ～ `ep.87`，但条目只有 12 集；
- 《无职转生 第2部分》时间线写 `ep.12` ～ `ep.24`，但条目只有 12 集。

对 151 部有进度事件的作品请求：

```http
GET https://api.bgm.tv/v0/episodes?subject_id={id}&type=0&limit=100
```

用 `episode.id` 映射到 `ep`（相对集数），而不是 `sort`（绝对集数）：

| 作品 | 时间线 | 条目 `ep` | 结果 |
|---|---|---|---|
| 进击的巨人 最终季 Part.2 | 76–87 | 1–12 | 12/12 |
| 无职转生 第2部分 | 12–24 | 1–13（含特别篇） | 13/13 |
| JOJO 石之海 | 38/12 | 12 集但收藏进度 38 | 保留 38/38，属于 Bangumi 条目不完整 |

- 857 条进度事件成功映射；
- 8 条 SP/总集篇/特别篇（如 `ep.12.5` 摘要特番、`ep.23 (β)`、`ep.24 総集編`）跳过；
- 80 条 `完成了 X of Y 话` 不需要映射。

### Phase 4：重建 log

对每部动画，把事件按时间排序，按站点状态机生成快照：

| 时间线事件 | 生成的 log |
|---|---|
| `想看` | `status=wish`, `event=status`, progress=0 |
| `在看` | `status=reading`, `event=status`, progress=当前最高集数 |
| `看过 ep.N` | `status=reading`, `event=progress`（首次从 wish 进入则 `event=both`） |
| `完成了 X of Y 话` | `status=done`, `event=both`, progress=X |
| `看过 <条目>` | `status=done`, `event=status`, progress=当前最高集数 |
| `搁置了` / `抛弃了` | `status=paused/dropped`, `event=status` |
| 看完后又出现 `在看` | `round+1`，进入新一轮 |
| 看完后又出现 `看过` / `完成了` | 合并到上一条 done，不新增 round |
| SP/特别篇 | 跳过 |

### Phase 5：和当前收藏对账

- 以收藏接口的当前状态为最终真相；
- 时间线最后状态与当前状态不一致时，在 `updated_at` 补一条 `inferred=1` 的快照；
- 28 部完全没有时间线事件的作品，用 `updated_at` 生成 1 条兜底快照；
- 1 条矛盾：**《轻音少女 第二季》** 当前收藏是“想看”，但时间线有“看过”记录；按当前状态重置为 wish，并在 manifest 标 anomaly。

---

## 4. 实测结果

### 4.1 总量

| 项目 | 数值 |
|---|---:|
| 动画 works | **280** |
| logs | **1219** |
| 时间线 log（精确时间） | **1176** |
| 兜底 log（`inferred=1`） | **43** |
| 公开（曾经看完或当前在读） | **166** |
| 仅后台 | **114** |
| 有进度事件的作品 | 151 |
| 完全没有时间线事件 | 28 |
| 聚合事件 | 33 |
| 跳过的 SP/特别篇 | 8 |
| round=2 的 log | 15 |
| 最多 log 的作品 | 38（死亡笔记） |
| 只有 1 条 log 的作品 | 195 |
| 有评分的动画 | 86 |
| 缺 `release_year` | 2 |

### 4.2 状态

| 当前状态 | 数量 |
|---|---:|
| `done` 看完 | 163 |
| `wish` 想看 | 108 |
| `paused` 搁置 | 8 |
| `dropped` 抛弃 | 1 |
| `reading` 在看 | 0 |

公开 166 = 163 部 done + 2 部 paused（曾看完）+ 1 部 dropped（曾看完）。
后台 114 = 108 部 wish + 6 部从未看完的 paused/dropped。

### 4.3 样例

**《葬送的芙莉莲》** — 30 条 log：

```text
2023-10-05  在看
2023-10-14  看过 ep.1
2023-10-14  看过 ep.2
...
2024-03-24  看过 ep.28
2024-03-24  看过（done, 8 分）
```

**《进击的巨人 最终季 Part.2》** — 14 条 log：
时间线是 ep.76～87，映射成 1/12 ～ 12/12，最后 done，不再出现 87/87。

**《无职转生 第2部分》** — 14 条 log：
时间线 ep.12～24 映射成 1～12，ep.24 特别篇跳过，按收藏进度补到 13/13。

**《命运石之门》** — 25 条 log：
ep.15 时间线缺失，ep.23(β)/ep.25 特别篇跳过，最后按收藏进度补到 26/26。

### 4.4 日志量分布

| log 数 | 作品数 |
|---:|---:|
| 1 | 195 |
| 2 | 4 |
| 3 | 20 |
| 10 | 5 |
| 12 | 6 |
| 13 | 4 |
| 14 | 13 |
| 15 | 8 |
| 26 | 4 |
| 30 | 1 |
| 38 | 1 |

大多数“想看”作品只有 1 条 wish log；真正看过的作品通常有 10–30 条逐集记录。

---

## 5. 和初版报告的差异

| 项目 | 初版（只用收藏 API） | 本报告（时间胶囊） |
|---|---:|---:|
| 导入范围 | 全部 307 条 | **仅动画 280 部** |
| works | 307 | **280** |
| logs | 197 | **1219** |
| 精确时间 log | 0（全部用 `updated_at`） | **1176** |
| 兜底 log | 197 | **43** |
| 公开 | 186 | **166** |
| 导入后总 works | 591 | **564** |
| 导入后总 logs | 569 | **1591** |
| 导入后总公开 | 239 | **219** |

- 初版“82 条看过集中在两天”的问题基本解决：现在只有 43 条 `inferred` log，其中 28 部完全无时间线事件；其余 1176 条有真实时间。
- 音乐 19、游戏 6、书籍 2 按你的要求直接丢弃，不进入本次导入。
- 公开数从 186 降到 166，是因为去掉了音乐/游戏，并且 166 已包含 3 部“曾看完但当前搁置/弃读”的动画。

---

## 6. 导出产物

最终产物在 `archive/bangumi/import/`（`archive/` 已被 `.gitignore` 忽略），由 [scripts/export-bangumi.ts](../scripts/export-bangumi.ts) 生成：

| 文件 | 内容 | 大小 |
|---|---|---:|
| `works.json` | 280 行，正好是 `works` 表字段 + `source` / `external_id` | 111KB |
| `logs.json` | 1219 行，正好是 `logs` 表字段 | 391KB |
| `events.json` | 1266 条原始解析事件（审计用，含 `bgm_item` / `bgm_text`） | 358KB |
| `import.sql` | works + logs + import_batches | 428KB |
| `works.sql` / `logs.sql` | 分表 SQL | 95KB / 332KB |
| `manifest.json` | 条数、状态分布、覆盖率、异常、SHA-256 | 1.5KB |
| `README.md` | 手动导入 / 校验 / 回滚步骤 | 1.8KB |

原始 HTML 在 `archive/bangumi/raw/`（时间线 2.5MB + 条目章节 1.9MB + 收藏 JSON），共约 4.9MB。之前的 Python 原型在 `archive/bangumi/prototype-v3/`，只作为分析留档，不是本次导入源。

### 6.1 works 字段

`works.json` 只保留会写进 DB 的字段，外加来源：

- `source='bangumi'`
- `external_id={subject_id}`

字段映射：

```text
id              = bgm-{subject_id}
title           = name_cn || name
creator         = ''            （按决定留空）
release_year    = date[:4]      （2 条缺失 → NULL）
type            = 'Anime'
total_progress  = max(eps, ep_status, 时间线最高集数, 1)
short_review    = comment || ''
long_review_url = ''
added_at        = NULL
created_at      = 导入时间
updated_at      = 收藏 updated_at
legacy_id       = NULL
deleted_at      = NULL
source          = 'bangumi'
external_id     = {subject_id}
```

评分没有进 DB；原始 `rate` 仍保留在 `archive/bangumi/raw/collections` 的收藏 JSON 里。

### 6.2 logs 字段

```text
id              = bgm-{subject_id}-{seq}
work_id         = bgm-{subject_id}
seq             = 1..N
event           = progress | status | both
status          = wish | reading | done | paused | dropped
progress        = 相对集数
total_snapshot  = works.total_progress
round           = 1 或 2
logged_on       = YYYY-MM-DD（Asia/Shanghai）
logged_at       = epoch ms
source          = 'migration'
inferred        = 0（时间线）/ 1（兜底）
created_at      = 导入时间
```

`logs.json` 只有 DB 字段；`bgm_item` / `bgm_text` 在 `events.json` 里审计，不进入 DB。

---

## 7. 导入方案

### 7.1 分类

在 [shared/categories.ts](../shared/categories.ts) 新增：

```ts
{ slug: 'anime', label: '动画', path: '/anime', type: 'Anime' },
```

路由、导航、公开 API 自动生效。

### 7.2 Schema

建议 0002：

```sql
ALTER TABLE works ADD COLUMN source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE works ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_works_source_external
  ON works(source, external_id)
  WHERE external_id IS NOT NULL;
```

可选：

```sql
ALTER TABLE works ADD COLUMN rating INTEGER;      -- 0–10
ALTER TABLE works ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
```

`logs.source` 仍用 `'migration'`，不需要改 CHECK。

### 7.3 导入顺序

1. 备份生产 D1；
2. 本地 D1 先跑 `works` 再 `logs`；
3. 生产导入 280 works + 1219 logs；
4. 校验：
   - `works`：284 → **564**
   - `logs`：372 → **1591**
   - `/api/public/categories/anime` → **166**
   - `import_batches` +1
   - 0 孤儿、0 重复 `(work_id, seq)`、`progress <= total_snapshot`

### 7.4 写入通道

- 当前环境没有可用的 `CLOUDFLARE_API_TOKEN`；
- 需要 D1 Edit token、DBX，或新增后台导入接口；
- `wrangler d1 execute --file` 不是严格事务，失败要回滚备份，不要在半导入库上重跑。

---

## 8. 限制与风险

1. **HTML 结构可能变化**
   - 时间胶囊没有 API；解析依赖 `li.tml_item`、`span.titleTip`、`info_full` 等结构。
   - 建议保存原始 HTML + SHA-256，解析失败时可回溯。

2. **33 条聚合事件只展开 3–5 个条目**
   - 例如“看过 …… 等 28 部番组”，HTML 只给前 5 个链接。
   - 未展开的作品用当前收藏状态 + `updated_at` 兜底，本次 28 部。

3. **43 条兜底 log**
   - 28 部完全无事件；
   - 其余 15 条是时间线最后状态与当前收藏不一致时的补点；
   - 全部 `inferred=1`，日期来自 `updated_at`，不如时间线精确。

4. **8 条特别篇被跳过**
   - `ep.12.5` 摘要、`ep.23 (β)`、`ep.24 総集編` 等不属于正常集数；
   - 原始事件仍在 `timeline-events.json`。

5. **1 条数据矛盾**
   - 《轻音少女 第二季》当前想看、时间线有看过；
   - 已按当前状态重置为 wish；如果要保留“看过”，需要单独处理。

6. **评分 / 创作者 / 平台不在 log 里**
   - 86 条评分只在 `works.json` 的 `rating` 字段；DB 没有列就不展示。
   - `creator` 为空；如果要用导演，需要 280 次条目详情请求（约 5 分钟）。
   - 平台（TV/剧场版/OVA）没有字段，暂不保留。

7. **没有逐集评论**
   - 收藏 `comment` 全空；`type=say` 只有改名记录；
   - 站点 log 也没有 note 字段，本次不导入评论。

8. **公开可见性**
   - 166 部公开，其中 3 部当前是搁置/弃读；
   - 站点没有单作品可见性字段；如果只想后台保存，需要另加字段。

9. **时间胶囊只覆盖账号加入之后**
   - 2023-05-28 之前的数据不在时间线里；
   - 账号本身也是 2023-05-28 加入，所以影响有限。

---

## 9. 已确认的决定

- **只导动画**：280 部；音乐 19、游戏 6、书籍 2 丢弃。
- **评分**：不导入；原始 `rate` 仍在 `archive/bangumi/raw/collections`。
- **creator**：留空。
- **wish log**：保留；108 部“想看”各 1 条。
- **28 部无时间线作品**：用 `updated_at` + `inferred=1`。
- **《轻音少女 第二季》**：按当前“想看”重置；manifest 里标 anomaly。

---

## 10. 生产导入（手动）

> **只导数据库不够**：`/anime` 分类来自 `shared/categories.ts`，需要把 `feat/bangumi-import` 分支部署到生产（或至少部署这个分类改动）。否则库里虽然有 280 部动画，页面上没有入口，`/api/public/categories/anime` 也会 404。

已通过：

| 验证 | 结果 |
|---|---|
| 干净 SQLite：0001 + 0002 + `import.sql` | 280 works / 1219 logs / 166 public |
| 本地 D1（fresh `--persist-to`） | 280 works / 1219 logs / 43 inferred |
| 重复执行 `import.sql` | 280 / 1219 / 1 batch（`INSERT OR IGNORE` 幂等） |
| `bun run typecheck` | 通过 |
| `bun run test` | 69 passed |
| `bun run build` | 通过 |

手动步骤：

1. **备份生产 D1**
   ```bash
   bunx wrangler d1 export media-tracker-db --remote --output=archive/backup/media-tracker-before-bangumi.sql
   ```
   如果 export 需要写权限 token，先在 Cloudflare 建一个 D1 Edit token 并设置 `CLOUDFLARE_API_TOKEN`；或者用 DBX 全量导出。

2. **应用 0002**
   ```bash
   bunx wrangler d1 migrations apply media-tracker-db --remote
   ```

3. **导入**
   ```bash
   bunx wrangler d1 execute media-tracker-db --remote --file=archive/bangumi/import/import.sql
   ```
   或者用 DBX 执行同一个 SQL 文件。如果 `import.sql` 太大，按顺序跑 `works.sql`、`logs.sql`；`import_batches` 可省略或用 manifest 的 hash 手工补。

4. **校验**
   ```bash
   bunx wrangler d1 execute media-tracker-db --remote --file=archive/bangumi/import/verify.sql
   ```
   期望：`bangumi_works=280`、`bangumi_logs=1219`、`public_works=166`、`inferred_logs=43`、孤儿/重复 seq/`progress > total` 均为 0；总 `works=564`、`logs=1591`、`import_batches=1`。

5. **验证公开页**
   - `/api/public/categories/anime` → 166
   - `/anime` 页面 → 163 条“看过” + 3 条“曾看完但搁置/弃读”；114 条只在后台。

失败回滚：用第 1 步的备份恢复；不要只删 `import_batches`。

---

## 11. 附：实测接口与产物

```http
GET https://bgm.tv/user/793266/timeline?type=progress&page=1
User-Agent: Mozilla/5.0 ...

GET https://bgm.tv/user/793266/timeline?type=subject&page=1
User-Agent: Mozilla/5.0 ...

GET https://api.bgm.tv/v0/episodes?subject_id=331752&type=0&limit=100
User-Agent: annouimo/media-tracker (https://media-tracker.annouimo.com)
```

时间线单条：

```html
<li id="tml_40798265" class="clearit tml_item">
  <span class="info_full clearit">
    看过 <a href="https://bgm.tv/subject/ep/1234567">ep.28 また会ったときに恥ずかしいからね</a>
    ...
  </span>
  <div class="post_actions date">
    <span title="2024-3-24 07:47" class="titleTip">2年7月前</span> · web
  </div>
</li>
```

产物：

- `archive/bangumi/prototype-v3/works.json`
- `archive/bangumi/prototype-v3/logs.json`
- `archive/bangumi/prototype-v3/timeline-events.json`
- `archive/bangumi/prototype-v3/manifest.json`

参考：

- [时间胶囊](https://bgm.tv/user/793266/timeline)
- [Bangumi API 文档](https://bangumi.github.io/api/)
- [User-Agent 建议](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md)
