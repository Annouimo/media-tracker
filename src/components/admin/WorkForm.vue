<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave } from 'vue-router'
import type { ZodError } from 'zod'
import { CATEGORIES, copyForType } from '../../../shared/categories'
import {
  DEFAULT_TYPE,
  MAX_CREATOR_LENGTH,
  MAX_PROGRESS,
  MAX_RELEASE_YEAR,
  MAX_SHORT_REVIEW_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TYPE_LENGTH,
} from '../../../shared/constants'
import { isValidDateOnly, todayLocalDay } from '../../../shared/dates'
import {
  createWorkSchema,
  updateWorkSchema,
  type CreateWorkInput,
  type UpdateWorkInput,
} from '../../../shared/schemas'
import type { WorkStatus, WorkSummary } from '../../../shared/types'
import { WORK_STATUSES } from '../../../shared/types'
import JsonEditor from '../JsonEditor.vue'
import WorkPreview from '../WorkPreview.vue'
import { formatZodIssues } from '../../lib/format'

type Mode = 'new' | 'edit'

const props = withDefaults(
  defineProps<{
    mode: Mode
    initial?: UpdateWorkInput | null
    existingWorks?: WorkSummary[]
    currentId?: string
    currentStatus?: WorkStatus
    currentProgress?: number
    saving?: boolean
    serverError?: string
  }>(),
  {
    initial: null,
    existingWorks: () => [],
    currentId: undefined,
    currentStatus: undefined,
    currentProgress: undefined,
    saving: false,
    serverError: '',
  },
)

const emit = defineEmits<{
  create: [payload: CreateWorkInput]
  update: [payload: UpdateWorkInput]
  change: []
  cancel: []
}>()

type Draft = {
  title: string
  creator: string
  release_year: string
  type: string
  total_progress: string
  status: WorkStatus
  progress: string
  finished_on: string
  short_review: string
  long_review_url: string
  confirm_binary: boolean
}

function emptyDraft(): Draft {
  return {
    title: '',
    creator: '',
    release_year: '',
    type: DEFAULT_TYPE,
    total_progress: '1',
    status: 'wish',
    progress: '',
    finished_on: '',
    short_review: '',
    long_review_url: '',
    confirm_binary: false,
  }
}

const draft = ref<Draft>(emptyDraft())
const errors = ref<Record<string, string>>({})
const generalError = ref('')
const jsonMode = ref(false)
const jsonText = ref('')
const jsonIssues = ref<string[]>([])
const dirty = ref(false)
const copy = computed(() => copyForType(draft.value.type))

const fieldMessages = computed<Record<string, string>>(() => ({
  title: `请填写标题（1–${MAX_TITLE_LENGTH} 字）`,
  creator: `${copy.value.creatorLabel}不能超过 ${MAX_CREATOR_LENGTH} 字`,
  release_year: `年份需为 0–${MAX_RELEASE_YEAR} 的整数`,
  type: '请选择分类',
  total_progress: `${copy.value.totalField}需为 1–${MAX_PROGRESS} 的整数`,
  progress: `进度需在 0 到${copy.value.totalField}之间`,
  finished_on: `${copy.value.finishedLabel}格式应为 YYYY-MM-DD`,
  short_review: `短评不能超过 ${MAX_SHORT_REVIEW_LENGTH} 字`,
  long_review_url: '长评链接需以 https:// 开头',
  confirm_binary: `请填写${copy.value.chapterInput}，或勾选「${copy.value.keepBinary}」`,
}))

function applyInitial(value: UpdateWorkInput | null | undefined): void {
  if (!value) {
    draft.value = emptyDraft()
  } else {
    draft.value = {
      ...emptyDraft(),
      title: value.title ?? '',
      creator: value.creator ?? '',
      release_year: value.release_year == null ? '' : String(value.release_year),
      type: value.type ?? DEFAULT_TYPE,
      total_progress: String(value.total_progress ?? 1),
      short_review: value.short_review ?? '',
      long_review_url: value.long_review_url ?? '',
    }
  }
  errors.value = {}
  generalError.value = ''
  jsonMode.value = false
  jsonIssues.value = []
  dirty.value = false
}

