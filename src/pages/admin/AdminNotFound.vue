<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="admin-not-found">
    <h1>管理页不存在</h1>
    <p><RouterLink to="/admin">返回书架</RouterLink></p>
  </div>
</template>

<style scoped>
.admin-not-found {
  padding: 3rem 0;
}

.admin-not-found h1 {
  margin: 0 0 1rem;
  font-size: 32px;
}

.admin-not-found p {
  color: var(--secondary);
}

.admin-not-found a {
  text-decoration: underline;
  text-underline-offset: 0.25rem;
}
</style>
