<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CATEGORIES } from '../../shared/categories'
import { useSiteSearch } from '../lib/site-search'

const route = useRoute()
const query = useSiteSearch()

const open = ref(false)
const dialogEl = ref<HTMLDialogElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

const normalizedPath = computed(() => route.path.replace(/\/+$/, '') || '/')
const category = computed(() =>
  CATEGORIES.find((item) => item.path === normalizedPath.value),
)
const isCategoryPage = computed(() => category.value !== undefined)
const placeholder = computed(
  () => category.value?.copy.searchPlaceholder ?? '搜索',
)

function show(): void {
  open.value = true
  void nextTick(() => {
    const dialog = dialogEl.value
    if (dialog && !dialog.open) dialog.showModal()
    inputEl.value?.focus()
  })
}

function close(): void {
  const dialog = dialogEl.value
  if (dialog?.open) dialog.close()
  open.value = false
}

function toggle(): void {
  if (open.value) close()
  else show()
}

function onDialogClick(event: MouseEvent): void {
  if (event.target === dialogEl.value) close()
}

function clear(): void {
  query.value = ''
}

watch(
  () => route.fullPath,
  () => {
    if (open.value) close()
  },
)
</script>

<template>
  <template v-if="isCategoryPage">
    <button
      class="search-toggle"
      type="button"
      aria-label="搜索"
      :aria-expanded="open"
      aria-controls="site-search"
      @click="toggle"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </button>

    <dialog
      id="site-search"
      ref="dialogEl"
      class="search-dialog"
      aria-label="搜索作品"
      @close="open = false"
      @click="onDialogClick"
    >
      <form class="search-form" role="search" @submit.prevent="close">
        <input
          ref="inputEl"
          v-model="query"
          type="search"
          :placeholder="placeholder"
          aria-label="搜索"
          autocomplete="off"
          spellcheck="false"
        />
        <p class="search-hint">输入关键词，页面即时筛选 · Esc 关闭</p>
        <div class="search-actions">
          <button v-if="query" class="search-clear" type="button" @click="clear">
            清除
          </button>
          <button class="search-done" type="submit">完成</button>
        </div>
      </form>
    </dialog>
  </template>
</template>

<style scoped>
.search-toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0.4rem;
  line-height: 1;
  color: var(--primary);
}

.search-toggle svg {
  display: block;
}

.search-dialog {
  position: fixed;
  inset: auto;
  top: calc(var(--header-height) + 8px);
  right: max(1rem, calc((100vw - var(--nav-width)) / 2));
  left: auto;
  bottom: auto;
  width: min(380px, calc(100vw - 2rem));
  margin: 0;
  padding: 0.9rem;
  color: var(--primary);
  background: var(--theme);
  border: 0;
  border-radius: var(--radius);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.14);
  outline: none;
}

.search-dialog::backdrop {
  background: rgb(0 0 0 / 0.06);
}

.search-form {
  display: block;
}

.search-form input {
  width: 100%;
  padding: 0.65rem 0.75rem;
  font-size: 16px;
  color: var(--primary);
  background: var(--code-bg);
  border: 0;
  border-radius: 6px;
  outline: none;
}

.search-hint {
  margin: 0.55rem 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--secondary);
}

.search-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.6rem;
}

.search-clear,
.search-done {
  padding: 0;
  font-size: 13px;
  background: none;
  border: 0;
  cursor: pointer;
}

.search-clear {
  color: var(--secondary);
}

.search-done {
  font-weight: 500;
  color: var(--primary);
}

.search-clear:hover,
.search-done:hover {
  text-decoration: underline;
  text-underline-offset: 0.2rem;
}

@media (max-width: 768px) {
  .search-dialog {
    top: calc(var(--header-height) + 4px);
    right: 0.75rem;
    width: calc(100vw - 1.5rem);
  }
}
</style>
