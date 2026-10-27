<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { CATEGORIES } from '../../shared/categories'
import SiteSearch from './SiteSearch.vue'
import ThemeToggle from './ThemeToggle.vue'
</script>

<template>
  <header class="header">
    <nav class="header-nav" aria-label="主导航">
      <div class="logo">
        <RouterLink class="logo-link" to="/">我的阅藏</RouterLink>
        <ThemeToggle />
      </div>

      <div class="nav-right">
        <ul class="menu">
          <li v-for="category in CATEGORIES" :key="category.slug">
            <RouterLink :to="category.path" exact-active-class="active">
              {{ category.label }}
            </RouterLink>
          </li>
        </ul>
        <SiteSearch />
      </div>
    </nav>
  </header>
</template>

<style scoped>
.nav-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  column-gap: var(--gap);
}
</style>
