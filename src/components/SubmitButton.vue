<script setup lang="ts">
/** Submit button that disables itself and shows a busy label while in flight. */
defineProps<{
  /** Submission is in progress: disables the button and sets aria-busy. */
  loading?: boolean
  /** Disable for other reasons (e.g. nothing to submit). */
  disabled?: boolean
  label?: string
  loadingLabel?: string
}>()
</script>

<template>
  <button
    type="submit"
    class="submit"
    :disabled="loading || disabled"
    :aria-busy="loading || undefined"
  >
    {{ loading ? (loadingLabel ?? 'Submitting…') : (label ?? 'Submit') }}
  </button>
</template>
