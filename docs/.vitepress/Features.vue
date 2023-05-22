<script setup>
import { ref } from 'vue';

const features = ref([]);
</script>

<template>
  <div class="flex flex-col md-flex-row gap-4 pt-16 w-full">
    <div
      v-for="feature in features"
      class="flex flex-col flex-1 p-4 rounded bg-[var(--vp-c-bg-soft)]"
    >
      <h2 class="font-500">{{ feature.title }}</h2>
      <p class="pt-1 text-[var(--vp-c-text-2)]">{{ feature.description }}</p>
    </div>
  </div>
</template>
