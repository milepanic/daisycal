<script setup lang="ts">
/**
 * New / edit contact, in place of the contact card: photo, name (more name fields on demand),
 * work, then as many phones, e-mails, addresses and websites as needed, birthday (with or
 * without the year), labels and notes. Ctrl+Enter saves, Escape cancels.
 */
import { computed, nextTick, onMounted, reactive, ref } from 'vue'

import type { AddressBook } from '@/api/caldav'
import {
  type ContactFields,
  type FieldType,
  displayName,
  emptyFields,
  fieldsOf,
} from '@/lib/vcard'
import AppIcon from '@/components/ui/AppIcon.vue'
import ColorSelect from '@/components/ui/ColorSelect.vue'
import ContactAvatar from './ContactAvatar.vue'

const props = defineProps<{
  /** The contact being edited; none for a new one. */
  initial?: ContactFields & { uid?: string }
  books: AddressBook[]
  bookColor: (url: string) => string
  /** Where a new contact goes. */
  bookUrl?: string
  /** Labels used on other contacts, offered while typing. */
  categories: string[]
  saving?: boolean
}>()
const emit = defineEmits<{ save: [fields: ContactFields, bookUrl: string]; cancel: [] }>()

const form = reactive<ContactFields>(props.initial ? fieldsOf(props.initial) : emptyFields())
const book = ref(props.bookUrl ?? props.books[0]?.url ?? '')
const isNew = !props.initial

/** Prefix, middle name, suffix and nickname stay folded away unless used. */
const moreNames = ref(Boolean(form.prefix || form.middleName || form.suffix || form.nickname))

// Birthday: a date input plus "no year" (stored as --MM-DD).
const bdayNoYear = ref(form.birthday.startsWith('--'))
const bdayDate = ref(
  form.birthday.startsWith('--') ? `2000-${form.birthday.slice(2)}` : form.birthday,
)

const labelsText = ref(form.categories.join(', '))
const labelSuggestions = computed(() => {
  const used = new Set(labelsText.value.split(',').map((s) => s.trim()))
  return props.categories.filter((c) => !used.has(c)).slice(0, 6)
})
function addLabel(c: string) {
  const parts = labelsText.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  labelsText.value = [...parts, c].join(', ')
}

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
]
const EMAIL_TYPES = TYPE_OPTIONS.filter((o) => o.value !== 'mobile')

const bookOptions = computed(() =>
  props.books.map((b) => ({ value: b.url, label: b.displayName, color: props.bookColor(b.url) })),
)

const firstInput = ref<HTMLInputElement | null>(null)
onMounted(() => {
  // A new contact starts with one empty phone and e-mail to fill in.
  if (isNew) {
    form.phones.push({ type: 'mobile', value: '' })
    form.emails.push({ type: 'home', value: '' })
  }
  void nextTick(() => firstInput.value?.focus())
})

async function focusLast(selector: string) {
  await nextTick()
  const all = document.querySelectorAll<HTMLInputElement>(selector)
  all[all.length - 1]?.focus()
}
function addPhone() {
  form.phones.push({ type: form.phones.length ? 'work' : 'mobile', value: '' })
  void focusLast('[data-field="phone"]')
}
function addEmail() {
  form.emails.push({ type: form.emails.length ? 'work' : 'home', value: '' })
  void focusLast('[data-field="email"]')
}
function addAddress() {
  form.addresses.push({ type: 'home', street: '', city: '', region: '', postcode: '', country: '' })
  void focusLast('[data-field="street"]')
}
function addUrl() {
  form.urls.push('')
  void focusLast('[data-field="url"]')
}

// ---- photo: picked from a file, cropped to a 256px square JPEG -----------------------------
const photoInput = ref<HTMLInputElement | null>(null)
const photoError = ref<string | null>(null)
async function onPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  photoError.value = null
  try {
    const bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    canvas
      .getContext('2d')!
      .drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      )
    form.photo = canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    photoError.value = 'That file is not an image the browser can read.'
  }
}

const hasName = computed(() => displayName(form) !== 'No name')
const error = ref<string | null>(null)

