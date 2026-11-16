<script setup lang="ts">
/** A contact's photo, or their initials on a soft color picked from the contact (stable). */
import { computed } from 'vue'

import { type ContactFields, initials } from '@/lib/vcard'

const props = withDefaults(
  defineProps<{ contact: ContactFields & { uid?: string }; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'md' },
)

const PALETTE = ['#245a85', '#d9467a', '#0f9488', '#c2620e', '#7c3aed', '#566c86', '#b4235a']

const color = computed(() => {
  const key = props.contact.uid || props.contact.fullName || props.contact.givenName
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]!
})
const letters = computed(() => initials(props.contact))
</script>

<template>
  <span
    class="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold select-none"
    :class="{
      'size-9 text-[13px]': size === 'sm',
      'size-12 text-base': size === 'md',
      'size-24 font-display text-3xl': size === 'lg',
    }"
    :style="{
      backgroundColor: `color-mix(in srgb, ${color} 16%, var(--color-white))`,
      color: `color-mix(in srgb, ${color} 85%, var(--color-gray-900))`,
    }"
    aria-hidden="true"
    data-testid="contact-avatar"
  >
    <img
      v-if="contact.photo"
      :src="contact.photo"
      alt=""
      class="absolute inset-0 size-full object-cover"
      referrerpolicy="no-referrer"
    />
    <span v-else>{{ letters || '?' }}</span>
  </span>
</template>
