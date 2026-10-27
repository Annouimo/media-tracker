<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { STATUS_LABELS, STATUS_ORDER } from '../../../shared/constants'
import { localDayFromEpoch } from '../../../shared/dates'
import type { AdminState, WorkWithState } from '../../../shared/types'
import { getAdminState } from '../../lib/admin-api'
import { ApiError } from '../../lib/http'

const data = ref<AdminState | null>(null)
const loading = ref(true)
const error = ref('')

const query = ref('')
const statusFilter = ref('all')
const typeFilter = ref('all')
const chapterFilter = ref('all')
const yearFilter = ref('all')
const reviewFilter = ref('all')
const sort = ref('recent')

const works = computed(() => data.value?.works ?? [])
const typeOptions = computed(() =>
  [...new Set(works.value.map((work) => work.type))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
)
const yearOptions = computed(() =>
  [...new Set(works.value.map((work) => work.release_year).filter((year): year is number => year !== null))]
    .sort((a, b) => b - a),
)

const filtered = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  const result = works.value.filter((work) => {
    if (
      normalized &&
      ![work.title, work.creator].some((value) => value.toLowerCase().includes(normalized))
    ) {
      return false
    }
    if (statusFilter.value !== 'all' && work.state.status !== statusFilter.value) return false
    if (typeFilter.value !== 'all' && work.type !== typeFilter.value) return false
    if (chapterFilter.value === 'binary' && work.total_progress > 1) return false
    if (chapterFilter.value === 'chapter' && work.total_progress <= 1) return false
    if (yearFilter.value !== 'all' && String(work.release_year ?? '') !== yearFilter.value) return false
    if (reviewFilter.value === 'yes' && work.short_review.trim() === '') return false
    if (reviewFilter.value === 'no' && work.short_review.trim() !== '') return false
    return true
  })

  return result.sort((a, b) => {
    if (sort.value === 'title') return a.title.localeCompare(b.title, 'zh-CN')
    if (sort.value === 'added') return (b.added_at ?? 0) - (a.added_at ?? 0)
    if (sort.value === 'finished') {
      return (b.state.finishedOn ?? '').localeCompare(a.state.finishedOn ?? '')
    }
    return (
      (b.state.loggedOn ?? '').localeCompare(a.state.loggedOn ?? '') ||
      (b.state.loggedAt ?? 0) - (a.state.loggedAt ?? 0)
    )
  })
})

function day(value: number | null): string {
  return value === null ? '—' : localDayFromEpoch(value)
}

function progressText(work: WorkWithState): string {
  return work.total_progress > 1
    ? `${work.state.progress} / ${work.total_progress}`
    : '—'
}

function isPublic(work: WorkWithState): boolean {
  return work.state.finishedOn !== null || work.state.status === 'reading'
}

function errorMessage(cause: unknown): string {
  if (!(cause instanceof ApiError)) {
    return cause instanceof Error ? cause.message : '加载失败'
  }
  if (cause.status === 401 || cause.status === 403) {
    return '需要 Cloudflare Access 登录。'
  }
  if (cause.status === 503) {
    return 'Cloudflare Access 尚未配置。'
  }
  return cause.message
}

