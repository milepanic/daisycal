# DaisyCal – checklist implementacije

Web UI za postojeći Radicale CalDAV server (`https://calendar.home`).
Aplikacija se hostuje na `https://daisycal.home`. Radicale se paralelno koristi sa iPhone-a
(Calendar + Reminders), pa je kompatibilnost sa Apple klijentima obavezna.

Stack: Vue 3 + Vite + TypeScript + Pinia + Vue Router + Tailwind v4 + tsdav + ical.js.

Legenda: `[ ]` nije urađeno · `[x]` urađeno · `(opciono)` nije potrebno za prvu verziju

## 0. Obim: samo Radicale tipovi „Calendar" i „Tasks"

Podržavaju se isključivo dva tipa Radicale kolekcija, onako kako ih Radicale web UI kreira:

| Radicale tip | `supported-calendar-component-set` | U DaisyCal-u |
|---|---|---|
| Calendar | `VEVENT` | kalendar u sidebaru, događaji u prikazima |
| Tasks | `VTODO` | task lista u sidebaru, zadaci na Tasks stranici |

Sve ostalo se ignoriše i ne prikazuje: adresari (`VCARD`), dnevnici (`VJOURNAL`),
mešovite kolekcije „Calendar and Tasks" (`VEVENT` + `VTODO`), kao i kolekcije bez
deklarisanog component set-a. Nema kreiranja, izmene ni brisanja kolekcija iz UI-a,
samo objekata (događaja i zadataka) unutar postojećih kolekcija.

---

## 1. Razvojno okruženje

- [x] Vite + Vue 3 + TypeScript scaffold (`src/`, strict TS, path alias `@/`)
- [x] Tailwind v4 kao Vite plugin (`@tailwindcss/vite`) umesto CDN skripte
- [x] Prebaciti `@theme` i `style.css` u `src/assets/main.css`; Space Grotesk font
- [x] ESLint + Prettier (Vue + TS konfiguracija)
- [x] `docker-compose.dev.yml`: `ghcr.io/kozea/radicale:stable` za lokalni razvoj
  - [x] `config` fajl sa `htpasswd` auth (bcrypt) i `storage.filesystem_folder`
  - [x] seed skripta koja pravi test korisnika i nekoliko kalendara/task lista sa VEVENT i VTODO primerima
    (uključujući ponavljajuće događaje, celodnevne, sa VTIMEZONE kako ih Apple upisuje)
- [x] Vite dev proxy: `/dav/*` → lokalni Radicale (isti origin, bez CORS-a)
- [x] `.env` konfiguracija: `VITE_DAV_BASE` (default `/dav`)
- [x] `README.md`: pokretanje dev okruženja, build, deploy

## 2. Produkcija i deploy (daisycal.home)

- [x] `Dockerfile` (multi-stage): `node` build → `nginx` koji servira `dist/`
- [x] nginx konfiguracija:
  - [x] SPA fallback (`try_files ... /index.html`)
  - [x] reverse proxy `/dav/` → `https://calendar.home` (rešava CORS, Radicale ne šalje CORS zaglavlja)
  - [x] prosleđivanje `Authorization`, `If-Match`, `If-None-Match`, `Depth` zaglavlja i WebDAV metoda (PROPFIND, REPORT)
  - [x] TLS ka upstream-u: `proxy_ssl_verify` / mount CA sertifikata za `.home` domen
- [x] `docker-compose.yml` za produkciju (image, port, env `RADICALE_UPSTREAM`)
- [x] Upstream URL kroz env promenljivu, a ne hardkodiran u nginx konfiguraciji (envsubst na startu)
- [x] Cache zaglavlja za statiku, bez keša za `index.html`

## 3. CalDAV sloj (`src/api/caldav.ts`, tsdav)

- [x] Login: Basic auth, provera kredencijala PROPFIND-om na root
- [x] Discovery: `current-user-principal` → `calendar-home-set` → lista kolekcija
- [x] Metapodaci kolekcije: `displayname`, `calendar-color`, `supported-calendar-component-set` (VEVENT / VTODO), `getctag`
- [x] Filtriranje kolekcija po obimu iz sekcije 0: `VEVENT` → kalendar, `VTODO` → task lista, sve ostalo odbaciti
- [x] Unit test filtera: adresar, VJOURNAL i mešovita „Calendar and Tasks" kolekcija ne smeju da prođu
- [x] `calendar-query` REPORT sa `time-range` filterom za prikazani opseg datuma
  - [x] uključiti `expand`? NE – Radicale ne ekspanduje pouzdano, ekspanzija se radi na klijentu
