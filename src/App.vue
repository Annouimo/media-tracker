<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SiteFooter from './components/SiteFooter.vue'
import SiteHeader from './components/SiteHeader.vue'

const route = useRoute()
const wide = computed(() => route.meta.wide === true)
</script>

<template>
  <SiteHeader />
  <main :class="['main', { 'main--wide': wide }]">
    <RouterView />
  </main>
  <SiteFooter />
</template>
