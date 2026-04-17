<script setup lang="ts">
import { computed, ref } from "vue";

interface Props {
  label: string;
  amount: number;
}

const props = defineProps<{ label: string; amount: number }>();
const isExpanded = ref(false);
const display = computed(() => `${props.label}: ${props.amount}`);
</script>

<template>
  <section class="price-card" :aria-expanded="isExpanded">
    <h2>{{ display }}</h2>
    <button @click="isExpanded = !isExpanded">Toggle</button>
  </section>
</template>

<style scoped>
.price-card {
  padding: 1rem;
}
</style>