- [x] `calendar-query` za VTODO (sve, uključujući završene, sa filterom po statusu u UI-u)
- [x] `calendar-multiget` po href-ovima (osvežavanje pojedinačnih objekata)
- [x] Kreiranje: `PUT` sa `If-None-Match: *` na `<kolekcija>/<uid>.ics`
- [x] Izmena: `PUT` sa `If-Match: <etag>`
- [x] Brisanje: `DELETE` sa `If-Match: <etag>`
- [x] Obrada `412 Precondition Failed` (konflikt sa iPhone izmenom) → poseban tip greške za UI
- [x] Obrada `401` → odjava i povratak na login
- [x] Osvežavanje po `getctag` promeni (polling na fokus prozora / interval) – `createCtagWatcher`
  - [ ] `sync-collection` REPORT umesto pollinga (opciono)
- [x] Jedinstveni `UID` generator (UUID v4) i `DTSTAMP` / `LAST-MODIFIED` ažuriranje pri svakom upisu

## 4. iCalendar sloj (`src/api/ical.ts`, ical.js)

- [x] Parsiranje `.ics` → domenski objekti `CalendarEvent` i `Task` (zadržati referencu na originalnu `ICAL.Component`)
- [x] **Očuvanje nepoznatih propertija** (X-APPLE-*, VALARM, ATTACH…) pri izmeni: menjati samo polja iz forme nad originalnim stablom, ne praviti VEVENT ispočetka
- [x] Vremenske zone: registrovati `VTIMEZONE` komponente iz svakog `.ics` u `ICAL.TimezoneService`; fallback na IANA zonu browsera
- [x] Celodnevni događaji (`DTSTART;VALUE=DATE`) i višednevni celodnevni (`DTEND` ekskluzivan)
- [x] Događaji bez `DTEND` (koristiti `DURATION` ili default trajanje)
- [x] Ekspanzija ponavljanja za zadati opseg (`RecurExpansion`): `RRULE`, `RDATE`, `EXDATE`
- [x] `RECURRENCE-ID` izuzeci (izmenjene pojedinačne instance) – spajanje sa master događajem
- [x] Serijalizacija nazad u `.ics` (`VCALENDAR` + `PRODID` DaisyCal)
- [x] VTODO mapiranje: `SUMMARY`, `STATUS`, `COMPLETED`, `PERCENT-COMPLETE`, `DUE`, `PRIORITY`, `DESCRIPTION`
- [x] Jednostavna podrška za `VALARM` (polje „Notification" iz forme → `TRIGGER` relativan na početak)
- [x] Kreiranje `RRULE` iz polja „Repeat" (daily / weekly / monthly / yearly, bez kraja ili do datuma)
- [x] Unit testovi (Vitest) za sve mapere, posebno nad primerima koje je upisao Apple Calendar / Reminders

## 5. State (Pinia)

- [x] `auth` store: kredencijali u `sessionStorage` (ili `localStorage` uz „zapamti me"), logout
- [x] `calendars` store: lista kolekcija, boje, vidljivost po kolekciji (persistovano u `localStorage`)
- [x] `events` store: keš po opsegu datuma, ekspandirane instance, status učitavanja po opsegu
- [x] `tasks` store: VTODO po listi, filter završenih
- [x] `ui` store: trenutni datum, aktivni prikaz, otvoren sidebar, otvoren tasks panel, otvoren create popup, izabran događaj
- [x] Optimistic update za kreiranje/izmenu/brisanje sa rollback-om pri grešci
- [x] Invalidacija keša nakon upisa i nakon promene `getctag`

## 6. App shell i navigacija

- [x] Vue Router rute: `/week/:date`, `/day/:date`, `/work-week/:date`, `/month/:date`, `/agenda/:date`, `/tasks`, `/login`
- [x] Route guard: bez kredencijala → `/login`
- [x] Login stranica (korisničko ime, lozinka, „zapamti me")
- [x] Layout: sidebar + glavna kolona (iz mockup-a), toggle sidebara (zameniti CSS `:has()` trik stanjem)
- [x] Top nav tabovi Calendar / Tasks
- [x] Toolbar: naslov opsega, Today, prethodno/sledeće, izbor prikaza, dugme Create, toggle tasks panela
- [x] Sidebar: Mini kalendar (navigacija po mesecima, klik na dan, oznaka današnjeg dana i izabranog)
- [x] Sidebar: lista kalendara sa checkbox-ovima i bojama sa servera (zamena hardkodiranih `--color-cal-*`)
- [x] Sidebar: lista task listi sa checkbox-ovima
- [x] Tastaturne prečice (`t` today, `←`/`→`, `d`/`w`/`m`/`a` prikazi, `c` create, `Esc` zatvori)
- [ ] Podešavanja: prvi dan nedelje, radni dani/sati za work-week, format vremena (opciono)

## 7. Prikazi kalendara (port mockup-a u komponente)

- [x] Zajednička `TimeGrid` komponenta (sati, linije, kolone dana, skrol na 07:00 kao u mockup-u)
- [x] Red celodnevnih događaja (sticky), višednevni celodnevni koji se protežu preko kolona
- [x] Pozicioniranje događaja po vremenu (top/height iz DTSTART/DTEND)
- [x] Layout preklapajućih događaja (kolone / širina kao Google Calendar)
- [x] Indikator trenutnog vremena (crvena linija) i isticanje današnjeg dana
- [x] `EventChip` komponenta (boja kalendara, naslov, vreme, truncation)
- [x] Week prikaz (`index.html`)
- [x] Day prikaz (`day.html`)
- [x] Work-week prikaz (`work-week.html`, Pon–Pet)
- [x] Month prikaz (`month.html`): mreža 6×7, „+N more" overflow, višednevni događaji preko ćelija
- [x] Agenda prikaz (`agenda.html`): grupisanje po danu za izabrani opseg, prazni dani
- [x] Tasks panel u kalendar prikazu (`#tasks-panel` iz mockup-a) sa zadacima sa rokom
- [x] Prikaz zadataka sa `DUE` u kalendarskoj mreži (kao u `#draft-task` mockup-u)
- [x] Klik na prazan slot otvara create popup sa prepopunjenim vremenom
- [x] Klik na događaj otvara detalje (popover) sa Edit / Delete
- [x] Loading skeleton i prazna stanja za svaki prikaz

## 8. Kreiranje i izmena događaja (`new-event.html`)

- [x] Create popup kao komponenta (otvaranje sa Create dugmeta i klikom na slot; zatvaranje X / Cancel / klik van / Esc)
- [x] Prekidač tipa Event / Task u popup-u (radio iz mockup-a)
- [x] Forma događaja: Title, Calendar, datum/vreme početka i kraja, All day, Repeat, Notification, Location, Description
- [x] Draft preview u mreži dok se popunjava forma (`#draft-event` / `#draft-task` iz mockup-a)
- [x] Validacija (kraj posle početka, obavezan naslov i kalendar)
- [x] Izmena postojećeg događaja (ista forma, popunjena iz objekta)
- [x] Brisanje sa potvrdom
- [x] Ponavljajući događaji: izbor obima izmene/brisanja – samo ova instanca (RECURRENCE-ID / EXDATE) ili ceo niz
- [x] Premeštanje događaja u drugi kalendar (PUT u novu kolekciju + DELETE iz stare)
- [x] Dijalog za `412` konflikt: „izmenjeno sa drugog uređaja" → osveži i ponovo primeni
- [ ] Drag-and-drop premeštanje i resize u mreži (opciono)

## 9. Tasks (`tasks.html`)

- [x] Tasks stranica: kolone/sekcije po task listi, samo vidljive liste
- [x] Kreiranje zadatka inline (naslov + list) i kroz create popup (Title, Task list, Due, Notification, Description)
- [x] Označavanje završeno / nezavršeno (`STATUS:COMPLETED` + `COMPLETED` + `PERCENT-COMPLETE:100`, i obrnuto)
- [x] Sekcija „Completed (N)" sklopiva, sa datumom završetka
- [x] Prikaz roka i isticanje zakasnelih
- [x] Izmena i brisanje zadatka
- [x] Prioritet (`PRIORITY` 1/5/9 → high/medium/low)
- [x] Sortiranje: po roku, pa po prioritetu, pa po naslovu
- [ ] Podzadaci preko `RELATED-TO` kako ih Reminders upisuje (opciono)

## 10. Kvalitet i isporuka

- [ ] Vitest unit testovi: ical maperi, ekspanzija ponavljanja, layout preklapanja, store logika
- [ ] Integracioni test protiv dev Radicale-a u Dockeru (login, lista kolekcija, create/update/delete sa ETag)
- [ ] Ručni test kompatibilnosti: događaj kreiran u DaisyCal → vidljiv na iPhone-u; izmenjen na iPhone-u → ispravno prikazan i izmena ne gubi Apple polja
- [ ] Obrada grešaka: toast za neuspele upise, banner za nedostupan server, retry
- [ ] Responzivnost: tablet i telefon (sidebar kao drawer, day/agenda kao podrazumevani prikaz na uskom ekranu)
- [ ] Pristupačnost: fokus u popup-u, `aria-label` na ikonicama, tastaturna navigacija po mreži
- [ ] GitHub Actions: lint + test + build + Docker image
- [x] Premeštanje statičkih mockup `.html` fajlova u `design/` (urađeno uz scaffold, jer Vite koristi `index.html` kao ulaz)
- [ ] Uklanjanje `design/` nakon što su svi prikazi portovani
