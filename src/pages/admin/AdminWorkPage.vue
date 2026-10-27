<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { categoryForType } from '../../../shared/categories'
import type { AdminWorkDetail, WorkWithState } from '../../../shared/types'
import AdminBreadcrumb from '../../components/admin/AdminBreadcrumb.vue'
import { getAdminWork } from '../../lib/admin-api'
import { ApiError } from '../../lib/http'
import WorkMetadataPanel from './WorkMetadataPanel.vue'
import WorkProgressPanel from './WorkProgressPanel.vue'

type Tab = 'progress' | 'metadata'

const route = useRoute()
const router = useRouter()

const detail = ref<AdminWorkDetail | null>(null)
const loading = ref(true)
const notFound = ref(false)
const error = ref('')
const tab = ref<Tab>(route.query.tab === 'metadata' ? 'metadata' : 'progress')
const metadataDirty = ref(false)

const workId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const work = computed(() => detail.value?.work ?? null)
const categoryLabel = computed(() => {
  const type = work.value?.type
  return type ? (categoryForType(type)?.label ?? type) : ''
})
const isPublic = computed(
  () =>
    work.value !== null &&
    (work.value.state.finishedOn !== null || work.value.state.status === 'reading'),
)

async function load(id: string): Promise<void> {
  loading.value = true
  error.value = ''
  notFound.value = false
  detail.value = null

  try {
    detail.value = await getAdminWork(id)
    document.title = `${detail.value.work.title} · 我的阅藏`
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

function updateWork(next: WorkWithState): void {
  if (!detail.value) return
  detail.value = { work: next, logs: detail.value.logs }
  document.title = `${next.title} · 我的阅藏`
}

function setTab(next: Tab): void {
  if (next === tab.value) return
  if (tab.value === 'metadata' && metadataDirty.value) {
    if (!window.confirm('有未保存的元数据修改，确定离开？')) return
  }
  tab.value = next
  metadataDirty.value = false

  const query = { ...route.query }
  if (next === 'metadata') query.tab = 'metadata'
  else delete query.tab
  void router.replace({ query })
}

watch(
  workId,
  (id) => {
    tab.value = route.query.tab === 'metadata' ? 'metadata' : 'progress'
    metadataDirty.value = false
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
  <div class="work-page">
    <p v-if="loading" class="empty">正在加载…</p>

    <p v-else-if="notFound" class="empty">
      没有找到这个作品。
      <RouterLink to="/admin/library">返回作品库</RouterLink>
    </p>

    <p v-else-if="error && !work" class="empty" role="alert">{{ error }}</p>

    <template v-else-if="work">
      <div class="crumb-row">
        <AdminBreadcrumb
          :items="[
            { label: '作品库', to: '/admin/library' },
            { label: work.title },
          ]"
        />
      </div>

      <header class="work-head">
        <div>
          <h1>{{ work.title }}</h1>
          <p class="meta">
            <span v-if="work.creator">{{ work.creator }}</span>
            <span v-if="work.release_year">{{ work.release_year }}</span>
            <span>{{ categoryLabel }}</span>
          </p>
        </div>
        <a
          v-if="isPublic"
          class="public-link"
          :href="`/works/${work.id}`"
          target="_blank"
          rel="noreferrer"
        >
          公开页 ↗
        </a>
      </header>

      <div class="tabs" role="tablist" aria-label="作品视图">
        <button
          id="tab-progress"
          type="button"
          role="tab"
          aria-controls="panel-progress"
          :aria-selected="tab === 'progress'"
          :class="{ active: tab === 'progress' }"
          @click="setTab('progress')"
        >
          进度
        </button>
        <button
          id="tab-metadata"
          type="button"
          role="tab"
          aria-controls="panel-metadata"
          :aria-selected="tab === 'metadata'"
          :class="{ active: tab === 'metadata' }"
          @click="setTab('metadata')"
        >
          元数据
        </button>
      </div>

      <div
        v-if="tab === 'progress'"
        id="panel-progress"
        role="tabpanel"
        aria-labelledby="tab-progress"
      >
        <WorkProgressPanel
          :key="`progress-${work.id}`"
          :work-id="work.id"
          @updated="updateWork"
        />
      </div>
      <div
        v-else
        id="panel-metadata"
        role="tabpanel"
        aria-labelledby="tab-metadata"
      >
        <WorkMetadataPanel
          :key="`metadata-${work.id}`"
          :work-id="work.id"
          @saved="updateWork"
          @dirty="metadataDirty = $event"
          @cancel="setTab('progress')"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.work-page {
  padding-top: 0.5rem;
}

.crumb-row {
  margin: 0 0 1.25rem;
}

.work-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.work-head h1 {
  margin: 0 0 0.4rem;
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

.public-link {
  flex: none;
  font-size: 13px;
  color: var(--secondary);
}

.public-link:hover {
  color: var(--primary);
}

.tabs {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 0.5rem;
  font-size: 15px;
}

.tabs button {
  padding: 0.2rem 0;
  color: var(--secondary);
  background: none;
  border: 0;
  cursor: pointer;
}

.tabs button.active {
  color: var(--primary);
  font-weight: 600;
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
  .work-head {
    flex-direction: column;
  }

  .work-head h1 {
    font-size: 32px;
  }
}
</style>
