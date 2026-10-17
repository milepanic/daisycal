# DaisyCal

Web UI for a self-hosted [Radicale](https://radicale.org) CalDAV server. Shows calendars (`VEVENT`)
and task lists (`VTODO`) and lets you create, edit and delete events and tasks. Other collection
types (address books, journals, mixed calendar+tasks) are ignored. See `CHECKLIST.md` for the
implementation plan; the original static mockups live in the git history (`design/` up to the
"Add Tasks page" commit).

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

| Command              | What it does                                |
| -------------------- | ------------------------------------------- |
| `npm run dev`        | Vite dev server with the `/dav` proxy       |
| `npm run build`      | Type-check and build to `dist/`             |
| `npm run preview`    | Serve `dist/` locally                       |
| `npm run test:unit`  | Vitest, single run (`test:watch` for watch) |
| `npm run lint`       | oxlint + ESLint with autofix                |
| `npm run format`     | Prettier over `src/`                        |
| `npm run radicale:*` | `up`, `down`, `reset` the local Radicale    |
| `npm run seed`       | Seed the local Radicale                     |

Note on `--legacy-peer-deps`: npm 10.9 fails with `Cannot read properties of null (reading 'edgesOut')`
while resolving the ESLint 10 peer set. The flag works around it; nothing in the tree actually
conflicts.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: install, start the local Radicale
with Docker Compose and seed it, lint, type-check, unit + integration tests, build. On pushes to
`master` it also builds the production image and pushes it to `ghcr.io/<owner>/daisycal`
(`:latest` and `:<sha>`), so the server can `docker compose pull` instead of building.

## Production

Target: `https://daisycal.home`, talking to Radicale at `https://calendar.home`.

```bash
# optional: TLS for daisycal.home itself
cp /path/to/fullchain.pem /path/to/privkey.pem certs/
docker compose up -d --build
```

The image (`Dockerfile`) builds the SPA and serves it with nginx, which also reverse-proxies
`/dav/` to Radicale on the same origin (Radicale sends no CORS headers). nginx strips the prefix
and sets `X-Script-Name: /dav`, the same trick the dev proxy uses.

| Variable              | Default                 | Meaning                                                                   |
| --------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `RADICALE_UPSTREAM`   | `https://calendar.home` | Radicale URL. Resolved per request, so nginx starts even if DNS is down.  |
| `RADICALE_SSL_VERIFY` | `off`                   | `on` to verify the Radicale certificate.                                  |
| `RADICALE_CA_FILE`    | system CA bundle        | CA used for verification; mount your own at `/etc/nginx/radicale-ca.pem`. |
| `NGINX_RESOLVER`      | `127.0.0.11`            | DNS resolver for the upstream lookup (Docker DNS forwards to the host).   |
| `DAV_BASE`            | `/dav`                  | Must match `VITE_DAV_BASE` at build time.                                 |

Set them in the environment or in a `.env` file next to `docker-compose.yml`.

TLS for `daisycal.home`: put `fullchain.pem` and `privkey.pem` in `certs/`. When both are present
the container serves HTTPS on 443 and redirects HTTP; otherwise it serves plain HTTP on 80
(`docker/nginx/entrypoint.d/30-tls.sh`). Hashed assets under `/assets/` are cached for a year,
`index.html` and SPA routes are `no-cache`. `/healthz` is the health check endpoint.

nginx config lives in `docker/nginx/templates/` and is rendered with `envsubst` at container start.
