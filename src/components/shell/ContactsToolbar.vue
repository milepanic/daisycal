<script setup lang="ts">
/** Contacts page header: section switch, title, import / export, settings and New contact. */
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import SectionSwitch from './SectionSwitch.vue'
import SettingsMenu from './SettingsMenu.vue'
import SidebarToggle from './SidebarToggle.vue'

defineProps<{ canExport: boolean }>()
const emit = defineEmits<{ create: []; import: []; export: [] }>()
</script>

<template>
  <!-- Narrow: the section switch moves to a second row. -->
  <header
    class="flex shrink-0 flex-wrap items-center gap-2 px-2 py-2 md:h-14 md:flex-nowrap md:gap-x-3 md:py-0"
  >
    <SectionSwitch class="order-3 md:order-none" />
    <SidebarToggle class="order-1 md:order-none" />
    <h1
      class="order-1 min-w-0 flex-1 truncate font-display text-lg font-bold text-gray-900 md:order-none md:text-center"
    >
      Contacts
    </h1>
    <div class="order-1 flex shrink-0 items-center gap-x-1 md:order-none md:gap-x-2">
      <IconButton icon="upload" label="Import contacts (.vcf)" @click="emit('import')" />
      <IconButton
        v-if="canExport"
        icon="download"
        label="Export all contacts (.vcf)"
        @click="emit('export')"
      />
      <SettingsMenu />
      <button
        type="button"
        class="btn btn-primary h-9 rounded-full pr-4 pl-3"
        data-testid="new-contact"
        @click="emit('create')"
      >
        <AppIcon name="plus" class="-ml-0.5 size-5" />
        <span class="hidden sm:inline">New contact</span>
        <span class="sr-only sm:hidden">New contact</span>
      </button>
    </div>
    <div class="order-2 basis-full md:hidden" aria-hidden="true"></div>
  </header>
</template>
