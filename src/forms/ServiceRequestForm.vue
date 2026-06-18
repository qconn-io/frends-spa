<script setup lang="ts">
import { reactive, ref } from 'vue'
import { apiFetch, ApiFetchError, asApiErrorBody } from '../api/client'
import { email, firstError, minLength, required, requiredTrue } from '../lib/validation'
import FormField from '../components/FormField.vue'
import TextInput from '../components/TextInput.vue'
import SelectInput from '../components/SelectInput.vue'
import SubmitButton from '../components/SubmitButton.vue'

/**
 * Worked example: "New Service Request" intake form.
 *
 * To add another form, copy this file, swap the fields/validation/payload, and
 * add a matching Frends submission Process at the new `/api/...` route. The
 * submission Process is the real validation boundary — re-validate everything there.
 */

/** Request body POSTed to /api/service-requests. */
interface ServiceRequestPayload {
  requesterName: string
  requesterEmail: string
  department: string
  priority: string
  neededBy: string
  description: string
  acknowledgePolicy: boolean
}

/** Success response from the submission Process. */
interface ServiceRequestResponse {
  referenceId: string
}

const departments = [
  { value: 'Operations', label: 'Operations' },
  { value: 'Finance', label: 'Finance' },
  { value: 'IT', label: 'IT' },
  { value: 'HR', label: 'HR' },
] as const

const priorities = [
  { value: 'Low', label: 'Low' },
  { value: 'Normal', label: 'Normal' },
  { value: 'High', label: 'High' },
] as const

const form = reactive<ServiceRequestPayload>({
  requesterName: '',
  requesterEmail: '',
  department: '',
  priority: 'Normal',
  neededBy: '',
  description: '',
  acknowledgePolicy: false,
})

type FieldName = keyof ServiceRequestPayload

const errors = reactive<Partial<Record<FieldName, string>>>({})
const formError = ref<string | null>(null)
const submitting = ref(false)
const referenceId = ref<string | null>(null)

function setError(field: FieldName, message: string | null): void {
  if (message) errors[field] = message
  else delete errors[field]
}

/** Validate all fields. Returns true when the form is valid. */
function validate(): boolean {
  setError('requesterName', firstError(form.requesterName, [required('Enter the requester name')]))
  setError('requesterEmail', firstError(form.requesterEmail, [required('Enter an email address'), email()]))
  setError('department', form.department ? null : 'Select a department')
  setError(
    'description',
    firstError(form.description, [required('Enter a description'), minLength(20, 'Description must be at least 20 characters')]),
  )
  setError('acknowledgePolicy', requiredTrue()(form.acknowledgePolicy))
  return Object.keys(errors).length === 0
}

async function onSubmit(): Promise<void> {
  formError.value = null
  if (!validate()) return

  submitting.value = true
  try {
    const result = await apiFetch<ServiceRequestResponse>('/service-requests', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    // Post/redirect/get spirit: replace the form with a confirmation panel.
    referenceId.value = result.referenceId
  } catch (e) {
    if (e instanceof ApiFetchError) {
      const body = asApiErrorBody(e.body)
      // Map any server-side field errors back onto the form.
      if (body.errors) {
        for (const [key, message] of Object.entries(body.errors)) {
          if (key in form) setError(key as FieldName, message)
        }
      }
      formError.value =
        body.message ?? `Submission failed (HTTP ${e.status}). Please review the form and try again.`
    } else {
      formError.value = 'Could not reach the server. Check your connection and try again.'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section v-if="referenceId" class="panel panel--success" aria-live="polite">
    <h2>Request submitted</h2>
    <p>Thank you. Your service request has been received.</p>
    <p>
      Your reference id is <strong>{{ referenceId }}</strong>. Keep it for tracking.
    </p>
  </section>

  <form v-else class="form" novalidate @submit.prevent="onSubmit">
    <p v-if="formError" class="form__error" role="alert">{{ formError }}</p>

    <FormField id="requesterName" v-slot="{ describedby }" label="Requester name" required :error="errors.requesterName">
      <TextInput
        id="requesterName"
        v-model="form.requesterName"
        autocomplete="name"
        required
        :invalid="!!errors.requesterName"
        :describedby="describedby"
      />
    </FormField>

    <FormField id="requesterEmail" v-slot="{ describedby }" label="Requester email" required :error="errors.requesterEmail">
      <TextInput
        id="requesterEmail"
        v-model="form.requesterEmail"
        type="email"
        autocomplete="email"
        required
        :invalid="!!errors.requesterEmail"
        :describedby="describedby"
      />
    </FormField>

    <FormField id="department" v-slot="{ describedby }" label="Department" required :error="errors.department">
      <SelectInput
        id="department"
        v-model="form.department"
        :options="departments"
        placeholder="Select a department"
        required
        :invalid="!!errors.department"
        :describedby="describedby"
      />
    </FormField>

    <FormField id="priority" v-slot="{ describedby }" label="Priority" :error="errors.priority">
      <SelectInput id="priority" v-model="form.priority" :options="priorities" :describedby="describedby" />
    </FormField>

    <FormField id="neededBy" v-slot="{ describedby }" label="Needed by" :error="errors.neededBy">
      <TextInput id="neededBy" v-model="form.neededBy" type="date" :describedby="describedby" />
    </FormField>

    <FormField id="description" v-slot="{ describedby }" label="Description" required :error="errors.description">
      <TextInput
        id="description"
        v-model="form.description"
        multiline
        :rows="5"
        required
        placeholder="Describe what you need (at least 20 characters)"
        :invalid="!!errors.description"
        :describedby="describedby"
      />
    </FormField>

    <div class="field field--checkbox" :class="{ 'field--error': !!errors.acknowledgePolicy }">
      <input
        id="acknowledgePolicy"
        v-model="form.acknowledgePolicy"
        type="checkbox"
        :aria-invalid="!!errors.acknowledgePolicy || undefined"
        :aria-describedby="errors.acknowledgePolicy ? 'acknowledgePolicy-error' : undefined"
      />
      <label for="acknowledgePolicy">I acknowledge the service request policy</label>
      <p v-if="errors.acknowledgePolicy" id="acknowledgePolicy-error" class="field__error" role="alert">
        {{ errors.acknowledgePolicy }}
      </p>
    </div>

    <SubmitButton :loading="submitting" label="Submit request" loading-label="Submitting…" />
  </form>
</template>
