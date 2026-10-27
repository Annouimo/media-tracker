<script setup lang="ts">
import { RouterView } from 'vue-router'
import AdminHeader from '../components/AdminHeader.vue'
import AdminToast from '../components/AdminToast.vue'
</script>

<template>
  <AdminHeader />
  <main class="admin-main">
    <RouterView />
  </main>
  <footer class="admin-footer">Annouimo 的陈列室 · 管理</footer>
  <AdminToast />
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
