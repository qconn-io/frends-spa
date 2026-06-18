<script setup lang="ts">
/** Native <select> bound with v-model. */
const model = defineModel<string>({ required: true })

defineProps<{
  /** Element id; must match the FormField `id` for label/aria wiring. */
  id: string
  /** Selectable options. */
  options: ReadonlyArray<{ value: string; label: string }>
  required?: boolean
  /** Mark the control invalid (sets aria-invalid). */
  invalid?: boolean
  /** id of the error element, for aria-describedby (from FormField slot). */
  describedby?: string
  /** Optional disabled placeholder option shown when no value is selected. */
  placeholder?: string
}>()
</script>

<template>
  <select
    :id="id"
    v-model="model"
    class="input"
    :required="required"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
  >
    <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
    <option v-for="opt in options" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </option>
  </select>
</template>
