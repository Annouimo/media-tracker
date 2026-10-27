<script setup lang="ts">
import { RouterView } from 'vue-router'
import SiteFooter from '../components/SiteFooter.vue'
import SiteHeader from '../components/SiteHeader.vue'
</script>

<template>
  <SiteHeader />
  <main class="main">
    <RouterView />
  </main>
  <SiteFooter />
</template>
