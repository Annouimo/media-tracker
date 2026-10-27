<script setup lang="ts">
import { useToastMessage } from '../lib/toast'

const message = useToastMessage()
</script>

<template>
  <div v-if="message" class="toast" role="status">{{ message }}</div>
</template>

<style scoped>
.toast {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 50;
  max-width: calc(100% - 3rem);
  padding: 0.55rem 0.9rem;
  font-size: 13px;
  line-height: 1.5;
  color: var(--background);
  background: var(--primary);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
  pointer-events: none;
}

@media (max-width: 768px) {
  .toast {
    right: 1rem;
    bottom: 1rem;
  }
}
</style>
