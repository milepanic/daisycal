<script setup lang="ts">
/**
 * One contact: photo or initials, name, job, labels, quick actions (e-mail, call, copy), then
 * every phone, e-mail, address, website, the birthday (with the age they turn next) and notes.
 * Edit, export as .vcf and delete (asks first, can be undone) at the top.
 */
import { computed, ref, watch } from 'vue'

import type { ContactEntry } from '@/stores/contacts'
import { MONTHS_LONG } from '@/lib/format'
import { type ContactAddress, type FieldType, displayName, nextBirthday } from '@/lib/vcard'
import AppIcon from '@/components/ui/AppIcon.vue'
import ContactAvatar from './ContactAvatar.vue'

const props = defineProps<{
  contact: ContactEntry
  bookName: string
  bookColor: string
  /** Show a back arrow (phones, where the list and the card take turns). */
  back?: boolean
}>()
const emit = defineEmits<{ edit: []; remove: []; export: []; back: [] }>()

const confirming = ref(false)
watch(
  () => props.contact.url,
  () => (confirming.value = false),
)

const TYPE_LABEL: Record<FieldType, string> = {
  mobile: 'Mobile',
  home: 'Home',
  work: 'Work',
  other: 'Other',
}

const job = computed(() => {
  const org = props.contact.org === displayName(props.contact) ? '' : props.contact.org
  return [props.contact.title, org].filter(Boolean).join(' · ')
})

const birthday = computed(() => {
  const b = props.contact.birthday
  const next = nextBirthday(b, new Date())
  if (!next) return null
  const m = /^(?:(\d{4})|--)-?(\d{2})-(\d{2})$/.exec(b)!
  const date = `${Number(m[3])} ${MONTHS_LONG[Number(m[2]) - 1]}${m[1] ? ` ${m[1]}` : ''}`
  const when =
    next.inDays === 0 ? 'today' : next.inDays === 1 ? 'tomorrow' : `in ${next.inDays} days`
  const hint = next.turns != null ? `Turns ${next.turns} ${when}` : `Next one ${when}`
  return { date, hint, soon: next.inDays <= 14 }
})

function addressLines(a: ContactAddress): string[] {
  return [a.street, [a.postcode, a.city].filter(Boolean).join(' '), a.region, a.country].filter(
    Boolean,
  )
}
function mapUrl(a: ContactAddress) {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(addressLines(a).join(', '))}`
}
function href(url: string) {
  return /^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}`
}
const telHref = (v: string) => `tel:${v.replace(/[^\d+]/g, '')}`

/** "Copied" next to the value for a moment. */
const copied = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = null), 1500)
  } catch {
    /* clipboard blocked: nothing to do */
  }
}
</script>