watch(
  () => props.initial,
  (value) => {
    applyInitial(value)
  },
  { immediate: true },
)

const total = computed(() => Number(draft.value.total_progress))
const today = todayLocalDay()
const isRegisteredType = computed(() =>
  CATEGORIES.some((category) => category.type === draft.value.type),
)
const saveLabel = computed(() => (props.mode === 'new' ? '保存并进入进度' : '保存'))

const duplicates = computed(() => {
  const title = draft.value.title.trim().toLowerCase()
  const creator = draft.value.creator.trim().toLowerCase()
  if (!title) return []
  return props.existingWorks.filter(
    (work) =>
      work.id !== props.currentId &&
      work.title.trim().toLowerCase() === title &&
      work.creator.trim().toLowerCase() === creator,
  )
})

const previewData = computed(() => ({
  title: draft.value.title,
  creator: draft.value.creator,
  release_year: yearNumber(),
  type: draft.value.type,
  total_progress: total.value,
  status: props.mode === 'new' ? draft.value.status : props.currentStatus,
  progress: props.mode === 'new' ? (progressNumber() ?? undefined) : props.currentProgress,
  finished_on:
    props.mode === 'new' && draft.value.status === 'done' && draft.value.finished_on
      ? draft.value.finished_on
      : undefined,
  short_review: draft.value.short_review,
  long_review_url: draft.value.long_review_url,
}))

