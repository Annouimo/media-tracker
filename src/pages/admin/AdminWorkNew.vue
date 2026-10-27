<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createWorkSchema, type CreateWorkInput } from '../../../shared/schemas'
import type { AdminState } from '../../../shared/types'
import JsonEditor from '../../components/JsonEditor.vue'
import WorkPreview from '../../components/WorkPreview.vue'
import { getAdminState, postCreate } from '../../lib/admin-api'
import { formatZodIssues } from '../../lib/format'
import { ApiError } from '../../lib/http'

const router = useRouter()

const sample = `{
  "title": "书名",
  "creator": "作者",
  "release_year": 2024,
  "type": "Book",
  "total_progress": 1,
  "status": "wish",
  "short_review": "",
  "long_review_url": ""
}`

const raw = ref(sample)
const preview = ref<CreateWorkInput | null>(null)
const issues = ref<string[]>([])
const saveError = ref('')
const saving = ref(false)
const existingWorks = ref<AdminState['works']>([])

const duplicates = computed(() => {
  if (!preview.value) return []
  const title = preview.value.title.trim().toLowerCase()
  const creator = preview.value.creator.trim().toLowerCase()
  return existingWorks.value.filter(
    (work) =>
      work.title.trim().toLowerCase() === title &&
      work.creator.trim().toLowerCase() === creator,
  )
})

function parseDraft(): boolean {
  let value: unknown
  try {
    value = JSON.parse(raw.value)
  } catch (cause) {
    issues.value = [`JSON 解析失败：${cause instanceof Error ? cause.message : '格式错误'}`]
    preview.value = null
    return false
  }

  const parsed = createWorkSchema.safeParse(value)
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

async function save(): Promise<void> {
  if (!parseDraft() || !preview.value) return

  saving.value = true
  saveError.value = ''
  try {
    const result = await postCreate(preview.value)
    await router.push(`/admin/works/${result.work.id}/progress`)
  } catch (cause) {
    saveError.value =
      cause instanceof ApiError
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  document.title = '添加作品 · 我的阅藏'
  try {
    existingWorks.value = (await getAdminState()).works
  } catch {
    // The duplicate warning is best-effort; saving still works.
  }
})
</script>

<template>
  <div class="editor-page">
    <p class="back"><RouterLink to="/admin">← 返回书架</RouterLink></p>

    <header class="editor-header">
      <h1>添加作品</h1>
      <p class="muted">用 JSON 添加作品；保存后进入进度页。</p>
    </header>

    <div class="editor-grid">
      <section class="panel">
        <div class="panel-head">
          <h2>JSON</h2>
          <div class="toolbar">
            <button class="btn" type="button" @click="formatDraft">格式化</button>
            <button class="btn" type="button" @click="parseDraft">校验预览</button>
          </div>
        </div>

        <JsonEditor v-model="raw" label="作品 JSON" :rows="24" :disabled="saving" />

        <ul v-if="issues.length" class="issues" role="alert">
          <li v-for="issue in issues" :key="issue">{{ issue }}</li>
        </ul>

        <p v-if="duplicates.length" class="duplicate">
          已存在同名同作者作品：
          <RouterLink
            v-for="work in duplicates"
            :key="work.id"
            :to="`/admin/works/${work.id}/progress`"
          >
            {{ work.title }}
          </RouterLink>
          。仍然可以保存。
        </p>

        <p v-if="saveError" class="save-error" role="alert">{{ saveError }}</p>

        <div class="save-row">
          <button class="btn primary" type="button" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存并进入进度' }}
          </button>
          <RouterLink class="btn" to="/admin">取消</RouterLink>
        </div>

        <div class="help">
          <p>字段：title、creator、release_year、type、total_progress、status、short_review、long_review_url。</p>
          <p>type 需要先在 <code>shared/categories.ts</code> 注册，公开页才会出现（当前：Book / Textbook）。</p>
          <p>status：wish / reading / done / paused / dropped。reading 且 total_progress=1 时，需要填写章节数或加 <code>"confirm_binary": true</code>。</p>
          <p>不接受 id、legacy_id、created_at；finished_on 只用于 done。</p>
        </div>
      </section>

      <aside class="panel preview-panel">
        <div class="panel-head">
          <h2>预览</h2>
        </div>
        <WorkPreview :data="preview" mode="new" />
      </aside>
    </div>
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
  margin-bottom: 1.5rem;
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

.help code {
  padding: 0.05rem 0.25rem;
  font-size: 12px;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 3px;
}

.preview-panel {
  position: sticky;
  top: 1rem;
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
