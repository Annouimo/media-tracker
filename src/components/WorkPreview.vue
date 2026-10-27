<script setup lang="ts">
import { computed } from 'vue'
import { categoryForType, copyForType } from '../../shared/categories'
import type { WorkStatus } from '../../shared/types'

type PreviewData = {
  title?: string
  creator?: string
  release_year?: number | null
  type?: string
  total_progress?: number
  status?: WorkStatus
  progress?: number
  finished_on?: string
  short_review?: string
  long_review_url?: string
}

const props = defineProps<{
  data: PreviewData | null
  mode: 'new' | 'edit'
  currentStatus?: WorkStatus
  currentProgress?: number
}>()

const status = computed<WorkStatus>(
  () => props.data?.status ?? props.currentStatus ?? 'wish',
)
const copy = computed(() => copyForType(props.data?.type ?? 'Book'))
const total = computed(() => props.data?.total_progress ?? 1)
const typeLabel = computed(() => {
  const type = props.data?.type ?? ''
  return type ? (categoryForType(type)?.label ?? type) : ''
})
const progress = computed(() => {
  if (props.mode === 'edit') return props.currentProgress ?? 0
  return props.data?.progress ?? (status.value === 'done' ? total.value : 0)
})

const progressText = computed(() => {
  if (total.value > 1) {
    return status.value === 'done' && progress.value === 0
      ? copy.value.doneUnknownProgress
      : `${progress.value} / ${total.value} ${copy.value.progressUnit}`
  }
  return copy.value.status[status.value]
})

const initialLogText = computed(() => {
  if (!props.data) return ''
  if (props.mode === 'edit') return '状态和进度只读，请在进度页修改。'
  if (status.value === 'wish') return `保存后不创建初始 log（${copy.value.status.wish}）。`
  return `保存后创建初始 log：${copy.value.status[status.value]}，${progressText.value}。`
})
</script>

<template>
  <div class="preview">
    <template v-if="data">
      <h3 class="preview-title">{{ data.title || '未命名' }}</h3>
      <p class="preview-meta">
        <span v-if="data.creator">{{ data.creator }}</span>
        <span v-if="data.release_year">{{ data.release_year }}</span>
        <span>{{ typeLabel }}</span>
        <span>{{ copy.status[status] }}</span>
      </p>
      <p class="preview-progress">{{ progressText }}</p>
      <p v-if="data.finished_on" class="preview-note">{{ copy.finishedLabel }}：{{ data.finished_on }}</p>
      <p v-if="data.short_review" class="preview-review">{{ data.short_review }}</p>
      <p v-if="data.long_review_url" class="preview-link">
        <a :href="data.long_review_url" target="_blank" rel="noopener noreferrer">长评 →</a>
      </p>
      <p class="preview-note">{{ initialLogText }}</p>
    </template>
    <p v-else class="preview-empty">JSON 校验通过后在这里预览。</p>
  </div>
</template>

<style scoped>
.preview {
  min-height: 12rem;
  padding: 1rem;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.preview-title {
  margin: 0 0 0.5rem;
  font-size: 22px;
  line-height: 1.3;
}

.preview-meta {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--secondary);
}

.preview-meta span + span::before {
  margin: 0 0.4rem;
  content: '·';
}

.preview-progress {
  margin: 0.6rem 0 0;
  font-size: 14px;
  color: var(--secondary);
}

.preview-review {
  margin: 1rem 0 0;
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-line;
}

.preview-link {
  margin: 0.75rem 0 0;
  font-size: 14px;
}

.preview-link a {
  text-decoration: underline;
  text-underline-offset: 0.2rem;
}

.preview-note {
  margin: 1rem 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--secondary);
}

.preview-empty {
  margin: 0;
  color: var(--secondary);
}
</style>
