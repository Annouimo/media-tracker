<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { UpdateWorkInput } from '../../../shared/schemas'
import { STATUS_LABELS } from '../../../shared/constants'
import type { AdminState, AdminWorkDetail } from '../../../shared/types'
import WorkForm from '../../components/admin/WorkForm.vue'
import { getAdminState, getAdminWork, patchWork } from '../../lib/admin-api'
import { ApiError } from '../../lib/http'

const route = useRoute()
const formRef = ref<{ markSaved: () => void } | null>(null)
const detail = ref<AdminWorkDetail | null>(null)
const existingWorks = ref<AdminState['works']>([])
const loading = ref(true)
const notFound = ref(false)
const error = ref('')
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

const initial = computed<UpdateWorkInput | null>(() => {
  if (!work.value) return null
  return {
    title: work.value.title,
    creator: work.value.creator,
    release_year: work.value.release_year,
    type: work.value.type,
    total_progress: work.value.total_progress,
    short_review: work.value.short_review,
    long_review_url: work.value.long_review_url,
  }
})

async function load(id: string): Promise<void> {
  loading.value = true
  notFound.value = false
  error.value = ''
  detail.value = null
  saved.value = false

  try {
    const [detailData, state] = await Promise.all([
      getAdminWork(id),
      getAdminState().catch(() => null),
    ])
    detail.value = detailData
    existingWorks.value = state?.works ?? []
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

async function save(payload: UpdateWorkInput): Promise<void> {
  if (!work.value) return

  saving.value = true
  error.value = ''
  saved.value = false
  try {
    const result = await patchWork(work.value.id, payload)
    detail.value = { work: result.work, logs: detail.value?.logs ?? [] }
    formRef.value?.markSaved()
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
        <p>当前状态：{{ STATUS_LABELS[status] }} · {{ progressText }}</p>
        <p>
          状态和进度只读；
          <RouterLink :to="`/admin/works/${work.id}/progress`">去进度页修改</RouterLink>。
        </p>
      </div>

      <p v-if="saved" class="saved" role="status">已保存。</p>

      <WorkForm
        ref="formRef"
        mode="edit"
        :initial="initial"
        :existing-works="existingWorks"
        :current-id="work.id"
        :current-status="work.state.status"
        :current-progress="work.state.progress"
        :saving="saving"
        :server-error="error"
        @update="save"
        @change="saved = false"
      />
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

.empty {
  padding: 2rem 0;
  color: var(--secondary);
}

.empty a {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

@media (max-width: 900px) {
  .editor-header h1 {
    font-size: 32px;
  }
}
</style>