function yearNumber(): number | null {
  const raw = draft.value.release_year.trim()
  if (raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function progressNumber(): number | null {
  const raw = draft.value.progress.trim()
  if (raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function buildCreateInput(): Record<string, unknown> {
  const progress = progressNumber()
  return {
    title: draft.value.title.trim(),
    creator: draft.value.creator.trim(),
    release_year: yearNumber(),
    type: draft.value.type,
    total_progress: total.value,
    status: draft.value.status,
    progress: draft.value.status === 'wish' || progress === null ? undefined : progress,
    finished_on:
      draft.value.status === 'done' && draft.value.finished_on ? draft.value.finished_on : undefined,
    short_review: draft.value.short_review,
    long_review_url: draft.value.long_review_url.trim(),
    confirm_binary: draft.value.confirm_binary,
  }
}

function buildUpdateInput(): Record<string, unknown> {
  return {
    title: draft.value.title.trim(),
    creator: draft.value.creator.trim(),
    release_year: yearNumber(),
    type: draft.value.type,
    total_progress: total.value,
    short_review: draft.value.short_review,
    long_review_url: draft.value.long_review_url.trim(),
  }
}

function validate(): boolean {
  errors.value = {}
  generalError.value = ''

  const title = draft.value.title.trim()
  if (!title) errors.value.title = fieldMessages.value.title
  else if (title.length > MAX_TITLE_LENGTH) errors.value.title = fieldMessages.value.title

  if (draft.value.creator.trim().length > MAX_CREATOR_LENGTH) {
    errors.value.creator = fieldMessages.value.creator
  }

  const chapters = total.value
  if (!Number.isInteger(chapters) || chapters < 1 || chapters > MAX_PROGRESS) {
    errors.value.total_progress = fieldMessages.value.total_progress
  }

  const year = yearNumber()
  if (
    draft.value.release_year.trim() !== '' &&
    (year === null || !Number.isInteger(year) || year < 0 || year > MAX_RELEASE_YEAR)
  ) {
    errors.value.release_year = fieldMessages.value.release_year
  }

  if (!draft.value.type.trim() || draft.value.type.trim().length > MAX_TYPE_LENGTH) {
    errors.value.type = fieldMessages.value.type
  }

  if (draft.value.short_review.length > MAX_SHORT_REVIEW_LENGTH) {
    errors.value.short_review = fieldMessages.value.short_review
  }

  const url = draft.value.long_review_url.trim()
  if (url !== '' && !/^https:\/\/[^\s]+$/i.test(url)) {
    errors.value.long_review_url = fieldMessages.value.long_review_url
  }

  if (props.mode === 'new') {
    const progress = progressNumber()
    if (
      draft.value.status !== 'wish' &&
      draft.value.progress.trim() !== '' &&
      (progress === null || !Number.isInteger(progress) || progress < 0 || progress > chapters)
    ) {
      errors.value.progress = fieldMessages.value.progress
    }
    if (draft.value.status === 'reading' && chapters <= 1 && !draft.value.confirm_binary) {
      errors.value.confirm_binary = fieldMessages.value.confirm_binary
    }
    if (
      draft.value.status === 'done' &&
      draft.value.finished_on !== '' &&
      !isValidDateOnly(draft.value.finished_on)
    ) {
      errors.value.finished_on = fieldMessages.value.finished_on
    }
  } else if (props.currentProgress != null && chapters < props.currentProgress) {
    errors.value.total_progress = `${copy.value.totalField}不能低于当前进度（${props.currentProgress}）`
  }

  return Object.keys(errors.value).length === 0
}

function fillIssues(error: ZodError): void {
  const next: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !next[key]) {
      next[key] = fieldMessages.value[key] ?? issue.message
    } else if (!key && !generalError.value) {
      generalError.value = issue.message
    }
  }
  errors.value = next
  if (!generalError.value && Object.keys(next).length === 0) {
    generalError.value = '请检查表单内容'
  }
}

function onSubmit(): void {
  if (props.saving) return
  if (jsonMode.value && !applyJson()) return
  if (!validate()) return

  if (props.mode === 'new') {
    const parsed = createWorkSchema.safeParse(buildCreateInput())
    if (!parsed.success) {
      fillIssues(parsed.error)
      return
    }
    emit('create', parsed.data)
  } else {
    const parsed = updateWorkSchema.safeParse(buildUpdateInput())
    if (!parsed.success) {
      fillIssues(parsed.error)
      return
    }
    emit('update', parsed.data)
  }
}

function markDirty(): void {
  if (dirty.value) return
  dirty.value = true
  emit('change')
}

function enterJsonMode(): void {
  const raw = props.mode === 'new' ? buildCreateInput() : buildUpdateInput()
  jsonText.value = JSON.stringify(raw, null, 2)
  jsonIssues.value = []
  jsonMode.value = true
}

function applyJson(): boolean {
  let value: unknown
  try {
    value = JSON.parse(jsonText.value)
  } catch (cause) {
    jsonIssues.value = [
      `JSON 解析失败：${cause instanceof Error ? cause.message : '格式错误'}`,
    ]
    return false
  }

  const parsed =
    props.mode === 'new'
      ? createWorkSchema.safeParse(value)
      : updateWorkSchema.safeParse(value)
  if (!parsed.success) {
    jsonIssues.value = formatZodIssues(parsed.error)
    return false
  }

  applyParsed(parsed.data as CreateWorkInput | UpdateWorkInput)
  errors.value = {}
  generalError.value = ''
  jsonMode.value = false
  jsonIssues.value = []
  markDirty()
  return true
}

function applyParsed(data: CreateWorkInput | UpdateWorkInput): void {
  const partial = data as Partial<CreateWorkInput>
  draft.value = {
    ...draft.value,
    title: partial.title ?? '',
    creator: partial.creator ?? '',
    release_year: partial.release_year == null ? '' : String(partial.release_year),
    type: partial.type ?? DEFAULT_TYPE,
    total_progress: String(partial.total_progress ?? 1),
    short_review: partial.short_review ?? '',
    long_review_url: partial.long_review_url ?? '',
  }

  if (props.mode === 'new') {
    const created = data as CreateWorkInput
    draft.value.status = created.status
    draft.value.progress = created.progress == null ? '' : String(created.progress)
    draft.value.finished_on = created.finished_on ?? ''
    draft.value.confirm_binary = created.confirm_binary
  }
}

function markSaved(): void {
  dirty.value = false
}

defineExpose({ markSaved })

onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return window.confirm('有未保存的修改，确定离开？')
})

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
</script>

