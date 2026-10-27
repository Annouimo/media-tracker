<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { CreateWorkInput } from '../../../shared/schemas'
import type { AdminState } from '../../../shared/types'
import WorkForm from '../../components/admin/WorkForm.vue'
import { getAdminState, postCreate } from '../../lib/admin-api'
import { ApiError } from '../../lib/http'

const router = useRouter()
const formRef = ref<{ markSaved: () => void } | null>(null)
const existingWorks = ref<AdminState['works']>([])
const saving = ref(false)
const serverError = ref('')

onMounted(async () => {
  document.title = '添加作品 · 我的阅藏'
  try {
    existingWorks.value = (await getAdminState()).works
  } catch {
    // Duplicate detection is best-effort; saving still works.
  }
})

async function save(payload: CreateWorkInput): Promise<void> {
  saving.value = true
  serverError.value = ''
  try {
    const result = await postCreate(payload)
    formRef.value?.markSaved()
    await router.push(`/admin/works/${result.work.id}/progress`)
  } catch (cause) {
    serverError.value =
      cause instanceof ApiError
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="editor-page">
    <p class="back"><RouterLink to="/admin">← 返回书架</RouterLink></p>

    <header class="editor-header">
      <h1>添加作品</h1>
      <p class="muted">填写字段后保存；需要特殊字段或批量操作时切到 JSON 模式。</p>
    </header>

    <WorkForm
      ref="formRef"
      mode="new"
      :existing-works="existingWorks"
      :saving="saving"
      :server-error="serverError"
      @create="save"
    />
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

@media (max-width: 900px) {
  .editor-header h1 {
    font-size: 32px;
  }
}
</style>
