# DaisyCal

Web UI for a self-hosted [Radicale](https://radicale.org) CalDAV server. Shows calendars (`VEVENT`)
and task lists (`VTODO`) and lets you create, edit and delete events and tasks. Other collection
types (address books, journals, mixed calendar+tasks) are ignored. See `CHECKLIST.md` for the
implementation plan and `design/` for the original static mockups.

Stack: Vue 3, Vite, TypeScript, Pinia, Vue Router, Tailwind CSS v4, [tsdav](https://github.com/natelindev/tsdav),
[ical.js](https://github.com/kewisch/ical.js).

## Development

Requirements: Node 22+, Docker with Compose.

```bash
npm install --legacy-peer-deps   # see note below
npm run radicale:up              # local Radicale at http://localhost:5232
npm run seed                     # test collections + sample events/tasks
npm run dev                      # http://localhost:5173
```

Log in with `daisy` / `daisy`.

The browser never talks to Radicale directly. Vite proxies `/dav/*` to the local Radicale
(`vite.config.ts`), strips the prefix and sets `X-Script-Name: /dav` so the hrefs Radicale
returns stay under `/dav`. The prefix is configurable through `VITE_DAV_BASE` in `.env`;
`DAV_PROXY_TARGET` points the dev proxy somewhere else.

Local Radicale lives in `docker-compose.dev.yml`:

- `docker/radicale/config` – server config (htpasswd auth with bcrypt, filesystem storage)
- `docker/radicale/users` – htpasswd file, generate a new hash with
  `docker run --rm --entrypoint /app/bin/python ghcr.io/kozea/radicale:stable -c "import bcrypt; print(bcrypt.hashpw(b'PASSWORD', bcrypt.gensalt()).decode())"`
- data is kept in the `radicale-data` named volume; `npm run radicale:reset` wipes it

`npm run seed` is idempotent: it deletes and recreates the seed collections. The seed includes
recurring events with `EXDATE` and `RECURRENCE-ID`, all-day and multi-day events, a `VTIMEZONE`
and `X-APPLE-*` properties as written by Apple Calendar/Reminders, plus one mixed collection and
one address book that the app must ignore.

### Scripts

| Command               | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `npm run dev`         | Vite dev server with the `/dav` proxy          |
| `npm run build`       | Type-check and build to `dist/`                |
| `npm run preview`     | Serve `dist/` locally                          |
| `npm run test:unit`   | Vitest, single run (`test:watch` for watch)    |
| `npm run lint`        | oxlint + ESLint with autofix                   |
| `npm run format`      | Prettier over `src/`                           |
| `npm run radicale:*`  | `up`, `down`, `reset` the local Radicale       |
| `npm run seed`        | Seed the local Radicale                        |

Note on `--legacy-peer-deps`: npm 10.9 fails with `Cannot read properties of null (reading 'edgesOut')`
while resolving the ESLint 10 peer set. The flag works around it; nothing in the tree actually
conflicts.

## Production

Target: `https://daisycal.home`, talking to Radicale at `https://calendar.home`. The app is served
by nginx from a Docker image which also reverse-proxies `/dav/` to Radicale on the same origin
(Radicale sends no CORS headers). See `CHECKLIST.md` §2; the Dockerfile and nginx config are
added there.
