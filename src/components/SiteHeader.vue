<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ThemeToggle from './ThemeToggle.vue'
</script>

<template>
  <header class="header">
    <nav class="header-nav">
      <div class="logo">
        <RouterLink class="logo-link" to="/">我的阅藏</RouterLink>
        <ThemeToggle />
      </div>

      <ul class="menu">
        <li>
          <RouterLink to="/" exact-active-class="active">首页</RouterLink>
        </li>
      </ul>
    </nav>
  </header>
</template>
