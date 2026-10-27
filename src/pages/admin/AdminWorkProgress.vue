<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { STATUS_LABELS } from '../../../shared/constants'
import type { AdminWorkDetail, WorkStatus } from '../../../shared/types'
import {
  deleteLog,
  getAdminWork,
  postProgress,
  postRound,
  postStatus,
} from '../../lib/admin-api'
import { describeLog } from '../../lib/format'
import { ApiError } from '../../lib/http'

type StatusAction = 'reading' | 'done' | 'paused' | 'dropped'
type PromptMode = 'status' | 'round'

const route = useRoute()
const detail = ref<AdminWorkDetail | null>(null)
const loading = ref(true)
const saving = ref(false)
const notFound = ref(false)
const error = ref('')

const showChapterPrompt = ref(false)
const chapterInput = ref('')
const promptMode = ref<PromptMode>('status')

const work = computed(() => detail.value?.work ?? null)
const logs = computed(() => detail.value?.logs ?? [])
const latestLog = computed(() => logs.value.at(-1) ?? null)
const history = computed(() => [...logs.value].reverse())

const status = computed<WorkStatus>(() => work.value?.state.status ?? 'wish')
const total = computed(() => work.value?.total_progress ?? 1)
const progress = computed(() => work.value?.state.progress ?? 0)
const isBinary = computed(() => total.value <= 1)
const isPublic = computed(
  () =>
    work.value !== null &&
    (work.value.state.finishedOn !== null || work.value.state.status === 'reading'),
)

const cells = computed(() =>
  isBinary.value ? [] : Array.from({ length: total.value }, (_, index) => index + 1),
)

const progressText = computed(() => {
  if (!work.value) return ''
  if (work.value.total_progress > 1) {
    return `${work.value.state.progress} / ${work.value.total_progress} 章`
  }
  if (work.value.state.status === 'done') return '已读完'
  if (work.value.state.status === 'reading') return '在读'
  return '未分章'
})

const statusActions = computed<Array<{ status: StatusAction; label: string; primary?: boolean }>>(
  () => {
    const doneLabel = isBinary.value ? '标记读完' : '读完'
    switch (status.value) {
      case 'wish':
        return [
          { status: 'reading', label: '开始阅读', primary: true },
          { status: 'done', label: doneLabel },
          { status: 'paused', label: '搁置' },
          { status: 'dropped', label: '弃读' },
        ]
      case 'reading':
        return [
          { status: 'done', label: doneLabel, primary: true },
          { status: 'paused', label: '搁置' },
          { status: 'dropped', label: '弃读' },
        ]
      case 'paused':
        return [
          { status: 'reading', label: '继续阅读', primary: true },
          { status: 'done', label: doneLabel },
          { status: 'dropped', label: '弃读' },
        ]
      case 'dropped':
        return [
          { status: 'reading', label: '继续阅读', primary: true },
          { status: 'done', label: doneLabel },
          { status: 'paused', label: '搁置' },
        ]
      case 'done':
        return []
    }
  },
)

function errorMessage(cause: unknown): string {
  if (!(cause instanceof ApiError)) {
    return cause instanceof Error ? cause.message : '操作失败'
  }
  if (cause.status === 401 || cause.status === 403) {
    return 'Access 登录已失效，请刷新页面。'
  }
  if (cause.status === 503) {
    return 'Cloudflare Access 尚未配置。'
  }
  return cause.message
}

async function load(id: string): Promise<void> {
  loading.value = true
  error.value = ''
  notFound.value = false
  detail.value = null

  try {
    detail.value = await getAdminWork(id)
    document.title = `${detail.value.work.title} · 进度 · 我的阅藏`
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) {
      notFound.value = true
    } else {
      error.value = errorMessage(cause)
    }
  } finally {
    loading.value = false
  }
}

async function refresh(): Promise<void> {
  const id = work.value?.id
  if (!id) return
  detail.value = await getAdminWork(id)
}

async function run(action: () => Promise<unknown>): Promise<boolean> {
  if (saving.value) return false
  saving.value = true
  error.value = ''

  try {
    await action()
    await refresh()
    return true
  } catch (cause) {
    error.value = errorMessage(cause)
    return false
  } finally {
    saving.value = false
  }
}

async function setCell(cell: number): Promise<void> {
  if (!work.value || saving.value || status.value === 'done' || cell === progress.value) return
  await run(() => postProgress(work.value!.id, { progress: cell }))
}

