<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { updateWorkSchema, type UpdateWorkInput } from '../../../shared/schemas'
import { STATUS_LABELS } from '../../../shared/constants'
import type { AdminState, AdminWorkDetail } from '../../../shared/types'
import JsonEditor from '../../components/JsonEditor.vue'
import WorkPreview from '../../components/WorkPreview.vue'
import { getAdminState, getAdminWork, patchWork } from '../../lib/admin-api'
import { formatZodIssues } from '../../lib/format'
import { ApiError } from '../../lib/http'

const route = useRoute()
const detail = ref<AdminWorkDetail | null>(null)
const existingWorks = ref<AdminState['works']>([])
const raw = ref('')
const preview = ref<UpdateWorkInput | null>(null)
const issues = ref<string[]>([])
const error = ref('')
const loading = ref(true)
const notFound = ref(false)
const saving = ref(false)
const saved = ref(false)

const work = computed(() => detail.value?.work ?? null)
const status = computed(() => work.value?.state.status ?? 'wish')
const progressText = computed(() => {
  if (!work.value) return ''
  return work.value.total_progress > 1
    ? `${work.value.state.progress} / ${work.value.total_progress} 章`
    : STATUS_LABELS[work.value.state.status]
})

const duplicates = computed(() => {
  if (!preview.value || !work.value) return []
  const title = preview.value.title?.trim().toLowerCase()
  const creator = preview.value.creator?.trim().toLowerCase()
  if (!title) return []
  return existingWorks.value.filter(
    (item) =>
      item.id !== work.value!.id &&
      item.title.trim().toLowerCase() === title &&
      (creator === undefined || item.creator.trim().toLowerCase() === creator),
  )
})

function draftFromWork(workValue: NonNullable<typeof work.value>): UpdateWorkInput {
  return {
    title: workValue.title,
    creator: workValue.creator,
    release_year: workValue.release_year,
    type: workValue.type,
    total_progress: workValue.total_progress,
    short_review: workValue.short_review,
    long_review_url: workValue.long_review_url,
  }
}

function parseDraft(): boolean {
  saved.value = false
  let value: unknown
  try {
    value = JSON.parse(raw.value)
  } catch (cause) {
    issues.value = [`JSON 解析失败：${cause instanceof Error ? cause.message : '格式错误'}`]
    preview.value = null
    return false
  }

  const parsed = updateWorkSchema.safeParse(value)
  if (!parsed.success) {
    issues.value = formatZodIssues(parsed.error)
    preview.value = null
    return false
  }

  issues.value = []
  preview.value = parsed.data
  return true
}

function formatDraft(): void {
  try {
    raw.value = JSON.stringify(JSON.parse(raw.value), null, 2)
    issues.value = []
  } catch (cause) {
    issues.value = [`JSON 解析失败：${cause instanceof Error ? cause.message : '格式错误'}`]
  }
}