onMounted(async () => {
  document.title = '书架 · 我的阅藏'
  try {
    data.value = await getAdminState()
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="admin">
    <header class="admin-header">
      <div>
        <h1>书架</h1>
        <p class="muted">
          {{ works.length }} 本
          <template v-if="!loading && !error"> · 当前显示 {{ filtered.length }} 本</template>
        </p>
      </div>
      <RouterLink class="add-link" to="/admin/works/new">添加作品</RouterLink>
    </header>

    <div class="toolbar">
      <label class="search">
        <span class="sr-only">搜索书架</span>
        <input
          v-model="query"
          type="search"
          placeholder="搜索书名、作者"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <label>
        <span class="sr-only">状态</span>
        <select v-model="statusFilter">
          <option value="all">全部状态</option>
          <option v-for="status in STATUS_ORDER" :key="status" :value="status">
            {{ STATUS_LABELS[status] }}
          </option>
        </select>
      </label>

      <label>
        <span class="sr-only">类型</span>
        <select v-model="typeFilter">
          <option value="all">全部类型</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
        </select>
      </label>

      <label>
        <span class="sr-only">章节设置</span>
        <select v-model="chapterFilter">
          <option value="all">全部章节</option>
          <option value="chapter">按章节</option>
          <option value="binary">未分章</option>
        </select>
      </label>

      <label>
        <span class="sr-only">年份</span>
        <select v-model="yearFilter">
          <option value="all">全部年份</option>
          <option v-for="year in yearOptions" :key="year" :value="String(year)">{{ year }}</option>
        </select>
      </label>

      <label>
        <span class="sr-only">短评</span>
        <select v-model="reviewFilter">
          <option value="all">全部短评</option>
          <option value="yes">有短评</option>
          <option value="no">无短评</option>
        </select>
      </label>

      <label>
        <span class="sr-only">排序</span>
        <select v-model="sort">
          <option value="recent">最近活动</option>
          <option value="added">添加时间</option>
          <option value="title">书名</option>
          <option value="finished">读完时间</option>
        </select>
      </label>
    </div>

    <p v-if="loading" class="empty">正在加载…</p>
    <p v-else-if="error" class="empty" role="alert">{{ error }}</p>
    <p v-else-if="filtered.length === 0" class="empty">没有匹配的作品。</p>

    <div v-else class="table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>作品</th>
            <th>作者</th>
            <th>状态</th>
            <th>进度</th>
            <th>最近活动</th>
            <th>添加</th>
            <th>读完</th>
            <th>短评</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="work in filtered" :key="work.id">
            <td class="title">
              <RouterLink v-if="isPublic(work)" :to="`/works/${work.id}`">
                {{ work.title }}
              </RouterLink>
              <span v-else>{{ work.title }}</span>
            </td>
            <td>{{ work.creator || '—' }}</td>
            <td>{{ STATUS_LABELS[work.state.status] }}</td>
            <td class="num">{{ progressText(work) }}</td>
            <td class="num">{{ work.state.loggedOn ?? '—' }}</td>
            <td class="num">{{ day(work.added_at) }}</td>
            <td class="num">{{ work.state.finishedOn ?? '—' }}</td>
            <td>{{ work.short_review ? '有' : '—' }}</td>
            <td>
              <RouterLink class="action" :to="`/admin/works/${work.id}/progress`">
                进度
              </RouterLink>
              <RouterLink class="action" :to="`/admin/works/${work.id}/edit`">
                编辑
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.admin-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.admin-header h1 {
  margin: 0 0 0.35rem;
  font-size: 40px;
  line-height: 1.2;
}

.muted {
  margin: 0;
  font-size: 14px;
  color: var(--secondary);
}

.add-link {
  flex: none;
  padding: 0.45rem 0.8rem;
  font-size: 14px;
  line-height: 1.4;
  color: var(--background);
  background: var(--primary);
  border: 1px solid var(--primary);
  border-radius: var(--radius);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
}

.toolbar label {
  display: flex;
}

.toolbar label.search {
  flex: 1 1 220px;
}

.toolbar input,
.toolbar select {
  width: 100%;
  min-height: 38px;
  padding: 0.45rem 0.65rem;
  font-size: 14px;
  color: var(--primary);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  outline: none;
}

.toolbar input:focus,
.toolbar select:focus {
  border-color: var(--primary);
}

.table-wrap {
  overflow-x: auto;
  border-top: 1px solid var(--border);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  white-space: nowrap;
}

.admin-table th {
  padding: 0.65rem 0.5rem;
  color: var(--secondary);
  font-weight: 500;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.admin-table td {
  padding: 0.65rem 0.5rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

.admin-table td.title {
  min-width: 180px;
  white-space: normal;
}

.admin-table td.title a:hover {
  text-decoration: underline;
  text-underline-offset: 0.2rem;
}

.admin-table .num {
  color: var(--secondary);
  font-variant-numeric: tabular-nums;
}

.admin-table .action {
  color: var(--secondary);
}

.admin-table .action + .action {
  margin-left: 0.55rem;
}

.admin-table .action:hover {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 0.2rem;
}

.empty {
  padding: 2rem 0;
  color: var(--secondary);
}

@media (max-width: 768px) {
  .admin-header h1 {
    font-size: 32px;
  }

  .toolbar label.search {
    flex-basis: 100%;
  }
}
</style>
