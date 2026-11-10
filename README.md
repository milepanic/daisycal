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

There is no login screen: the Vite proxy authenticates to the local Radicale as `daisy` / `daisy`
(`DAV_PROXY_USER` / `DAV_PROXY_PASSWORD` in `.env`).

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

## Homelab (Portainer)

The homelab already runs Radicale 3.8 on the Docker host `192.168.1.9` (Portainer stack
`calendar`, container `radicale`, network `proxy`, account `mile`). `https://calendar.home` is
Caddy on `192.168.1.23` in front of it. DaisyCal joins the same Docker network and talks to
Radicale directly over HTTP, so no certificate or DNS dependency is involved on that side.

`docker-compose.portainer.yml` is the stack for this setup: it pulls `ghcr.io/milepanic/daisycal:latest`
(built by CI on every push to `master`), publishes HTTP on port `3035` and leaves TLS to Caddy.

1. **Portainer** → Stacks → Add stack → _Repository_: URL `https://github.com/milepanic/daisycal`,
   reference `refs/heads/master`, compose path `docker-compose.portainer.yml`. Environment
   variables: `RADICALE_USER=mile`, `RADICALE_PASSWORD=<its password>`. Deploy. Check
   `http://192.168.1.9:3035/healthz` returns `ok` and `http://192.168.1.9:3035/` shows the
   calendars. (Optional: enable GitOps updates so a push to `master` redeploys the stack.)
2. **DNS** (Technitium, `http://dns.home:5380`): add an A record `daisycal.home → 192.168.1.23`,
   same as the other `.home` names.
3. **Caddy** on `192.168.1.23` (`/opt/caddy/Caddyfile`): add a site block in the same style as the
   existing ones, then reload Caddy:

   ```caddyfile
   daisycal.home {
       reverse_proxy 192.168.1.9:3035
   }
   ```

4. Open `https://daisycal.home`. Updating later: Portainer → stack → _Pull and redeploy_ (or
   `docker compose pull && docker compose up -d` on the host).

The app is single-user and unauthenticated towards the browser; it is meant for the home network
(and Tailscale) only. Do not expose port 3035 or `daisycal.home` to the internet without putting
authentication in front of it.

## Production (generic)

Stand-alone variant: the container itself serves HTTPS and reaches Radicale over the network at
`https://calendar.home`. On the homelab use the Portainer stack above instead.

```bash
printf 'RADICALE_USER=you\nRADICALE_PASSWORD=secret\n' > .env   # the Radicale account to use
# optional: TLS for daisycal.home itself
cp /path/to/fullchain.pem /path/to/privkey.pem certs/
docker compose up -d --build
```

DaisyCal is single-user and has no login screen: nginx adds the Basic-auth header for the
account above to every `/dav/` request, so anyone who can reach `https://daisycal.home` sees
that account's calendars. Keep it on the home network (or put your own auth in front of it).

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
