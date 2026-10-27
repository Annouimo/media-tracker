import { ref } from 'vue'

const message = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

export function useToastMessage() {
  return message
}

export function showToast(text: string): void {
  message.value = text
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    message.value = ''
    timer = null
  }, 2500)
}
