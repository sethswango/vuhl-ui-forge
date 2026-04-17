<script lang="ts">
import { defineComponent, ref } from "vue";

export default defineComponent({
  name: "ItemList",
  props: {
    heading: { type: String, default: "Items" }
  },
  setup() {
    const items = ref<string[]>([]);
    return { items };
  }
});
</script>

<template>
  <section>
    <h3>{{ heading }}</h3>
    <ul>
      <li v-for="item in items" :key="item">{{ item }}</li>
    </ul>
  </section>
</template>
