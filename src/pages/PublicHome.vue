<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { PublicHome as PublicHomeData, PublicWork } from '../../shared/types'
import { getPublicHome } from '../lib/api'

const data = ref<PublicHomeData | null>(null)
const loading = ref(true)
const error = ref('')
const query = ref('')

const normalizedQuery = computed(() => query.value.trim().toLowerCase())

function matches(work: PublicWork): boolean {
  if (!normalizedQuery.value) return true
  return [work.title, work.creator, work.short_review].some((value) =>
    value.toLowerCase().includes(normalizedQuery.value),
  )
}

const reading = computed(() => data.value?.reading.filter(matches) ?? [])
const reviews = computed(() => data.value?.reviews.filter(matches) ?? [])
const archive = computed(() => data.value?.archive.filter(matches) ?? [])
const hasResults = computed(
  () => reading.value.length + reviews.value.length + archive.value.length > 0,
)
const isSearching = computed(() => normalizedQuery.value.length > 0)

onMounted(async () => {
  document.title = '我的阅藏'
  try {
    data.value = await getPublicHome()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="home">
    <h1 class="sr-only">我的阅藏</h1>

    <p v-if="loading" class="empty">正在加载…</p>
    <p v-else-if="error" class="empty" role="alert">{{ error }}</p>

    <template v-else>
      <p v-if="reading.length" class="reading-line">
        <span class="reading-label">在读：</span>
        <template v-for="(work, index) in reading" :key="work.id">
          <span v-if="index > 0"> · </span>
          <RouterLink :to="`/works/${work.id}`">{{ work.title }}</RouterLink>
        </template>
      </p>

      <label class="search">
        <span class="sr-only">搜索作品</span>
        <input
          v-model="query"
          class="search-input"
          type="search"
          placeholder="搜索书名、作者、短评"
          autocomplete="off"
          spellcheck="false"
          @keydown.esc="query = ''"
        />
      </label>

      <template v-if="hasResults">
        <section v-if="reviews.length" class="section" aria-labelledby="reviews-title">
          <h2 id="reviews-title" class="section-title">短评</h2>
          <ul class="review-list">
            <li v-for="work in reviews" :key="work.id" class="review-item">
              <h3 class="review-title">
                <RouterLink :to="`/works/${work.id}`">{{ work.title }}</RouterLink>
              </h3>
              <p class="review-text">{{ work.short_review }}</p>
            </li>
          </ul>
        </section>

        <section v-if="archive.length" class="section" aria-labelledby="archive-title">
          <h2 id="archive-title" class="section-title">读过</h2>
          <ul class="title-columns">
            <li v-for="work in archive" :key="work.id">
              <RouterLink :to="`/works/${work.id}`">{{ work.title }}</RouterLink>
            </li>
          </ul>
        </section>
      </template>

      <p v-else class="empty">
        {{ isSearching ? '没有匹配的作品。' : '还没有读过作品。' }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.home {
  padding-top: 0.5rem;
}

.reading-line {
  margin: 0 0 1.5rem;
  font-size: 16px;
  line-height: 1.8;
  color: var(--secondary);
}

.reading-line a {
  color: var(--primary);
}

.reading-line a:hover {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

.search {
  display: block;
  margin: 0 0 2.5rem;
}

.search-input {
  width: 100%;
  padding: 0.65rem 0.85rem;
  font-size: 16px;
  color: var(--primary);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  outline: none;
}

.search-input:focus {
  border-color: var(--primary);
}

.section {
  margin-top: 2.5rem;
}

.section-title {
  margin: 0 0 1rem;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
}

.review-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--border);
}

.review-item {
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--border);
}

.review-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
}

.review-title a:hover {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

.review-text {
  display: -webkit-box;
  margin: 0.5rem 0 0;
  overflow: hidden;
  font-size: 16px;
  line-height: 1.6;
  color: var(--secondary);
  white-space: pre-line;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.title-columns {
  margin: 0;
  padding: 0;
  list-style: none;
  columns: 2;
  column-gap: 2rem;
}

.title-columns li {
  margin: 0 0 0.55rem;
  font-size: 17px;
  line-height: 1.6;
  break-inside: avoid;
}

.title-columns a:hover {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}

.empty {
  padding: 2rem 0;
  color: var(--secondary);
}

@media (max-width: 768px) {
  .title-columns {
    columns: 1;
  }

  .section-title {
    font-size: 22px;
  }

  .review-title {
    font-size: 18px;
  }
}
</style>
