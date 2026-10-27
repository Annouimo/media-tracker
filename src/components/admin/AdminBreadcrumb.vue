<script setup lang="ts">
import { RouterLink } from 'vue-router'

type Item = { label: string; to?: string }

defineProps<{ items: Item[] }>()
</script>

<template>
  <nav class="breadcrumb" aria-label="面包屑">
    <template v-for="(item, index) in items" :key="`${item.label}-${index}`">
      <span v-if="index > 0" class="sep" aria-hidden="true">/</span>
      <RouterLink v-if="item.to" :to="item.to">{{ item.label }}</RouterLink>
      <span v-else class="current" aria-current="page">{{ item.label }}</span>
    </template>
  </nav>
</template>

<style scoped>
.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  font-size: 13px;
  color: var(--secondary);
}

.breadcrumb a {
  color: var(--secondary);
}

.breadcrumb a:hover {
  color: var(--primary);
}

.current {
  color: var(--primary);
}

.sep {
  color: var(--tertiary);
}
</style>