<template>
  <form
    class="work-form"
    novalidate
    @input="markDirty"
    @change="markDirty"
    @submit.prevent="onSubmit"
  >
    <div class="form-grid">
      <section class="panel">
        <div class="panel-head">
          <h2>{{ mode === 'new' ? '作品信息' : '元数据 / 评论' }}</h2>
          <div class="toolbar">
            <template v-if="!jsonMode">
              <button class="btn" type="button" :disabled="saving" @click="enterJsonMode">
                JSON 模式
              </button>
            </template>
            <template v-else>
              <button class="btn" type="button" :disabled="saving" @click="applyJson">
                应用 JSON
              </button>
              <button class="btn" type="button" :disabled="saving" @click="jsonMode = false">
                退出 JSON
              </button>
            </template>
          </div>
        </div>

        <template v-if="jsonMode">
          <JsonEditor v-model="jsonText" label="作品 JSON" :rows="22" :disabled="saving" />
          <ul v-if="jsonIssues.length" class="issues" role="alert">
            <li v-for="issue in jsonIssues" :key="issue">{{ issue }}</li>
          </ul>
        </template>

        <template v-else>
          <div class="field">
            <label for="work-title">标题 <span class="req">*</span></label>
            <input
              id="work-title"
              v-model="draft.title"
              type="text"
              :maxlength="MAX_TITLE_LENGTH"
              autocomplete="off"
              :disabled="saving"
            />
            <p v-if="errors.title" class="field-error" role="alert">{{ errors.title }}</p>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="work-creator">{{ copy.creatorLabel }}</label>
              <input
                id="work-creator"
                v-model="draft.creator"
                type="text"
                :maxlength="MAX_CREATOR_LENGTH"
                autocomplete="off"
                :disabled="saving"
              />
              <p v-if="errors.creator" class="field-error" role="alert">{{ errors.creator }}</p>
            </div>

            <div class="field field-narrow">
              <label for="work-year">年份</label>
              <input
                id="work-year"
                v-model="draft.release_year"
                type="number"
                min="0"
                :max="MAX_RELEASE_YEAR"
                inputmode="numeric"
                :disabled="saving"
              />
              <p v-if="errors.release_year" class="field-error" role="alert">
                {{ errors.release_year }}
              </p>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="work-type">分类</label>
              <select id="work-type" v-model="draft.type" :disabled="saving">
                <option
                  v-for="category in CATEGORIES"
                  :key="category.slug"
                  :value="category.type"
                >
                  {{ category.label }}
                </option>
                <option v-if="!isRegisteredType" :value="draft.type">
                  {{ draft.type }}（未登记）
                </option>
              </select>
              <p v-if="errors.type" class="field-error" role="alert">{{ errors.type }}</p>
            </div>

            <div class="field field-narrow">
              <label for="work-total">{{ copy.totalField }}</label>
              <input
                id="work-total"
                v-model="draft.total_progress"
                type="number"
                min="1"
                :max="MAX_PROGRESS"
                inputmode="numeric"
                :disabled="saving"
              />
              <p class="field-hint">{{ copy.totalHint }}</p>
              <p v-if="errors.total_progress" class="field-error" role="alert">
                {{ errors.total_progress }}
              </p>
            </div>
          </div>

          <template v-if="mode === 'new'">
            <div class="field-row">
              <div class="field">
                <label for="work-status">初始状态</label>
                <select id="work-status" v-model="draft.status" :disabled="saving">
                  <option v-for="status in WORK_STATUSES" :key="status" :value="status">
                    {{ copy.status[status] }}
                  </option>
                </select>
              </div>

              <div v-if="draft.status !== 'wish'" class="field field-narrow">
                <label for="work-progress">初始进度</label>
                <input
                  id="work-progress"
                  v-model="draft.progress"
                  type="number"
                  min="0"
                  :max="total > 0 ? total : undefined"
                  inputmode="numeric"
                  :placeholder="draft.status === 'done' ? `默认${copy.totalField}` : '默认 0'"
                  :disabled="saving"
                />
                <p v-if="errors.progress" class="field-error" role="alert">{{ errors.progress }}</p>
              </div>
            </div>

            <div v-if="draft.status === 'done'" class="field">
              <label for="work-finished">{{ copy.finishedLabel }}</label>
              <input
                id="work-finished"
                v-model="draft.finished_on"
                type="date"
                :max="today"
                :disabled="saving"
              />
              <p class="field-hint">留空 = 今天（Asia/Shanghai）</p>
              <p v-if="errors.finished_on" class="field-error" role="alert">
                {{ errors.finished_on }}
              </p>
            </div>

            <label v-if="draft.status === 'reading' && total <= 1" class="checkbox">
              <input v-model="draft.confirm_binary" type="checkbox" :disabled="saving" />
              <span>{{ copy.keepBinary }}（不设置{{ copy.chapterInput }}）</span>
            </label>
            <p v-if="errors.confirm_binary" class="field-error" role="alert">
              {{ errors.confirm_binary }}
            </p>
          </template>

          <div class="field">
            <label for="work-review">短评</label>
            <textarea
              id="work-review"
              v-model="draft.short_review"
              rows="6"
              :maxlength="MAX_SHORT_REVIEW_LENGTH"
              :disabled="saving"
            />
            <p class="field-hint">
              {{ draft.short_review.length }} / {{ MAX_SHORT_REVIEW_LENGTH }}
            </p>
            <p v-if="errors.short_review" class="field-error" role="alert">
              {{ errors.short_review }}
            </p>
          </div>

          <div class="field">
            <label for="work-url">长评链接</label>
            <input
              id="work-url"
              v-model="draft.long_review_url"
              type="url"
              inputmode="url"
              placeholder="https://"
              autocomplete="off"
              :disabled="saving"
            />
            <p v-if="errors.long_review_url" class="field-error" role="alert">
              {{ errors.long_review_url }}
            </p>
          </div>
        </template>

        <p v-if="generalError" class="form-error" role="alert">{{ generalError }}</p>
        <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>

        <p v-if="duplicates.length" class="duplicate">
          已存在同名作品：
          <RouterLink
            v-for="work in duplicates"
            :key="work.id"
            :to="`/admin/works/${work.id}`"
          >
            {{ work.title }}
          </RouterLink>
          。仍然可以保存。
        </p>

        <div class="save-row">
          <button class="btn primary" type="submit" :disabled="saving">
            {{ saving ? '保存中…' : saveLabel }}
          </button>
          <button class="btn" type="button" @click="emit('cancel')">取消</button>
        </div>

        <p v-if="mode === 'edit'" class="help">
          状态和进度只读，请到「进度」标签页修改；分类需要在
          <code>shared/categories.ts</code> 注册后才会出现在公开页。
        </p>
      </section>

      <aside class="preview-panel">
        <WorkPreview
          :data="previewData"
          :mode="mode"
          :current-status="currentStatus"
          :current-progress="currentProgress"
        />
      </aside>
    </div>
  </form>
