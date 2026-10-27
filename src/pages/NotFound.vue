<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="not-found">
    <h1>页面不存在</h1>
    <p><RouterLink to="/">返回首页</RouterLink></p>
  </div>
</template>

<style scoped>
.not-found {
  padding: 3rem 0;
}

.not-found h1 {
  margin: 0 0 1rem;
  font-size: 32px;
}

.not-found p {
  color: var(--secondary);
}

.not-found a {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}
</style>