function openChapterPrompt(mode: PromptMode): void {
  promptMode.value = mode
  chapterInput.value = ''
  error.value = ''
  showChapterPrompt.value = true
}

async function changeStatus(next: StatusAction): Promise<void> {
  if (!work.value || saving.value) return

  if (next === 'reading') {
    if (status.value === 'done') {
      await beginRound()
      return
    }
    if (isBinary.value) {
      openChapterPrompt('status')
      return
    }
  }

  await run(() => postStatus(work.value!.id, { status: next }))
}

async function beginRound(): Promise<void> {
  if (!work.value || saving.value) return
  if (isBinary.value) {
    openChapterPrompt('round')
    return
  }
  await run(() => postRound(work.value!.id, {}))
}

async function confirmChapters(): Promise<void> {
  const id = work.value?.id
  const chapters = Number(chapterInput.value)
  if (!id || !Number.isInteger(chapters) || chapters < 2) {
    error.value = '请输入大于等于 2 的章节数。'
    return
  }

  const ok =
    promptMode.value === 'round'
      ? await run(() => postRound(id, { total_progress: chapters }))
      : await run(() => postStatus(id, { status: 'reading', total_progress: chapters }))

  if (ok) showChapterPrompt.value = false
}

async function keepBinary(): Promise<void> {
  const id = work.value?.id
  if (!id) return

  const ok =
    promptMode.value === 'round'
      ? await run(() => postRound(id, { confirm_binary: true }))
      : await run(() => postStatus(id, { status: 'reading', confirm_binary: true }))

  if (ok) showChapterPrompt.value = false
}

async function undo(id: string): Promise<void> {
  if (saving.value) return
  if (!window.confirm('撤销最新一条记录？')) return
  await run(() => deleteLog(id))
}

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') {
      void load(id)
    } else {
      notFound.value = true
      loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="progress-page">
    <p v-if="loading" class="empty">正在加载…</p>

    <p v-else-if="notFound" class="empty">
      没有找到这个作品。
      <RouterLink to="/admin">返回书架</RouterLink>
    </p>

    <p v-else-if="error && !work" class="empty" role="alert">{{ error }}</p>

    <template v-else-if="work">
      <p class="back">
        <RouterLink to="/admin">← 返回书架</RouterLink>
        <template v-if="isPublic">
          <span> · </span>
          <RouterLink :to="`/works/${work.id}`">公开页</RouterLink>
        </template>
      </p>

      <header class="work-header">
        <h1>{{ work.title }}</h1>
        <p class="meta">
          <span v-if="work.creator">{{ work.creator }}</span>
          <span v-if="work.release_year">{{ work.release_year }}</span>
          <span>{{ work.type }}</span>
          <span v-if="latestLog">最近：{{ latestLog.logged_on }}</span>
        </p>
        <p class="state-line">
          当前：{{ STATUS_LABELS[status] }} · {{ progressText }}
        </p>
      </header>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section class="section">
        <div class="section-head">
          <h2>状态</h2>
        </div>
        <div class="actions">
          <button
            v-for="action in statusActions"
            :key="action.status"
            class="btn"
            :class="{ primary: action.primary }"
            type="button"
            :disabled="saving"
            @click="changeStatus(action.status)"
          >
            {{ action.label }}
          </button>
          <button
            v-if="status === 'done'"
            class="btn primary"
            type="button"
            :disabled="saving"
            @click="beginRound"
          >
            开始新一轮
          </button>
        </div>
        <p v-if="isBinary" class="hint">未分章作品；“标记读完”需要手动点击，不会自动完成。</p>
      </section>

      <section v-if="!isBinary" class="section">
        <div class="section-head">
          <h2>进度</h2>
          <span>{{ progress }} / {{ total }}</span>
        </div>
        <div class="grid" role="group" aria-label="章节进度">
          <button
            v-for="cell in cells"
            :key="cell"
            class="cell"
            :class="{
              read: cell <= progress,
              current: cell === progress + 1 && progress < total,
            }"
            type="button"
            :disabled="saving || status === 'done'"
            :aria-label="`标记读到第 ${cell} 章`"
            :aria-pressed="cell <= progress"
            @click="setCell(cell)"
          >
            {{ cell }}
          </button>
        </div>
        <p class="hint">点章节只记录进度；最后一章不会自动标记读完。</p>
      </section>

      <section v-if="showChapterPrompt" class="prompt" role="dialog" aria-modal="true">
        <h2>设置章节数</h2>
        <p class="hint">
          这本书还没有章节数。可以输入章节数，或显式保持未分章。
        </p>
        <input
          v-model="chapterInput"
          class="chapter-input"
          type="number"
          min="2"
          step="1"
          inputmode="numeric"
          placeholder="章节数"
          aria-label="章节数"
        />
        <div class="prompt-actions">
          <button class="btn primary" type="button" :disabled="saving" @click="confirmChapters">
            使用章节数
          </button>
          <button class="btn" type="button" :disabled="saving" @click="keepBinary">
            保持未分章
          </button>
          <button class="btn" type="button" :disabled="saving" @click="showChapterPrompt = false">
            取消
          </button>
        </div>
      </section>

      <section class="section history">
        <div class="section-head">
          <h2>历史</h2>
          <span>{{ logs.length }} 条</span>
        </div>
        <ol class="history-list">
          <li
            v-for="log in history"
            :key="log.id"
            class="history-item"
            :class="{ latest: log.id === latestLog?.id }"
          >
            <div class="history-main">
              <span class="history-date">{{ log.logged_on }}</span>
              <span>{{ describeLog(log) }}</span>
              <span v-if="log.round > 1" class="history-round">第 {{ log.round }} 次</span>
              <span v-if="log.id === latestLog?.id" class="latest-label">最新</span>
            </div>
            <button
              v-if="log.id === latestLog?.id"
              class="undo"
              type="button"
              :disabled="saving"
              @click="undo(log.id)"
            >
              撤销
            </button>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<style scoped>
