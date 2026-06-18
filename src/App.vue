<script setup lang="ts">
import ServiceRequestForm from './forms/ServiceRequestForm.vue'
</script>

<template>
  <main class="app">
    <h1>New shiny service request</h1>
    <p class="app__intro">Submit a new service request. Fields marked with * are required.</p>
    <ServiceRequestForm />
  </main>
</template>
