<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    rows?: number
    disabled?: boolean
  }>(),
  {
    label: 'JSON',
    rows: 24,
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <label class="json-editor">
    <span class="json-label">{{ label }}</span>
    <textarea
      class="json-textarea"
      :value="modelValue"
      :rows="rows"
      :disabled="disabled"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      @input="onInput"
    />
  </label>
</template>

<style scoped>
.json-editor {
  display: block;
}

.json-label {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 13px;
  color: var(--secondary);
}

.json-textarea {
  display: block;
  width: 100%;
  min-height: 18rem;
  padding: 0.8rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  color: var(--primary);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  outline: none;
  resize: vertical;
  tab-size: 2;
}

.json-textarea:focus {
  border-color: var(--primary);
}

.json-textarea:disabled {
  opacity: 0.6;
}
</style>