.progress-page {
  padding-top: 0.5rem;
}

.back {
  margin: 0 0 1.5rem;
  font-size: 14px;
  color: var(--secondary);
}

.back a:hover {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

.work-header {
  margin-bottom: 0.5rem;
}

.work-header h1 {
  margin: 0 0 0.65rem;
  font-size: 40px;
  line-height: 1.2;
}

.meta {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--secondary);
}

.meta span + span::before {
  margin: 0 0.45rem;
  content: '·';
}

.state-line {
  margin: 0.5rem 0 0;
  font-size: 14px;
  color: var(--secondary);
}

.section {
  margin-top: 2.25rem;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
}

.section-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.section-head span {
  font-size: 14px;
  color: var(--secondary);
  font-variant-numeric: tabular-nums;
}

.actions,
.prompt-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 0.85rem;
  font-size: 14px;
  color: var(--primary);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  border-color: var(--primary);
}

.btn.primary {
  color: var(--background);
  background: var(--primary);
  border-color: var(--primary);
}

.btn:disabled,
.cell:disabled {
  cursor: default;
  opacity: 0.6;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.25rem, 1fr));
  gap: 0.35rem;
}

.cell {
  aspect-ratio: 1;
  padding: 0;
  font-size: 12px;
  color: var(--secondary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}

.cell:hover:not(:disabled) {
  border-color: var(--primary);
}

.cell.read {
  color: var(--background);
  background: var(--primary);
  border-color: var(--primary);
}

.cell.current {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.hint {
  margin: 0.75rem 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--secondary);
}

.prompt {
  max-width: 480px;
  margin-top: 2rem;
  padding: 1rem;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.prompt h2 {
  margin: 0;
  font-size: 18px;
}

.chapter-input {
  width: 100%;
  margin: 0.9rem 0;
  padding: 0.55rem 0.7rem;
  font-size: 16px;
  color: var(--primary);
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  outline: none;
}

.chapter-input:focus {
  border-color: var(--primary);
}

.error {
  margin: 1rem 0 0;
  padding: 0.6rem 0.75rem;
  font-size: 14px;
  line-height: 1.6;
  color: var(--primary);
  border-left: 2px solid var(--primary);
}

.history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--border);
}

.history-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0;
  font-size: 14px;
  line-height: 1.6;
  border-bottom: 1px solid var(--border);
}

.history-item.latest {
  color: var(--primary);
}

.history-main {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  min-width: 0;
}

.history-date {
  color: var(--secondary);
  font-variant-numeric: tabular-nums;
}

.history-round,
.latest-label {
  font-size: 12px;
  color: var(--secondary);
}

.undo {
  flex: none;
  padding: 0.15rem 0.45rem;
  font-size: 12px;
  color: var(--secondary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}

.undo:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
}

.empty {
  padding: 2rem 0;
  color: var(--secondary);
}

.empty a {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

@media (max-width: 768px) {
  .work-header h1 {
    font-size: 32px;
  }
}
</style>
