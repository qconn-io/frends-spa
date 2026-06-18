<script setup lang="ts">
/**
 * Label + control + error wrapper, reused by every field.
 *
 * Pass the control's `id` so the <label for> and the error's aria wiring line up.
 * The default slot exposes `describedby` — bind it to the control's
 * `aria-describedby` so screen readers announce the error for this field.
 */
defineProps<{
  /** Visible field label text. */
  label: string
  /** id of the control rendered in the slot; used by <label for> and aria. */
  id: string
  /** Current error message, or null/undefined when the field is valid. */
  error?: string | null
  /** Show the required marker. */
  required?: boolean
}>()
</script>

<template>
  <div class="field" :class="{ 'field--error': !!error }">
    <label class="field__label" :for="id">
      {{ label }}
      <span v-if="required" class="field__required" aria-hidden="true">*</span>
    </label>

    <slot :describedby="error ? `${id}-error` : undefined" />

    <p v-if="error" :id="`${id}-error`" class="field__error" role="alert">
      {{ error }}
    </p>
  </div>
</template>
