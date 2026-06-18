<script setup lang="ts">
/** Single-line input (text/email/date) or a textarea when `multiline` is set. */
const model = defineModel<string>({ required: true })

defineProps<{
  /** Element id; must match the FormField `id` for label/aria wiring. */
  id: string
  /** Input type for single-line mode. Ignored when `multiline`. */
  type?: 'text' | 'email' | 'date'
  /** Render a <textarea> instead of an <input>. */
  multiline?: boolean
  /** Rows for the textarea. */
  rows?: number
  required?: boolean
  /** Mark the control invalid (sets aria-invalid). */
  invalid?: boolean
  /** id of the error element, for aria-describedby (from FormField slot). */
  describedby?: string
  autocomplete?: string
  placeholder?: string
}>()
</script>

<template>
  <textarea
    v-if="multiline"
    :id="id"
    v-model="model"
    class="input"
    :rows="rows ?? 4"
    :required="required"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
    :placeholder="placeholder"
  />
  <input
    v-else
    :id="id"
    v-model="model"
    class="input"
    :type="type ?? 'text'"
    :required="required"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
    :autocomplete="autocomplete"
    :placeholder="placeholder"
  />
</template>
