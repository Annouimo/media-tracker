<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { UpdateWorkInput } from '../../../shared/schemas'
import { copyForType } from '../../../shared/categories'
import type { AdminWorkDetail, WorkSummary, WorkWithState } from '../../../shared/types'
import WorkForm from '../../components/admin/WorkForm.vue'
import { getAdminWork, getWorkSummaries, patchWork } from '../../lib/admin-api'
import { progressLabel } from '../../lib/format'
import { ApiError } from '../../lib/http'
import { showToast } from '../../lib/toast'

const props = defineProps<{ workId: string }>()
const emit = defineEmits<{
  saved: [work: WorkWithState]
  dirty: [dirty: boolean]
  cancel: []
}>()

const formRef = ref<{ markSaved: () => void } | null>(null)
const detail = ref<AdminWorkDetail | null>(null)
const existingWorks = ref<WorkSummary[]>([])
const loading = ref(true)
const notFound = ref(false)
const error = ref('')
const saving = ref(false)
const dirty = ref(false)

const work = computed(() => detail.value?.work ?? null)
const copy = computed(() => copyForType(work.value?.type ?? ''))
const status = computed(() => work.value?.state.status ?? 'wish')
const progressText = computed(() => {
  if (!work.value) return ''
  return progressLabel(
    work.value.state.progress,
    work.value.total_progress,
    work.value.state.status,
    copy.value,
  )
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

function markDirty(): void {
  if (dirty.value) return
  dirty.value = true
  emit('dirty', true)
}

function clearDirty(): void {
  if (!dirty.value) return
  dirty.value = false
  emit('dirty', false)
}

async function load(id: string): Promise<void> {
  loading.value = true
  notFound.value = false
  error.value = ''
  detail.value = null
  clearDirty()

  try {
    const [detailData, state] = await Promise.all([
      getAdminWork(id),
      getWorkSummaries().catch(() => null),
    ])
    detail.value = detailData
    existingWorks.value = state?.works ?? []
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
  try {
    const result = await patchWork(work.value.id, payload)
    detail.value = { work: result.work, logs: detail.value?.logs ?? [] }
    formRef.value?.markSaved()
    clearDirty()
    emit('saved', result.work)
    showToast('已保存')
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

function cancel(): void {
  emit('cancel')
}

watch(
  () => props.workId,
  (id) => {
    if (id) {
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
      <RouterLink to="/admin/library">返回作品库</RouterLink>
    </p>

    <p v-else-if="error && !work" class="empty" role="alert">{{ error }}</p>

    <template v-else-if="work">
      <div class="readonly">
        <p>当前状态：{{ copy.status[status] }} · {{ progressText }}</p>
        <p>状态和进度在「进度」标签页修改。</p>
      </div>

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
        @change="markDirty"
        @cancel="cancel"
      />
    </template>
  </div>
</template>

<style scoped>
.editor-page {
  padding-top: 0.5rem;
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

.empty {
  padding: 2rem 0;
  color: var(--secondary);
}

.empty a {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}
</style>