async function load(id: string): Promise<void> {
  loading.value = true
  notFound.value = false
  error.value = ''
  detail.value = null
  preview.value = null
  saved.value = false

  try {
    const [detailData, state] = await Promise.all([
      getAdminWork(id),
      getAdminState().catch(() => null),
    ])
    detail.value = detailData
    existingWorks.value = state?.works ?? []
    raw.value = JSON.stringify(draftFromWork(detailData.work), null, 2)
    parseDraft()
    document.title = `编辑 ${detailData.work.title} · 我的阅藏`
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) {
      notFound.value = true
    } else {
      error.value = cause instanceof Error ? cause.message : '加载失败'
    }
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!work.value || !parseDraft() || !preview.value) return

  saving.value = true
  error.value = ''
  saved.value = false
  try {
    const result = await patchWork(work.value.id, preview.value)
    detail.value = { work: result.work, logs: detail.value?.logs ?? [] }
    raw.value = JSON.stringify(draftFromWork(result.work), null, 2)
    saved.value = true
    document.title = `编辑 ${result.work.title} · 我的阅藏`
  } catch (cause) {
    error.value =
      cause instanceof ApiError
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : '保存失败'
  } finally {
    saving.value = false
  }
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
  <div class="editor-page">
    <p v-if="loading" class="empty">正在加载…</p>

    <p v-else-if="notFound" class="empty">
      没有找到这个作品。
      <RouterLink to="/admin">返回书架</RouterLink>
    </p>

    <p v-else-if="error && !work" class="empty" role="alert">{{ error }}</p>

    <template v-else-if="work">
      <p class="back"><RouterLink to="/admin">← 返回书架</RouterLink></p>

      <header class="editor-header">
        <h1>编辑作品</h1>
        <p class="muted">{{ work.title }}</p>
      </header>

      <div class="readonly">
        <p>
          当前状态：{{ STATUS_LABELS[status] }} · {{ progressText }}
        </p>
        <p>
          状态和进度只读；
          <RouterLink :to="`/admin/works/${work.id}/progress`">去进度页修改</RouterLink>。
        </p>
      </div>

      <p v-if="saved" class="saved" role="status">已保存。</p>
      <p v-if="error" class="save-error" role="alert">{{ error }}</p>

      <div class="editor-grid">
        <section class="panel">
          <div class="panel-head">
            <h2>JSON</h2>
            <div class="toolbar">
              <button class="btn" type="button" @click="formatDraft">格式化</button>
              <button class="btn" type="button" @click="parseDraft">校验预览</button>
            </div>
          </div>

          <JsonEditor v-model="raw" label="元数据 / 评论 JSON" :rows="16" :disabled="saving" />

          <ul v-if="issues.length" class="issues" role="alert">
            <li v-for="issue in issues" :key="issue">{{ issue }}</li>
          </ul>

          <p v-if="duplicates.length" class="duplicate">
            已存在同名同作者作品：
            <RouterLink
              v-for="item in duplicates"
              :key="item.id"
              :to="`/admin/works/${item.id}/progress`"
            >
              {{ item.title }}
            </RouterLink>
            。仍然可以保存。
          </p>

          <div class="save-row">
            <button class="btn primary" type="button" :disabled="saving" @click="save">
              {{ saving ? '保存中…' : '保存' }}
            </button>
            <RouterLink class="btn" to="/admin">取消</RouterLink>
          </div>

          <div class="help">
            <p>只允许 metadata / short_review / long_review_url / total_progress。</p>
            <p>不接受 status、progress、finished_on；这些字段请走进度页。</p>
          </div>
        </section>

        <aside class="panel preview-panel">
          <div class="panel-head">
            <h2>预览</h2>
          </div>
          <WorkPreview
            :data="preview"
            mode="edit"
            :current-status="work.state.status"
            :current-progress="work.state.progress"
          />
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.editor-page {
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

.editor-header {
  margin-bottom: 1rem;
}

.editor-header h1 {
  margin: 0 0 0.35rem;
  font-size: 40px;
  line-height: 1.2;
}

.muted {
  margin: 0;
  font-size: 14px;
  color: var(--secondary);
}

.readonly {
  margin-bottom: 1.5rem;
  padding: 0.6rem 0.75rem;
  font-size: 13px;
  line-height: 1.7;
  color: var(--secondary);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.readonly p {
  margin: 0;
}

.readonly a {
  text-decoration: underline;
  text-underline-offset: 0.2rem;
}

.saved {
  margin: 0 0 1rem;
  font-size: 14px;
  color: var(--primary);
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1.5rem;
  align-items: start;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.6rem;
}

.panel-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.toolbar {
  display: flex;
  gap: 0.4rem;
}

.btn {
  display: inline-block;
  padding: 0.45rem 0.8rem;
  font-size: 14px;
  line-height: 1.4;
  color: var(--primary);
  text-align: center;
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

.btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.issues {
  margin: 0.9rem 0 0;
  padding: 0.6rem 0.75rem 0.6rem 1.5rem;
  font-size: 13px;
  line-height: 1.6;
  color: var(--primary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius);
}

.duplicate {
  margin: 1rem 0 0;
  padding: 0.6rem 0.75rem;
  font-size: 13px;
  line-height: 1.6;
  color: var(--secondary);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.duplicate a {
  text-decoration: underline;
  text-underline-offset: 0.2rem;
}

.save-error {
  margin: 1rem 0 0;
  padding: 0.6rem 0.75rem;
  font-size: 14px;
  line-height: 1.6;
  color: var(--primary);
  border-left: 2px solid var(--primary);
}

.save-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.help {
  margin-top: 1.5rem;
  font-size: 13px;
  line-height: 1.7;
  color: var(--secondary);
}

.help p {
  margin: 0.35rem 0;
}

.preview-panel {
  position: sticky;
  top: 1rem;
}

.empty {
  padding: 2rem 0;
  color: var(--secondary);
}

.empty a {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

@media (max-width: 900px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    position: static;
  }

  .editor-header h1 {
    font-size: 32px;
  }
}
</style>
