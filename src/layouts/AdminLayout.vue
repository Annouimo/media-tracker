<script setup lang="ts">
import { RouterView } from 'vue-router'
import AdminHeader from '../components/AdminHeader.vue'
</script>

<template>
  <AdminHeader />
  <main class="admin-main">
    <RouterView />
  </main>
  <footer class="admin-footer">我的阅藏 · 管理</footer>
</template>

<style scoped>
.admin-main {
  flex: 1;
  width: 100%;
  max-width: calc(1200px + var(--gap) * 2);
  margin: auto;
  padding: var(--gap);
}

.admin-footer {
  max-width: calc(1200px + var(--gap) * 2);
  margin: auto;
  padding: 0 var(--gap) 2rem;
  font-size: 12px;
  color: var(--secondary);
  text-align: right;
}

@media (max-width: 768px) {
  .admin-footer {
    padding-bottom: 1.5rem;
  }
}
</style>