function submit() {
  if (!hasName.value) {
    error.value = 'Add a name, a company, an e-mail or a phone number.'
    firstInput.value?.focus()
    return
  }
  const fields: ContactFields = {
    ...fieldsOf(form),
    // The formatted name follows the name fields (FN is rebuilt from them).
    fullName: '',
    emails: form.emails.filter((x) => x.value.trim()),
    phones: form.phones.filter((x) => x.value.trim()),
    addresses: form.addresses.filter((a) =>
      [a.street, a.city, a.region, a.postcode, a.country].some((s) => s.trim()),
    ),
    urls: form.urls.filter((u) => u.trim()),
    birthday: bdayDate.value
      ? bdayNoYear.value
        ? `--${bdayDate.value.slice(5)}`
        : bdayDate.value
      : '',
    categories: [
      ...new Set(
        labelsText.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
  }
  // No name parts at all (only a company or e-mail): keep the old formatted name if any.
  if (!fields.givenName && !fields.familyName && props.initial?.fullName)
    fields.fullName = props.initial.fullName
  emit('save', fields, book.value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    submit()
  } else if (e.key === 'Escape' && !e.defaultPrevented) {
    e.preventDefault()
    emit('cancel')
  }
}

const field =
  'h-9 w-full min-w-0 rounded-lg bg-gray-100 px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-900 focus:outline-none'
const removeBtn =
  'flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700'
const addBtn =
  'inline-flex h-7 items-center gap-x-1 rounded-full px-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900'
</script>

<template>
  <form
    class="scroll-subtle flex min-h-0 flex-col overflow-y-auto rounded-2xl bg-white shadow-card"
    novalidate
    data-testid="contact-form"
    @submit.prevent="submit"
    @keydown="onKeydown"
  >
    <div class="mx-auto flex w-full max-w-2xl items-center px-5 pt-4">
      <h2 class="font-display text-lg font-bold text-gray-900">
        {{ isNew ? 'New contact' : 'Edit contact' }}
      </h2>
      <div class="ml-auto flex items-center gap-x-2">
        <button type="button" class="btn btn-sm btn-ghost" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="btn btn-sm btn-primary" :disabled="saving" data-testid="contact-save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <div class="mx-auto w-full max-w-2xl space-y-5 px-5 pt-4 pb-6">
      <!-- Photo + name -->
      <div class="flex items-start gap-x-4">
        <div class="flex flex-col items-center gap-y-1">
          <button
            type="button"
            class="group/ph relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            title="Choose a photo"
            @click="photoInput?.click()"
          >
            <ContactAvatar :contact="form" size="md" />
            <span
              class="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover/ph:opacity-100"
            >
              <AppIcon name="camera" class="size-5" />
            </span>
            <span class="sr-only">Choose a photo</span>
          </button>
          <button
            v-if="form.photo"
            type="button"
            class="text-[11px] font-medium text-gray-500 hover:text-gray-900"
            @click="form.photo = ''"
          >
            Remove
          </button>
          <input ref="photoInput" type="file" accept="image/*" class="hidden" @change="onPhoto" />
        </div>
        <div class="min-w-0 flex-1 space-y-2">
          <div v-if="moreNames" class="grid grid-cols-2 gap-2">
            <input v-model="form.prefix" :class="field" placeholder="Prefix (Dr.)" aria-label="Prefix" />
            <input v-model="form.suffix" :class="field" placeholder="Suffix (Jr.)" aria-label="Suffix" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <input
              ref="firstInput"
              v-model="form.givenName"
              :class="field"
              placeholder="First name"
              aria-label="First name"
              autocomplete="off"
              data-testid="given-name"
            />
            <input
              v-model="form.familyName"
              :class="field"
              placeholder="Last name"
              aria-label="Last name"
              autocomplete="off"
              data-testid="family-name"
            />
          </div>
          <div v-if="moreNames" class="grid grid-cols-2 gap-2">
            <input v-model="form.middleName" :class="field" placeholder="Middle name" aria-label="Middle name" />
            <input v-model="form.nickname" :class="field" placeholder="Nickname" aria-label="Nickname" />
          </div>
          <button v-if="!moreNames" type="button" :class="addBtn" @click="moreNames = true">
            <AppIcon name="plus" class="size-3.5" /> Prefix, middle name, nickname
          </button>
          <p v-if="photoError" class="text-xs text-red-600">{{ photoError }}</p>
        </div>
      </div>

      <section class="space-y-2">
        <h3 class="flex items-center gap-x-2 text-xs font-semibold text-gray-500">
          <AppIcon name="building" class="size-4" /> Work
        </h3>
        <div class="grid grid-cols-2 gap-2">
          <input v-model="form.org" :class="field" placeholder="Company" aria-label="Company" />
          <input v-model="form.title" :class="field" placeholder="Job title" aria-label="Job title" />
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="flex items-center gap-x-2 text-xs font-semibold text-gray-500">
          <AppIcon name="phone" class="size-4" /> Phone
        </h3>
        <div v-for="(p, i) in form.phones" :key="`p${i}`" class="flex items-center gap-x-2">
          <ColorSelect :model-value="p.type" @update:model-value="p.type = $event as FieldType" :options="TYPE_OPTIONS" label="Phone type" inline ghost class="w-24 shrink-0" />
          <input
            v-model="p.value"
            type="tel"
            :class="field"
            placeholder="+387 61 123 456"
            aria-label="Phone number"
            data-field="phone"
          />
          <button type="button" :class="removeBtn" title="Remove" @click="form.phones.splice(i, 1)">
            <span class="sr-only">Remove phone</span><AppIcon name="close" class="size-4" />
          </button>
        </div>
        <button type="button" :class="addBtn" @click="addPhone">
          <AppIcon name="plus" class="size-3.5" /> Add phone
        </button>
      </section>

      <section class="space-y-2">
        <h3 class="flex items-center gap-x-2 text-xs font-semibold text-gray-500">
          <AppIcon name="mail" class="size-4" /> Email
        </h3>
        <div v-for="(e, i) in form.emails" :key="`e${i}`" class="flex items-center gap-x-2">
          <ColorSelect :model-value="e.type" @update:model-value="e.type = $event as FieldType" :options="EMAIL_TYPES" label="E-mail type" inline ghost class="w-24 shrink-0" />
          <input
            v-model="e.value"
            type="email"
            :class="field"
            placeholder="name@example.com"
            aria-label="E-mail address"
            data-field="email"
          />
          <button type="button" :class="removeBtn" title="Remove" @click="form.emails.splice(i, 1)">
            <span class="sr-only">Remove e-mail</span><AppIcon name="close" class="size-4" />
          </button>
        </div>
        <button type="button" :class="addBtn" @click="addEmail">
          <AppIcon name="plus" class="size-3.5" /> Add email
        </button>
      </section>

      <section class="space-y-2">
        <h3 class="flex items-center gap-x-2 text-xs font-semibold text-gray-500">
          <AppIcon name="pin" class="size-4" /> Address
        </h3>
        <div v-for="(a, i) in form.addresses" :key="`a${i}`" class="flex items-start gap-x-2">
          <ColorSelect :model-value="a.type" @update:model-value="a.type = $event as FieldType" :options="EMAIL_TYPES" label="Address type" inline ghost class="w-24 shrink-0" />
          <div class="min-w-0 flex-1 space-y-2">
            <input v-model="a.street" :class="field" placeholder="Street" aria-label="Street" data-field="street" />
            <div class="grid grid-cols-[6rem_1fr] gap-2">
              <input v-model="a.postcode" :class="field" placeholder="Postcode" aria-label="Postcode" />
              <input v-model="a.city" :class="field" placeholder="City" aria-label="City" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <input v-model="a.region" :class="field" placeholder="Region" aria-label="Region" />
              <input v-model="a.country" :class="field" placeholder="Country" aria-label="Country" />
            </div>
          </div>
          <button type="button" :class="removeBtn" title="Remove" @click="form.addresses.splice(i, 1)">
            <span class="sr-only">Remove address</span><AppIcon name="close" class="size-4" />
          </button>
        </div>
        <button type="button" :class="addBtn" @click="addAddress">
          <AppIcon name="plus" class="size-3.5" /> Add address
        </button>
      </section>

      <section class="space-y-2">
        <h3 class="flex items-center gap-x-2 text-xs font-semibold text-gray-500">
          <AppIcon name="link" class="size-4" /> Website
        </h3>
        <div v-for="(_, i) in form.urls" :key="`u${i}`" class="flex items-center gap-x-2">
          <input
            v-model="form.urls[i]"
            type="url"
            :class="field"
            placeholder="https://"
            aria-label="Website"
            data-field="url"
          />
          <button type="button" :class="removeBtn" title="Remove" @click="form.urls.splice(i, 1)">
            <span class="sr-only">Remove website</span><AppIcon name="close" class="size-4" />
          </button>
        </div>
        <button type="button" :class="addBtn" @click="addUrl">
          <AppIcon name="plus" class="size-3.5" /> Add website
        </button>
      </section>

      <section class="space-y-2">
        <h3 class="flex items-center gap-x-2 text-xs font-semibold text-gray-500">
          <AppIcon name="cake" class="size-4" /> Birthday
        </h3>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <input v-model="bdayDate" type="date" :class="field.replace('w-full', 'w-44')" aria-label="Birthday" data-testid="birthday-input" />
          <label class="flex items-center gap-x-1.5 text-xs text-gray-600">
            <input v-model="bdayNoYear" type="checkbox" class="accent-gray-900" /> Year unknown
          </label>
          <button v-if="bdayDate" type="button" class="text-xs font-medium text-gray-500 hover:text-gray-900" @click="bdayDate = ''">
            Clear
          </button>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="flex items-center gap-x-2 text-xs font-semibold text-gray-500">
          <AppIcon name="tag" class="size-4" /> Labels
        </h3>
        <input v-model="labelsText" :class="field" placeholder="Family, Work, Football…" aria-label="Labels, separated by commas" />
        <div v-if="labelSuggestions.length" class="flex flex-wrap gap-1">
          <button
            v-for="c in labelSuggestions"
            :key="c"
            type="button"
            class="h-6 rounded-full bg-gray-100 px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900"
            @click="addLabel(c)"
          >
            + {{ c }}
          </button>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="flex items-center gap-x-2 text-xs font-semibold text-gray-500">
          <AppIcon name="lines" class="size-4" /> Notes
        </h3>
        <textarea
          v-model="form.note"
          rows="3"
          :class="[field, 'h-auto resize-y py-2']"
          placeholder="Anything worth remembering"
          aria-label="Notes"
        ></textarea>
      </section>

      <section v-if="isNew && books.length > 1" class="space-y-2">
        <h3 class="text-xs font-semibold text-gray-500">Address book</h3>
        <ColorSelect :model-value="book" @update:model-value="book = String($event)" :options="bookOptions" label="Address book" inline />
      </section>

      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </div>
  </form>
</template>
