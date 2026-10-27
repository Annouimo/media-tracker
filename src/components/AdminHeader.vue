<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getAccessMe } from '../lib/admin-api'
import ThemeToggle from './ThemeToggle.vue'

const route = useRoute()
const email = ref('')

const isHome = computed(() => route.path === '/admin' || route.path === '/admin/')
const isAdd = computed(() => route.path === '/admin/works/new')
const isLibrary = computed(() => !isHome.value && !isAdd.value)

const isLocal = computed(() => {
  const host = window.location.hostname
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost')
  )
})

onMounted(async () => {
  try {
    email.value = (await getAccessMe()).email
  } catch {
    // The header should not break when Access is unavailable.
  }
})
</script>

<template>
  <header class="admin-header">
    <div class="admin-bar">
      <RouterLink class="brand" to="/admin">
        我的阅藏
        <span class="badge">管理</span>
      </RouterLink>

      <nav class="admin-nav" aria-label="管理导航">
        <RouterLink to="/admin" :class="{ active: isHome }">首页</RouterLink>
        <RouterLink to="/admin/library" :class="{ active: isLibrary }">书架</RouterLink>
        <RouterLink to="/admin/works/new" :class="{ active: isAdd }">添加作品</RouterLink>
      </nav>

      <div class="admin-account">
        <a class="public-link" href="/" target="_blank" rel="noreferrer">公开站点 ↗</a>
        <ThemeToggle />
        <span v-if="email" class="email" :title="email">{{ email }}</span>
        <a v-if="!isLocal" class="logout" href="/cdn-cgi/access/logout">退出</a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.admin-header {
  border-bottom: 1px solid var(--border);
}

.admin-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.5rem;
  max-width: calc(1200px + var(--gap) * 2);
  min-height: var(--header-height);
  margin: auto;
  padding: 0 var(--gap);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 20px;
  font-weight: 700;
}

.badge {
  padding: 0.1rem 0.35rem;
  font-size: 11px;
  font-weight: 500;
  color: var(--secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.admin-nav {
  display: flex;
  gap: 1.25rem;
  margin-right: auto;
  font-size: 15px;
}

.admin-nav a {
  color: var(--secondary);
}

.admin-nav a.active {
  color: var(--primary);
  font-weight: 500;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3rem;
}

.admin-account {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  font-size: 13px;
  color: var(--secondary);
}

.email {
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.public-link,
.logout {
  color: var(--secondary);
}

.public-link:hover,
.logout:hover {
  color: var(--primary);
}

@media (max-width: 768px) {
  .admin-bar {
    padding: 0.75rem var(--gap);
  }

  .admin-nav {
    order: 3;
    width: 100%;
    margin-right: 0;
  }

  .email {
    display: none;
  }
}
</style>
