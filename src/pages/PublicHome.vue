<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { copyForCategory, findCategory } from '../../shared/categories'
import type { CategoryCopy } from '../../shared/category-copy'
import type { PublicHome as PublicHomeData, PublicWork } from '../../shared/types'
import { getPublicCategory } from '../lib/api'
import { clearSiteSearch, useSiteSearch } from '../lib/site-search'

const props = defineProps<{ category: string }>()

const query = useSiteSearch()

const data = ref<PublicHomeData | null>(null)
const loading = ref(true)
const error = ref('')

const currentCategory = computed(() => findCategory(props.category))
const categoryLabel = computed(() => currentCategory.value?.label ?? '')
const copy = computed<CategoryCopy>(() => copyForCategory(props.category))

const normalizedQuery = computed(() => query.value.trim().toLowerCase())
const isSearching = computed(() => normalizedQuery.value.length > 0)

function matches(work: PublicWork): boolean {
  if (!isSearching.value) return true
  return [work.title, work.creator, work.short_review].some((value) =>
    value.toLowerCase().includes(normalizedQuery.value),
  )
}

const reading = computed(() => data.value?.reading.filter(matches) ?? [])
const reviews = computed(() => data.value?.reviews.filter(matches) ?? [])
const archive = computed(() => data.value?.archive.filter(matches) ?? [])
const readCount = computed(() => reviews.value.length + archive.value.length)
const hasResults = computed(() => reading.value.length + readCount.value > 0)

const archiveGroups = computed(() => {
  const groups: Array<{ year: string; works: PublicWork[] }> = []
  for (const work of archive.value) {
    const year = work.finished_on?.slice(0, 4) ?? ''
    const last = groups.at(-1)
    if (last && last.year === year) {
      last.works.push(work)
    } else {
      groups.push({ year, works: [work] })
    }
  }
  return groups
})

function readingProgress(work: PublicWork): string {
  return work.total_progress > 1
    ? `${work.progress} / ${work.total_progress} ${copy.value.progressUnit}`
    : copy.value.binary
}

function clearSearch(): void {
  clearSiteSearch()
}

async function load(slug: string): Promise<void> {
  loading.value = true
  error.value = ''
  data.value = null
  clearSiteSearch()

  const category = findCategory(slug)
  if (!category) {
    error.value = '未知分类'
    loading.value = false
    return
  }

  document.title = `${category.label} · 我的阅藏`
  try {
    data.value = await getPublicCategory(slug)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.category,
  (slug) => {
    void load(slug)
  },
  { immediate: true },
)
</script>

<template>
  <div class="home">
    <header class="page-head">
      <h1 class="page-title">{{ categoryLabel }}</h1>
      <p v-if="!loading && !error" class="page-meta">
        {{ copy.readSection }} {{ readCount }} {{ copy.unit }} ·
        {{ copy.status.reading }} {{ reading.length }} {{ copy.unit }}
      </p>
      <p v-if="isSearching && !loading && !error" class="search-state">
        <span class="search-query">搜索：{{ query }}</span>
        <button class="text-button" type="button" @click="clearSearch">清除</button>
      </p>
    </header>

    <p v-if="loading" class="empty">正在加载…</p>
    <p v-else-if="error" class="empty" role="alert">{{ error }}</p>

    <template v-else>
      <section v-if="reading.length" class="section" aria-labelledby="reading-title">
        <div class="section-head">
          <h2 id="reading-title" class="section-title">{{ copy.status.reading }}</h2>
          <span class="section-count">{{ reading.length }}</span>
        </div>
        <ul class="archive-grid">
          <li v-for="work in reading" :key="work.id" class="reading-item">
            <RouterLink class="archive-link" :to="`/works/${work.id}`">
              {{ work.title }}
            </RouterLink>
            <span class="reading-progress">{{ readingProgress(work) }}</span>
          </li>
        </ul>
      </section>

      <template v-if="hasResults">
        <section v-if="reviews.length" class="section" aria-labelledby="reviews-title">
          <div class="section-head">
            <h2 id="reviews-title" class="section-title">短评</h2>
            <span class="section-count">{{ reviews.length }}</span>
          </div>
          <ul class="review-list">
            <li v-for="work in reviews" :key="work.id" class="review-item">
              <h3 class="review-title" :title="work.title">
                <RouterLink :to="`/works/${work.id}`">{{ work.title }}</RouterLink>
              </h3>
              <p class="review-text" :title="work.short_review">{{ work.short_review }}</p>
            </li>
          </ul>
        </section>

        <section v-if="archive.length" class="section" aria-labelledby="archive-title">
          <div class="section-head">
            <h2 id="archive-title" class="section-title">{{ copy.readSection }}</h2>
            <span class="section-count">{{ archive.length }}</span>
          </div>
          <div v-for="group in archiveGroups" :key="group.year" class="year-group">
            <h3 v-if="group.year" class="year-label">{{ group.year }}</h3>
            <ul class="archive-grid">
              <li v-for="work in group.works" :key="work.id">
                <RouterLink class="archive-link" :to="`/works/${work.id}`">
                  {{ work.title }}
                </RouterLink>
              </li>
            </ul>
          </div>
        </section>
      </template>

      <p v-else class="empty">
        <template v-if="isSearching">
          没有匹配的作品。
          <button class="text-button" type="button" @click="clearSearch">清除搜索</button>
        </template>
        <template v-else>{{ copy.emptyRead }}</template>
      </p>
    </template>
  </div>
</template>

<style scoped>
.home {
  padding-top: 0.5rem;
}

.page-head {
  margin-bottom: 2rem;
}

.page-title {
  margin: 0 0 0.5rem;
  font-weight: 700;
}

.page-meta {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--secondary);
}

.search-state {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0.5rem 0 0;
  font-size: 13px;
  color: var(--secondary);
}

.search-query {
  color: var(--primary);
}

.text-button {
  padding: 0;
  font-size: inherit;
  color: var(--secondary);
  background: none;
  border: 0;
  cursor: pointer;
  text-decoration: none;
}

.text-button:hover {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 0.2rem;
}

.reading-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.75rem;
}

.reading-progress {
  flex: none;
  font-size: 13px;
  color: var(--secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.section {
  margin-top: 3rem;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.section-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
}

.section-count {
  font-size: 13px;
  color: var(--secondary);
  font-variant-numeric: tabular-nums;
}

.review-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.review-item {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.review-item + .review-item {
  margin-top: 0.5rem;
}

.review-title {
  flex: 0 0 auto;
  max-width: 50%;
  margin: 0;
  overflow: hidden;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-title a:hover {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

.review-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 16px;
  line-height: 1.6;
  color: var(--secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.year-group + .year-group {
  margin-top: 1.25rem;
}

.year-label {
  margin: 0 0 0.4rem;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--secondary);
}

.archive-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.archive-link {
  font-size: 18px;
  font-weight: 500;
  line-height: 1.6;
}

.archive-link:hover {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

.empty {
  padding: 2rem 0;
  color: var(--secondary);
}

.empty .text-button {
  margin-left: 0.4rem;
}

@media (max-width: 768px) {
  .page-head {
    margin-bottom: 1.5rem;
  }

  .section {
    margin-top: 2.25rem;
  }

  .section-title {
    font-size: 22px;
  }

  .review-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
  }

  .review-title {
    max-width: 100%;
    font-size: 17px;
  }

  .review-text {
    flex: none;
    width: 100%;
  }

  .archive-grid {
    grid-template-columns: 1fr;
  }
}
</style>