</template>

<style scoped>
.work-form {
  display: block;
}

.form-grid {
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
  margin-bottom: 0.75rem;
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

.field {
  margin-bottom: 1rem;
}

.field label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 13px;
  color: var(--secondary);
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 0.5rem 0.65rem;
  font-size: 14px;
  line-height: 1.5;
  color: var(--primary);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  outline: none;
}

.field textarea {
  min-height: 8rem;
  resize: vertical;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--primary);
}

.field input:disabled,
.field select:disabled,
.field textarea:disabled {
  opacity: 0.6;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
}

.field-narrow {
  max-width: none;
}

.field-hint {
  margin: 0.3rem 0 0;
  font-size: 12px;
  color: var(--secondary);
}

.field-error {
  margin: 0.3rem 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--primary);
  border-left: 2px solid var(--primary);
  padding-left: 0.4rem;
}

.req {
  color: var(--secondary);
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0.2rem 0 0.9rem;
  font-size: 14px;
}

.checkbox input {
  width: auto;
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

.form-error {
  margin: 0.75rem 0 0;
  padding: 0.6rem 0.75rem;
  font-size: 13px;
  line-height: 1.6;
  color: var(--primary);
  border-left: 2px solid var(--primary);
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

.save-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

.help {
  margin: 1.25rem 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--secondary);
}

.help code {
  padding: 0.05rem 0.25rem;
  font-size: 11px;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 3px;
}

.preview-panel {
  position: sticky;
  top: 1rem;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    position: static;
  }
}

@media (max-width: 560px) {
  .field-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
