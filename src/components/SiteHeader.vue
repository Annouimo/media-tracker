<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { CATEGORIES } from '../../shared/categories'
import ThemeToggle from './ThemeToggle.vue'
</script>

<template>
  <header class="header">
    <nav class="header-nav" aria-label="主导航">
      <div class="logo">
        <RouterLink class="logo-link" to="/">我的阅藏</RouterLink>
        <ThemeToggle />
      </div>

      <ul class="menu">
        <li v-for="category in CATEGORIES" :key="category.slug">
          <RouterLink :to="category.path" exact-active-class="active">
            {{ category.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
  </header>
</template>
