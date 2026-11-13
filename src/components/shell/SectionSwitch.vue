<script setup lang="ts">
/**
 * Calendar / Tasks switch in the page header, just before the title: two icons in an outlined
 * track like the view switcher, the current section on the dark pill (names on hover).
 */
import { RouterLink, useRoute } from 'vue-router'

import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/ui/AppIcon.vue'

const route = useRoute()
const ui = useUiStore()

const linkClass = (active: boolean) =>
  active
    ? 'flex h-full w-10 items-center justify-center rounded-full bg-pill text-on-color'
    : 'flex h-full w-10 items-center justify-center rounded-full text-gray-500 transition-colors duration-150 hover:text-gray-900'
</script>

<template>
  <nav
    class="flex h-9 shrink-0 items-center rounded-full ring-1 ring-gray-300"
    aria-label="Sections"
  >
    <RouterLink
      :to="route.name === 'calendar' ? route.fullPath : `/${ui.view}`"
      :aria-current="route.name === 'calendar' ? 'page' : undefined"
      :class="linkClass(route.name === 'calendar')"
      title="Calendar"
    >
      <AppIcon name="nav-calendar" class="size-5" />
      <span class="sr-only">Calendar</span>
    </RouterLink>
    <RouterLink
      to="/tasks"
      :aria-current="route.name === 'tasks' ? 'page' : undefined"
      :class="linkClass(route.name === 'tasks')"
      title="Tasks"
    >
      <AppIcon name="nav-tasks" class="size-5" />
      <span class="sr-only">Tasks</span>
    </RouterLink>
  </nav>
</template>