<template>
  <article
    class="scroll-subtle flex min-h-0 flex-col overflow-y-auto rounded-2xl bg-white shadow-card"
    data-testid="contact-detail"
  >
    <div class="flex items-center gap-x-1 px-3 pt-3">
      <button
        v-if="back"
        type="button"
        class="flex size-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        title="All contacts"
        @click="emit('back')"
      >
        <span class="sr-only">All contacts</span>
        <AppIcon name="arrow-left" class="size-4" />
      </button>
      <span class="ml-1 flex items-center gap-x-1.5 text-xs text-gray-400">
        <span class="size-2 rounded-full" :style="{ backgroundColor: bookColor }"></span>
        {{ bookName }}
      </span>
      <div class="ml-auto flex items-center gap-x-1">
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          title="Export as .vcf"
          data-testid="contact-export"
          @click="emit('export')"
        >
          <span class="sr-only">Export as .vcf</span>
          <AppIcon name="download" class="size-4" />
        </button>
        <button type="button" class="btn btn-sm btn-secondary" data-testid="edit-button" @click="emit('edit')">
          <AppIcon name="pencil" class="size-3.5" /> Edit
        </button>
      </div>
    </div>

    <header class="flex flex-col items-center px-6 pt-2 pb-5 text-center">
      <ContactAvatar :contact="contact" size="lg" />
      <h2 class="mt-3 font-display text-2xl font-bold text-gray-900" data-testid="contact-name">
        {{ displayName(contact) }}
      </h2>
      <p v-if="contact.nickname" class="text-sm text-gray-500">“{{ contact.nickname }}”</p>
      <p v-if="job" class="mt-0.5 text-sm text-gray-600">{{ job }}</p>
      <div v-if="contact.categories.length" class="mt-2 flex flex-wrap justify-center gap-1">
        <span
          v-for="c in contact.categories"
          :key="c"
          class="inline-flex h-6 items-center gap-x-1 rounded-full bg-gray-100 px-2.5 text-xs font-medium text-gray-600"
        >
          <AppIcon name="tag" class="size-3" /> {{ c }}
        </span>
      </div>
      <!-- Quick actions. -->
      <div
        v-if="contact.emails.length || contact.phones.length"
        class="mt-4 flex gap-x-2"
      >
        <a
          v-if="contact.emails[0]"
          :href="`mailto:${contact.emails[0].value}`"
          class="flex w-20 flex-col items-center gap-y-1 rounded-xl bg-gray-100 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          <AppIcon name="mail" class="size-5" /> Email
        </a>
        <a
          v-if="contact.phones[0]"
          :href="telHref(contact.phones[0].value)"
          class="flex w-20 flex-col items-center gap-y-1 rounded-xl bg-gray-100 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          <AppIcon name="phone" class="size-5" /> Call
        </a>
      </div>
    </header>

    <dl class="mx-4 mb-4 w-auto max-w-2xl divide-y md:mx-auto md:w-[calc(100%-2rem)] divide-gray-100 rounded-xl ring-1 ring-gray-100">
      <div v-for="(p, i) in contact.phones" :key="`tel${i}`" class="group/f flex items-center gap-x-3 px-4 py-2.5">
        <AppIcon name="phone" class="size-4 shrink-0 text-gray-400" />
        <div class="min-w-0 flex-1">
          <dt class="text-[11px] text-gray-400">{{ TYPE_LABEL[p.type] }}</dt>
          <dd>
            <a :href="telHref(p.value)" class="text-sm text-gray-900 tabular-nums hover:underline">{{ p.value }}</a>
          </dd>
        </div>
        <button
          type="button"
          class="rounded-sm p-1 text-gray-400 opacity-0 transition-opacity group-hover/f:opacity-100 hover:text-gray-900 focus-visible:opacity-100"
          :title="copied === p.value ? 'Copied' : 'Copy'"
          @click="copy(p.value)"
        >
          <span class="sr-only">Copy</span>
          <AppIcon :name="copied === p.value ? 'check' : 'copy'" class="size-4" />
        </button>
      </div>
      <div v-for="(e, i) in contact.emails" :key="`mail${i}`" class="group/f flex items-center gap-x-3 px-4 py-2.5">
        <AppIcon name="mail" class="size-4 shrink-0 text-gray-400" />
        <div class="min-w-0 flex-1">
          <dt class="text-[11px] text-gray-400">{{ TYPE_LABEL[e.type] }}</dt>
          <dd class="truncate">
            <a :href="`mailto:${e.value}`" class="text-sm text-gray-900 hover:underline">{{ e.value }}</a>
          </dd>
        </div>
        <button
          type="button"
          class="rounded-sm p-1 text-gray-400 opacity-0 transition-opacity group-hover/f:opacity-100 hover:text-gray-900 focus-visible:opacity-100"
          :title="copied === e.value ? 'Copied' : 'Copy'"
          @click="copy(e.value)"
        >
          <span class="sr-only">Copy</span>
          <AppIcon :name="copied === e.value ? 'check' : 'copy'" class="size-4" />
        </button>
      </div>
      <div v-for="(a, i) in contact.addresses" :key="`adr${i}`" class="flex items-start gap-x-3 px-4 py-2.5">
        <AppIcon name="pin" class="mt-0.5 size-4 shrink-0 text-gray-400" />
        <div class="min-w-0 flex-1">
          <dt class="text-[11px] text-gray-400">{{ TYPE_LABEL[a.type] }}</dt>
          <dd>
            <a
              :href="mapUrl(a)"
              target="_blank"
              rel="noopener noreferrer"
              class="block text-sm text-gray-900 hover:underline"
            >
              <span v-for="(line, j) in addressLines(a)" :key="j" class="block">{{ line }}</span>
            </a>
          </dd>
        </div>
      </div>
      <div v-for="(u, i) in contact.urls" :key="`url${i}`" class="flex items-center gap-x-3 px-4 py-2.5">
        <AppIcon name="link" class="size-4 shrink-0 text-gray-400" />
        <div class="min-w-0 flex-1">
          <dt class="text-[11px] text-gray-400">Website</dt>
          <dd class="truncate">
            <a :href="href(u)" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-900 hover:underline">{{ u }}</a>
          </dd>
        </div>
      </div>
      <div v-if="birthday" class="flex items-center gap-x-3 px-4 py-2.5" data-testid="contact-birthday">
        <AppIcon name="cake" class="size-4 shrink-0 text-gray-400" />
        <div class="min-w-0 flex-1">
          <dt class="text-[11px] text-gray-400">Birthday</dt>
          <dd class="text-sm text-gray-900">
            {{ birthday.date }}
            <span class="ml-1 text-xs" :class="birthday.soon ? 'font-medium text-accent' : 'text-gray-400'">{{
              birthday.hint
            }}</span>
          </dd>
        </div>
      </div>
      <div v-if="contact.note" class="flex items-start gap-x-3 px-4 py-2.5">
        <AppIcon name="lines" class="mt-0.5 size-4 shrink-0 text-gray-400" />
        <div class="min-w-0 flex-1">
          <dt class="text-[11px] text-gray-400">Notes</dt>
          <dd class="text-sm whitespace-pre-line text-gray-900">{{ contact.note }}</dd>
        </div>
      </div>
      <p
        v-if="
          !contact.phones.length &&
          !contact.emails.length &&
          !contact.addresses.length &&
          !contact.urls.length &&
          !birthday &&
          !contact.note
        "
        class="px-4 py-6 text-center text-sm text-gray-400"
      >
        Nothing else saved for this contact yet.
      </p>
    </dl>

    <div class="mt-auto flex items-center justify-end gap-x-2 px-4 pb-4">
      <template v-if="confirming">
        <span class="mr-auto text-xs text-gray-500">Delete {{ displayName(contact) }}?</span>
        <button type="button" class="btn btn-sm btn-ghost" @click="confirming = false">Cancel</button>
        <button type="button" class="btn btn-sm btn-danger-solid" data-testid="delete-confirm" @click="emit('remove')">
          Delete
        </button>
      </template>
      <button v-else type="button" class="btn btn-sm btn-danger" data-testid="delete-button" @click="confirming = true">
        <AppIcon name="trash" class="size-3.5" /> Delete
      </button>
    </div>
  </article>
</template>
