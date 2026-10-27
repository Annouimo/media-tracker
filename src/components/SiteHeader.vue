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
        <RouterLink class="logo-link" to="/">Annouimo 的陈列室</RouterLink>
        <ThemeToggle />
      </div>

      <div class="nav-right">
        <ul class="menu">
          <li v-for="category in CATEGORIES" :key="category.slug">
            <RouterLink :to="category.path" exact-active-class="active">
              {{ category.label }}
            </RouterLink>
          </li>
          <li>
            <a class="external-link" href="https://www.annouimo.com/" title="博客">
              <span>博客</span>&nbsp;
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                shape-rendering="geometricPrecision"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                viewBox="0 0 24 24"
                height="12"
                width="12"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14L21 3" />
              </svg>
            </a>
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

.menu .external-link {
  display: inline-flex;
  align-items: center;
}

.menu .external-link svg {
  display: block;
}
</style>
