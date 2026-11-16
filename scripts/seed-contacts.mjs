#!/usr/bin/env node
// Adds the test contacts (scripts/contacts.mjs) to the local development Radicale without
// touching anything else: the "contacts" address book is created when missing (or renamed to
// "Contacts"), the seed
// contacts are written (overwriting earlier copies of the same seed files), and no other
// contact, calendar or task is changed or deleted.
//
//   RADICALE_URL=http://localhost:5232 RADICALE_USER=daisy RADICALE_PASSWORD=daisy node scripts/seed-contacts.mjs

import { buildContacts } from './contacts.mjs'

const BASE = (process.env.RADICALE_URL ?? 'http://localhost:5232').replace(/\/$/, '')
const USER = process.env.RADICALE_USER ?? 'daisy'
const PASSWORD = process.env.RADICALE_PASSWORD ?? 'daisy'
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64')
const BOOK = `/${USER}/contacts/`

const now = new Date()
const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
const at = (days) => new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + days)

async function dav(method, path, init = {}) {
  return fetch(`${BASE}${path}`, { method, ...init, headers: { Authorization: AUTH, ...init.headers } })
}

async function main() {
  const probe = await dav('PROPFIND', BOOK, { headers: { Depth: '0' } })
  if (probe.status === 401) throw new Error(`Login failed for '${USER}' at ${BASE}`)
  if (probe.status === 404) {
    const res = await dav('MKCOL', BOOK, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<D:mkcol xmlns:D="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <D:set><D:prop>
    <D:resourcetype><D:collection/><CR:addressbook/></D:resourcetype>
    <D:displayname>Contacts</D:displayname>
  </D:prop></D:set>
</D:mkcol>`,
    })
    if (!res.ok) throw new Error(`MKCOL ${BOOK} → ${res.status}`)
    console.log(`✓ created address book ${BOOK}`)
  } else if (probe.status !== 207) throw new Error(`Unexpected ${probe.status} from ${BASE}${BOOK}`)
  else {
    // Older seeds named the book "Contacts (unsupported)", from before the Contacts page.
    await dav('PROPPATCH', BOOK, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<D:propertyupdate xmlns:D="DAV:"><D:set><D:prop><D:displayname>Contacts</D:displayname></D:prop></D:set></D:propertyupdate>`,
    })
  }

  const contacts = buildContacts(at)
  for (const { uid, vcf } of contacts) {
    const res = await dav('PUT', `${BOOK}${uid}.vcf`, {
      headers: { 'Content-Type': 'text/vcard; charset=utf-8' },
      body: vcf,
    })
    if (!res.ok) throw new Error(`PUT ${uid}.vcf → ${res.status} ${await res.text()}`)
  }
  console.log(`✓ wrote ${contacts.length} contacts to ${BASE}${BOOK}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
