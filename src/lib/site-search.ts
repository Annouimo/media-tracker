import { ref } from 'vue'

const query = ref('')

/**
 * Shared query between the header search box and the public category page.
 * The page filters its lists; the header only owns the input UI.
 */
export function useSiteSearch() {
  return query
}

export function clearSiteSearch(): void {
  query.value = ''
}
