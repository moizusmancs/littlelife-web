# CLAUDE.md — LittleLife Web: how to work in this repo

**Read this whole file at the start of every session.** It is the standing instruction set for building the LittleLife
web frontend. It records how the project owner (Moiz) has worked with Claude across Phases 0–4, so that any session on
any laptop behaves the same way: same workflow, same testing habits, same honesty about what is and isn't done, same
respect for the backend. Where this file and your own instincts differ, follow this file. Where this file and an
explicit request from the developer at the keyboard differ, the request wins **for that one action** — say so when it
happens, and don't let it become a new default.

"The user" below means whoever is at the keyboard. "The backend owner" is Moiz (GitHub `moizusmancs`), who maintains the
Go backend. If the user is not the backend owner, backend changes still flow through contract documents (§9.5).

Contents: 1 Project · 2 Hard rules · 3 First ten minutes · 4 Sources of truth · 5 Per-screen workflow · 6 Architecture ·
7 UI conventions · 8 Testing · 9 The backend · 10 Docs · 11 Communication · 12 Lessons learned · 13 Commands ·
Appendix A state · B Phase 5 research · C human setup · D open decisions.

---

## 1. The project in one page

**LittleLife** is a flood-response and community-safety platform (seed data is Sindh, Pakistan). This repo is the React
web app for three audiences behind one login: **citizens** (`/app/*`), **NGO staff** (`/ngo/*`, roles `ngo_admin` and
`ngo_volunteer`) and **platform admins** (`/admin/*`, roles `admin` and `super_admin`). Citizens must never be able to
reach NGO/admin screens; unverified accounts have restricted use. The real API is a Go backend (`littlelifego`) with
Postgres 17 + PostGIS and Redis 7, run locally in Docker. The build is planned phase by phase in
[FRONTEND_IMPLEMENTATION_PLAN.md](FRONTEND_IMPLEMENTATION_PLAN.md), which is also the **honest as-built record**.

### Two sibling repositories

| Repo | Path (relative to this repo) | Rule |
|---|---|---|
| Frontend (this) | `.` — git remote `github.com/moizusmancs/littlelife-web`, branch `main` | You build here. |
| Backend | `../littlelifego` | **Read-only for you** (§2). If it is not at that path, ask the user once where it is. |

### Stack (all installed; prefer these over adding anything)

| Concern | Choice |
|---|---|
| App | React 19, TypeScript ~6.0 (`tsconfig.app.json`: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`), Vite 8 |
| Styling | Tailwind CSS **v4**, CSS-first tokens in `src/index.css` (`@theme`) — no `tailwind.config` |
| Components | Hand-built primitives in `src/components/ui/` on Radix + `class-variance-authority`. **Not** shadcn's CLI output. |
| Icons | `@phosphor-icons/react` — import by the **`*Icon`-suffixed** name (`BuildingsIcon`, never `Buildings`). Not lucide. |
| Routing | React Router v7 (`src/routes/router.tsx`, guards in `src/routes/guards.tsx`) |
| Server state | TanStack Query v5 (`staleTime` 30 s, `retry` 1; cache is cleared whenever the signed-in account changes) |
| Client state | Zustand (`src/store/auth.ts`: in-memory access token + user — **never** persisted to storage) |
| Forms | React Hook Form + Zod v4 (`useWatch`, not `watch`) |
| HTTP | Axios (`src/api/client.ts`): `withCredentials`, bearer interceptor, 401 → one deduped `/auth/refresh` → retry |
| Maps | Leaflet + react-leaflet (shared `MapCanvas`) — not Mapbox |
| Charts / i18n | Recharts; `i18next` scaffold exists but **no screen uses `useTranslation` yet** (Phase 9) |
| Unit tests | Vitest 5 + React Testing Library + jsdom + MSW v2 (`src/test/setup.ts`) |
| E2E | Playwright (chromium) against the **real** Go backend and Postgres |

### Directory map

```
src/api/            one service file per backend domain (identity, geo, floodIntel, facilities, profiling, trust, community, relief…)
                    + client.ts (axios), errors.ts (extractErrorMessage), types.ts. Components never call axios directly.
src/features/<x>/   one folder per feature: <x>Model.ts (pure functions, tested), use<X>.ts (query/mutation hooks),
                    dumb components (*.tsx), fixtures/test kits, and *.test.ts(x) beside each file
src/pages/<role>/   container pages (citizen | ngo | admin | profile | auth | onboarding | account) — hold state, call hooks
src/layouts/        CitizenLayout (top nav), OpsLayout (NGO/Admin sidebar, drawer below md), ProfileLayout, AuthLayout
src/components/ui/  design-system primitives (Button, Input, Dialog, Drawer, Badge, Select, Switch, TabBar, Notice, …)
src/lib/            queryClient, reconnectingSocket, useDebouncedValue, useMediaQuery, returnFocus helpers, …
src/mocks/          MSW handlers — only for backend domains that don't exist yet (alerting, navigation, communication, …)
src/store/auth.ts   auth store + nextAuthRoute()/roleLandingRoute()
e2e/                Playwright specs (real backend), e2e/helpers/{citizen,seed}.ts, e2e/cleanup-test-data.sql
supporting-material/
  api/              consumption docs copied from the backend's docs/api (see §9.1 — keep in sync)
  backend-requests/ contract docs we wrote for routes the backend didn't have yet (§9.5)
  UI mockups needed/  HTML mockups (Batch 1, 3 Citizen, 4 NGO, 5 Admin, Index, Ops Sidebar) + uploads/WEB_DESIGN_PLAN.md + mobile_plan-*.md (design tokens)
  map-preview/      the validated Leaflet flood-visualisation reference
  IMPLEMENTATION_ROADMAP.md  the backend's build log (copy)
FRONTEND_IMPLEMENTATION_PLAN.md  the living plan + as-built record (≈340 KB — never read it whole; see §4)
```

### Runtime map (macOS/Linux shell assumed)

| Thing | Where | Who runs it |
|---|---|---|
| Vite dev server | `http://localhost:5173` | **The user**, in their own terminal (§2, rule 4) |
| Go API | `http://localhost:8080/api/v1` (uploads at `/uploads/...`) | **The user** (typically `go run ./cmd/api` from the backend repo, which reads its `.env`) |
| Postgres (PostGIS 17) | container `littlelife_postgres`, port 5432, user `littlelife`, db `littlelife` (dev password is in the backend's `docker-compose.yml`) | Docker Compose, started by the user |
| Redis 7 | container `littlelife_redis`, port 6379 | same |

Frontend env: `.env.local` (gitignored; copy `.env.example`) → `VITE_API_BASE_URL=http://localhost:8080/api/v1`. No dev
proxy — the backend allows CORS from `http://localhost:5173` directly. `VITE_ENABLE_MOCKS=true` turns on the MSW browser
worker for not-yet-built domains (Phase 7); you can't toggle it without the user restarting Vite. E2E env overrides:
`E2E_API` (API base) and `E2E_PG_CONTAINER` (Postgres container name).

Seed accounts (`*@littlelife.test`, all roles, one shared dev password) and what is seeded are listed in the backend's
`SEED_ACCOUNTS.md` — read it rather than copying credentials into anything. The user often uses those accounts by hand,
so **never mutate them from tests or probes**; tests make their own `e2e-…@example.com` accounts.

---

## 2. Hard rules (non-negotiable — each one was given by the owner, the reason is attached)

1. **The backend repo is read-only for you.** Read anything in it, freely, without asking: source, migrations, docs,
   routes, seeds. Never edit, create or delete any file there. Never run migrations, never `CREATE/ALTER/DROP` any
   schema object (tables, columns, indexes, enums), never restart or modify the Go process.
   *Why:* the owner's "hard note" — but they later clarified it means "don't write backend code", **not** "don't look".
   Reading the real code caught real behaviour the docs missed, so verify claims against code and data instead of guessing.
2. **Postgres: read anything; write only seed/test rows into tables that already exist.** `INSERT`/`UPDATE`/`DELETE` of
   test-scoped rows is fine (accounts whose email starts `e2e-`, rows named `E2E …`). Never touch rows that belong to the
   user's real accounts. Every seed helper guards this in code (§8.6).
3. **Redis is read-only** unless the user says otherwise.
4. **Never stop, kill or restart the Vite dev server on :5173, and never start a second one.** Confirm it is alive with a
   `curl` before Playwright runs. If it is down, tell the user; don't spawn and later kill one. Same for the Go API and
   the Docker containers: they belong to the user. (The user was explicit: "keep it alive at 5173, I run this time, don't
   off next time.") `playwright.config.ts` has `reuseExistingServer`, so Playwright reuses a running Vite — but if none is
   up it **starts its own and stops it afterwards**, which is exactly what must not happen. That is why you `curl` first.
5. **Build only what the real backend supports.** When a mockup shows something with no route behind it, do not invent it
   (no fake counts, names, severities, notes, bulk actions). Build the honest version, match the design system's look for
   what is real, and record the gap in the plan (§10). If a route is missing, write a contract document (§9.5) and wait.
6. **Report honestly.** If tests fail, say so with the output. If you skipped something, say so. Only claim what a check
   actually proves (§8.5). State done-and-verified plainly, without hedging. Correct wrong claims in the plan when you find them.
7. **Decisions that are the user's stay the user's.** Product questions you can't resolve from code, docs or sensible
   defaults are raised, not decided silently (see Appendix D for the ones still open). Pick a recommendation and give it;
   don't survey options you won't pursue.
8. **No git commit / push / branch changes unless asked.** Work stays in the working tree. When asked to commit, end the
   message with the attribution line the harness gives you. The owner's messages are terse: `phase4: /app/profile/credibility`.
9. **No secrets in files.** `.env`, `.env.local`, tokens and passwords stay out of any file you write, including this one,
   the plan and contract docs. Refer to where a credential lives instead.
10. **Confirm before anything hard to reverse or outward-facing** (deleting data you didn't create, publishing, pushing,
    touching shared infrastructure). Look at what you're about to delete or overwrite first.
11. **Use the editor tools for edits to tracked files** (Edit/Write). A `sed -i` on a tracked file once silently reverted
    itself in this harness.

---

## 3. First ten minutes of every session

Do these before touching code. Report anything abnormal in one short paragraph.

1. `git status` and `git log --oneline -8` — what state is the tree in, and what phase was last committed?
2. Read the top of [FRONTEND_IMPLEMENTATION_PLAN.md](FRONTEND_IMPLEMENTATION_PLAN.md) — *Progress so far* (lines ~1–75) —
   then the section of the phase you're working on (find it with `grep -n '^## \|^### ' FRONTEND_IMPLEMENTATION_PLAN.md`,
   read with `offset`/`limit`; lines are very long). Appendix A below is a snapshot and goes stale; the plan is the truth.
3. Is the stack up? `docker ps` (both containers healthy), `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/`
   and `…:8080/api/v1/regions`. If Vite or the API is down, **tell the user** and stop that line of work (rule 4).
4. Migration state matches the repo?
   `docker exec littlelife_postgres psql -U littlelife -d littlelife -At -c "select version, dirty from schema_migrations"`
   against `ls ../littlelifego/migrations | tail -4`. `dirty = t` or a lower version than the newest file → tell the
   user (applying migrations is theirs to do).
5. Are the API docs current? `diff -rq ../littlelifego/docs/api supporting-material/api` and
   `diff -q ../littlelifego/IMPLEMENTATION_ROADMAP.md supporting-material/IMPLEMENTATION_ROADMAP.md`. Differences mean
   the backend has moved: re-copy the docs, skim the diff for routes relevant to your phase, and note it (§9.1).
   (The owner's frontend copies were already behind on 2026-09-26 — see Appendix A.)
6. Baseline health, so you know what "clean" is before you change anything: `npx tsc -b --noEmit`, `npm run lint`,
   `npm test`. At the last full check: tsc clean; eslint 0 errors and 2 known warnings (`watch` in RegisterPage /
   RegisterForm); 1,578 unit tests in 166 files green.
7. Read your own memory directory if the harness gives you one, and Appendix D (open decisions).

---

## 4. Sources of truth, and which wins

| Question | Source | Notes |
|---|---|---|
| What does the backend actually do? | The backend **code and the real database**, then `supporting-material/api/*.md` | Docs have been wrong or ahead of the code before (a route listed as built that didn't exist; a field only set on approval). Probe. |
| What should the screen look like and do? | `supporting-material/UI mockups needed/uploads/WEB_DESIGN_PLAN.md` §6 (screen-by-screen specs; §2 route tree, §4 shells, §5 web components, §9 corrections), then the HTML mockups (`grep -l` the screen name across the `*.dc.html` files; read with offset/limit) | Mockups cover 1440 px desktop only. Phone/tablet layouts are extrapolated and documented as such. |
| Colours, type, spacing, radii, states | `mobile_plan-*.md` §1–2 (the web reuses it) → already encoded in `src/index.css` | NGO/Admin are neutral-dominant; `primary-500` only on the active sidebar item, primary buttons and the logomark. |
| In what order do we build? | The phase's *Screens* table and *Build steps* in the plan | Backend-domain-first, not role-first. |
| Flood visualisation | Plan §2.3 + `supporting-material/map-preview/` | Colour by continuous probability; `confidence_score` is `mean_prob`. |
| What did we already learn? | The plan's *Real deviations*, *Backend gaps*, *Real bugs* — search before you build | Most surprises have already happened once. |

When two sources disagree, the real behaviour wins over the docs, the docs win over the mockup where the mockup assumes
a capability that doesn't exist, and you record the disagreement.

---

## 5. The per-screen workflow (the core loop — do it in this order)

Build **one screen at a time and finish it before starting the next.**

1. **Pick** the next ⬜ row in the phase's *Screens* table. Read its spec (WEB_DESIGN_PLAN §6), its mockup, its API doc,
   and — when anything is ambiguous — the backend handler/repository source (`../littlelifego/internal/<domain>/http`,
   `…/domain`, `…/infra/postgres`) and the migration that made its tables.
2. **Probe the real backend** for every route the screen uses (recipe in §9.2), with throwaway `e2e-probe…` accounts. Record
   actual shapes, error texts and status codes, and anything the docs got wrong (validation the server doesn't do,
   optional keys omitted vs `null`, lowercase emails, missing list/detail routes).
3. **Decide scope and deviations, then tell the user briefly before building** anything sizeable: what you'll build, what you
   won't and why (no route / no data), which existing patterns you'll reuse, and any product question you need answered.
   Keep it short and lead with the decisions.
4. **If a needed route is missing**, write a contract document (§9.5) and pause that part; build the rest.
5. **Build**, in this order:
   1. service functions + types in `src/api/<domain>.ts` (mirror the doc; keep `unknown`s honest; return typed data, no axios in components);
   2. the feature's **model** file — pure functions for labels, tones, grouping, filtering, validation — with unit tests first;
   3. query/mutation **hooks** (`use<Feature>.ts`) that own loading/error/retry and invalidation;
   4. **dumb presentational components** — props in, callbacks out, no fetching, no router, no store; every state drawn:
      loading skeleton, empty, error-with-retry using the server's own message, and the 401/403/404/409 texts the API really returns;
   5. the **container page** in `src/pages/<role>/…` that owns state and wires hooks to components; view state
      (filters, tabs, selected id) mirrors to the URL (state → URL via effect, `replace: true`), unknown values fall back to a default;
   6. the **route** in `router.tsx` (replace the `PlaceholderPage`), nav entry/badge if the design has one;
   7. any new shared primitive goes in `src/components/ui/` with its own test, and is added to the plan's component list.
6. **Unit tests** (§8.1) — the whole file set for what you wrote, beside the code.
7. **One focused E2E spec, run alone** (§8.2–8.3): the happy path plus the main edge that only the real server shows.
8. **Visual check** (§8.4): four widths, zero horizontal overflow, and actually look at the images.
9. **Green checks**: `npx tsc -b --noEmit`, `npm run lint`, `npm test`. No new lint errors or warnings.
10. **Guarded cleanup** of the E2E rows you created (§8.6).
11. **Update the docs** (§10): the plan (as-built record), and — if you have a memory system — the phase-state memory.
12. **Report** (§11): what was built, what the real backend forced you to change, bugs found (with root causes), what
    wasn't built and why, what is deferred, what you need from the user.

**Definition of done for a screen:** works against the real backend with a fresh account · every state drawn ·
responsive at all four widths with no horizontal overflow · keyboard/screen-reader sane · unit tests + one E2E spec
passing · tsc, lint, unit suite clean · plan updated honestly · cleanup done.

**Not per screen:** don't run the full E2E suite, and don't write the whole edge-case matrix as running tests. Write those
scenarios down in the phase's *Deferred tests* list (specific enough to implement later without re-deriving them). The one
exception: a change to **shared** code (route guards, the auth store, a UI primitive, global styles) is worth running the
full suite early, because it can break screens built long ago — say so when you do.

---

## 6. Architecture and code conventions

- **Layering is strict.** `api/` (service functions) → `features/<x>/use*.ts` (hooks) → container page → dumb components.
  Never import axios in a component; never fetch in a presentational component; never put business logic in JSX.
- **Dumb components** take everything as props (data, `onX` callbacks, `isLoading`, `error`) and render. Their tests
  render them with plain props — no MSW, no providers unless a `Link` needs a router.
- **Model files** hold the vocabulary of a feature: labels, status → tone maps, `describe…()` sentence builders, grouping,
  validation. **User-facing wording lives there (or in a `notices.ts`)**, not scattered through JSX — that is the one
  place Phase 9's i18n will swap. Strings are English literals for now.
- **Queries:** every key is exported from the service file (`…_QUERY_KEY`); mutations invalidate or `setQueryData`
  explicitly. For an optimistic, auto-saving control (see `features/alertPreferences/useAlertPreferences.ts`): a
  `scope: { id }` so saves run one at a time in order, `onMutate` applies the change and cancels in-flight fetches,
  `onSuccess` only replaces the cache from the server copy when `isMutating <= 1`, `onError` refetches the truth and shows
  the server's message. Infinite lists use `useInfiniteQuery` + an id-deduped merge (see `features/activity`).
- **Error text:** `extractErrorMessage` from `src/api/errors.ts` (the server's own `{error}` string, else a generic fallback).
  Show the server's message; the API's texts are stable and often the useful part.
- **Forms:** RHF + Zod, schema mirrors the route's documented required fields; use `useWatch`; disable + spinner while
  submitting; map server 400/409 texts onto the form; validate on the client what the server doesn't (the backend does
  **not** range-check latitude/longitude — longitude 200 and latitude 95 are accepted).
- **Dialogs / drawers:** use the shared `Dialog` / `Drawer`. Open-from-state dialogs must **return focus** to their opener
  (`src/lib/returnFocus.tsx`, `useReturnFocus`, `openerContext`). Escape/backdrop behaviour is the primitive's.
- **URL is state:** filters, tabs, selected item and pagination live in the query string, mirrored from state by an
  effect. Don't call `setSearchParams` with an updater derived from render-time params for two quick changes — the second
  rebuilds from stale params and drops the first (found in real E2E).
- **Auth and guards:** `RequireRole`, `RedirectIfAuthenticated`, `RequireUnverifiedSession`, `RequireIncompleteProfile`
  in `src/routes/guards.tsx`; `nextAuthRoute(user)` decides "where next" (verify email → complete profile → app).
  Never keep the token in `localStorage`/`sessionStorage`. A page refresh re-derives it from the httpOnly refresh cookie.
  The store also carries a one-shot `pendingMessage` for redirects that must show a banner (router `state` gets lost when
  a guard races the page's own `navigate()`).
- **Dev debug hook:** `window.__authStore` (only under `import.meta.env.DEV`) can flip client-side auth for a quick visual
  check. It fools **frontend guards only** — not server-side `RequireVerified` routes. E2E does not use it; it seeds real state (§8.6).
- **Per-account client memory** (e.g. remembered invite emails, a "my vote" hint for a route that doesn't exist): key it by
  account id in `localStorage`, treat it as a hint never as truth, and flag the underlying backend gap in the plan.
- **Realtime:** native `WebSocket` through `src/lib/reconnectingSocket.ts` (backoff with jitter, fresh token per attempt,
  probe to tell a refused handshake from a dead network). One connection per account, last wins: only the foreground tab
  holds it. See `features/liveLocation` for the framework-free controller + provider pattern.
- **Maps:** always through the shared `MapCanvas` (`overlays` slot, `places`/`hazards` props) and `LocationPicker` /
  `usePointPicker` / `PointFields`. A Leaflet map mounted hidden has size 0 — never `flyTo`/pan it before re-measuring.
- **TypeScript:** no unused locals/params; `import type` for types (`verbatimModuleSyntax`); no `enum` or parameter
  properties (`erasableSyntaxOnly`); path alias `@/` → `src/`. Backend optional keys are **omitted**, not `null` — type them `?:`.
- **ESLint:** `react-refresh/only-export-components` bites test kits (don't export components and helpers from one
  file — inline wrapper JSX); `no-useless-assignment` flags dead initial assignments; `react-hooks` rules are on.

---

## 7. UI conventions

- **Tokens** live in `src/index.css`: colours `primary-*`, `peach-*`, `ink-*`, `surface-base|raised`; type scale
  `text-display|h1|h2|h3|body-lg|body-md|body-sm|label|overline`, `font-heading` (Manrope) / `font-body` (Inter; Noto Sans
  Arabic for Urdu); radii `rounded-sm|md|lg`; shadows `shadow-sm|md|lg`. Use tokens, not raw hex/px (except where a
  mockup pins a pixel value, e.g. the 620 px auth brand panel).
- **Citizen web is brand-forward** (rose/peach). **NGO and Admin are neutral-dominant.** Badges/chips are **full pill**
  (`999px`), whatever the token doc says. Buttons: `criticalSolid` / `safeSolid` are for real emergency actions only.
- **Responsive is a requirement, not a polish step.** Design for desktop and phone from the start.
  Inside a page that has a **sidebar** (Profile, NGO/Admin console), switch to the wide layout at **`lg`**, not `sm`/`md`
  (the console sidebar leaves a 768 px window ~480 px and 1024 px ~735 px). Tables and two-column panes start at `xl`/`lg`;
  below that they become cards/stacks. `OpsLayout` is an off-canvas drawer below `md`; `ProfileSidebar` collapses to one
  button on a phone.
- **Overflow discipline:** put `min-w-0` at each flex level that holds text; use `[overflow-wrap:anywhere]` for emails and
  ids (not `break-all`); dialogs are `calc(100% - 2rem)` wide on phones. Zero horizontal overflow at 320–390 px.
- **Accessibility:** every control has a label; use `role="status"` for banners (`Notice`); state is never colour alone
  (Switch has a bordered track); keyboard reaches everything (TabBar: arrows/Home/End); focus returns after dialogs; a
  loading `Button` keeps its accessible name; visible focus rings are not clipped.
- **Honest wording:** the flood model is imperfect (precision 0.58, recall 0.84) — say "elevated flood risk" with the
  number, never an unqualified "flood here". An implicit backend `0` with no `updated_at` is not a score ("Not scored
  yet"). Amounts with no stated currency print with none. Don't show invented numbers, levels, streaks, tips or history.
- **Links only where the target exists** — unbuilt subject screens render as plain text until their phase lands
  (see `describeActivity`).
- **Icons:** Phosphor `*Icon` names only.

---

## 8. Testing

### 8.1 Unit and component tests (Vitest + RTL + MSW)
- Beside the code: `Thing.tsx` → `Thing.test.tsx`; model files get `*.test.ts`. Globals are on; jsdom; MSW server is
  started in `src/test/setup.ts` (`onUnhandledRequest: 'warn'`). Default handlers exist only for unbuilt domains.
- For built domains, page tests use **per-test `server.use(...)`** and, where a screen acts then re-reads, a small
  **in-memory stand-in server** (see `src/pages/citizen/safetyGroupsTestKit.tsx` → `serveConnections`) that applies the
  backend's real rules in the backend's real words and records `calls`, so tests can assert "no request was made".
  Reuse/extend a feature's `fixtures.ts` and test kit rather than re-inventing them.
- Real Leaflet in jsdom needs prep (size stubs, `L_NO_TOUCH`) — copy from `MapCanvas.test.tsx`. Use fake timers for
  time-dependent logic. Sign a test in with `useAuthStore.getState().setAuth(...)`.
- **Mutation-check what you claim.** When you say a test guards a behaviour, temporarily break the behaviour and watch the
  test fail. Only claim what the mutation proves (a guard that survived deletion was redundant, not protective — say so).
- Test the ugly cases: empty, error, retry, double click, stale response, server refusal with its real text, a very long
  name, a fast second change.

### 8.2 E2E style (unchanged since Phase 1 — **do not restructure it for speed**)
- **Real** local backend + Postgres reads/seeds; **fresh registration/login per test**; no stubbed responses, no auth
  spoofing. The base is `E2E_API ?? http://localhost:8080/api/v1`.
- Files: `e2e/<area>-<screen>.spec.ts` for the per-screen spec; `e2e/<area>-deferred.spec.ts` for phase-end additions.
- Helpers you must reuse (read them first): `e2e/helpers/citizen.ts` — `API`, `password`, `visit` (goto that re-asks a
  stalled document), `register` (new email on retry), `logIn`, `signInCitizen(page, label, homeRegionId?, name?)`,
  `randomWorld()` (a random 0.6° square clear of real regions, with `at/rect/tag` helpers for spatial isolation);
  `e2e/helpers/seed.ts` — dozens of seeders/readers (accounts, roles, NGOs, regions, shelters, infrastructure, essential
  locations, hazard zones, safety connections, trust scores, alert preferences, activity events, incident reports…).
  Add a helper there rather than inlining SQL in a spec.
- Idioms that were paid for: use the `request` **fixture** for API-side checks, never `page.request` (its login cookie leaks
  into the page's browser context and changes who you are); `sr-only` radios are clicked via their **label**; strict-mode
  locator collisions get `.first()` or a tighter role/name; slow specs get `test.describe.configure({ timeout: 120_000 })`;
  emails are lowercased on registration, so psql `UPDATE … WHERE email = …` must use the lowercase form; format dates the
  way the UI does (hand-built month names, not `toLocaleDateString`, whose "Sept" ≠ date-fns "Sep").
- Playwright features already used: `browser.newContext({ permissions, geolocation })`, `page.routeWebSocket`,
  `page.clock`, two contexts for two people. Note `context.setOffline` does **not** drop an open WebSocket — close it
  through `routeWebSocket`.
- Persist nothing you can't clean: everything you create is an `e2e-…@example.com` account or an `E2E …` named row, so the
  guarded cleanup script can remove it (§8.6).

### 8.3 Cadence (agreed 2026-09-24)

| When | What |
|---|---|
| **Every screen** | Unit tests · a probe of any new route · **one focused E2E spec run alone** (`npx playwright test e2e/<file>.spec.ts`, ~1–2 min) · the visual check · update the plan |
| **Written down, not run** | The rest of the scenarios (edge-case matrix, phone runs, cross-role flows) → the phase's *Deferred tests* list |
| **Phase end** | Implement and run the whole deferred list · run the **full** E2E suite **spec by spec** with the guarded cleanup before each file · fix failures · re-run load-stall timeouts alone before suspecting code · final guarded cleanup · move deferred items into *Testing done* (or record honestly which were dropped and why). **Offer this to the user; they ask for it explicitly.** |

Why not all E2E at the end: real-backend E2E found things unit tests structurally can't (a route guard's redirect beating
a page's own `navigate()`; API behaviour differing from its docs). Found the same day they cost minutes; found after more
screens are built on the assumption they cost far more.

### 8.4 The visual check (every screen, every changed view)
Write a **throwaway** Playwright script (not committed; keep it and its screenshots in your scratch/tmp directory) that
signs in through the real UI with seeded data, then for each width sets the viewport, opens the route, waits on a
**locator** (maps and sockets never reach `networkidle`), screenshots, and measures overflow:

```ts
const sizes = [{ w: 1440, h: 900 }, { w: 1024, h: 768 }, { w: 768, h: 1024 }, { w: 390, h: 844 }]  // + 320 for tight forms
for (const { w, h } of sizes) {
  await page.setViewportSize({ width: w, height: h })
  await visit(page, route)
  await expect(page.getByRole('heading', { name: /…/ })).toBeVisible()
  await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) // must be <= 0
}
```
Capture every meaningful state (empty, loaded, selected, open drawer/dialog, error, a very long name) — not just the happy
page. Then **open the PNGs and look** (the Read tool shows images). Screenshots caught real problems no test did (crushed
tables at 1024, half-clipped focus rings, filters filling the phone screen). A screenshot of a background/animating context
can show a mid-transition state — re-capture after it settles before calling something a bug. Record what the captures
caught in the plan.

### 8.5 Reporting test results
Give counts (`N passed, M failed`), name failures with the first error line, distinguish "code bug" from "environment
flake" only after diagnosing (§12), and never say a behaviour is protected unless a check proves it.

### 8.6 Test data, seeding and the guarded cleanup
- Seed helpers talk to Postgres with `docker exec <container> psql …` (`E2E_PG_CONTAINER` overrides the name). They
  `assertE2eEmail` (must start `e2e-`) and require NGO/region/place names to start `E2E `, so a typo can't touch a real row.
  New helper checklist: `psql()` wrapper, `lit()` for quoting, guard on the test prefix, insert only into **existing**
  tables, use real columns (read the migration), and **extend `e2e/cleanup-test-data.sql`** (a count line, the guard
  against real rows pointing at test rows, the `DELETE` in dependency order) whenever a new table gets test rows.
- The verified/onboarded trick: mark a freshly registered `e2e-` account `email_verified = true, status = 'active'` and give
  it a profile name **before its first login** (`verifyAndOnboardAccount`) — the token's claims are minted at login, so the
  session is genuinely verified. (The email OTP is only logged by the server; Redis holds a hash, so it can't be read.)
- **Cleanup — always dry-run first**; commit only when every "must be 0" row is 0:

```bash
# e2e-clean.sh (run from the repo root)
dry=$(docker exec -i littlelife_postgres psql -U littlelife -d littlelife -v end=ROLLBACK < e2e/cleanup-test-data.sql 2>&1)
echo "$dry" | grep -E "must be 0|ERROR"
echo "$dry" | grep -qE "ERROR" && { echo "DRY RUN FAILED"; exit 1; }
bad=$(echo "$dry" | grep "must be 0" | awk -F'|' '{print $2+0}' | grep -v '^0$')
[ -n "$bad" ] && { echo "GUARD NOT ZERO — not committing"; exit 1; }
docker exec -i littlelife_postgres psql -U littlelife -d littlelife -v end=COMMIT < e2e/cleanup-test-data.sql 2>&1 | grep -E "COMMIT|ERROR|left"
```

- **Full suite, spec by spec** (phase end only): for each `e2e/*.spec.ts`, run cleanup, then
  `PLAYWRIGHT_JSON_OUTPUT_NAME=<tmp>/<file>.json npx playwright test <file> --workers=1 --reporter=json`, and summarise
  passed/failed/flaky/skipped per file plus the first error line of each failure. One file at a time, because leftover
  spatial rows from one file can fail another's counts. Then a final cleanup.

---

## 9. Working with the backend

### 9.1 Reading it (allowed, encouraged)
Layout: `cmd/api/main.go` (composition root, module wiring), `internal/<domain>/{domain,http,infra/postgres}` for
`identity, geo, floodintel, facilities, profiling, trust, community, relief` (+ `platform`, `shared`), `migrations/`
(golang-migrate; numbered up/down pairs; `schema_migrations` in Postgres), `docs/api/*.md` (consumption docs),
`seeds/dev_seed.sql`, `SEED_ACCOUNTS.md`, `IMPLEMENTATION_ROADMAP.md`. When the backend owner ships something, re-copy
`../littlelifego/docs/api/*.md` into `supporting-material/api/` (and the roadmap), read the diff, and note it in the plan.

### 9.2 Probing routes (before building; throwaway accounts only)

```bash
API=http://localhost:8080/api/v1; PW='SuperSecret123!'
EMAIL="e2e-probe-$(date +%s)-$RANDOM@example.com"      # emails are lowercased server-side; keep it lowercase
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}"
docker exec littlelife_postgres psql -U littlelife -d littlelife -c \
  "UPDATE accounts SET email_verified=true, status='active' WHERE email='$EMAIL'"   # a real verified token needs this BEFORE login
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -H "Authorization: Bearer $TOKEN" "$API/<route>"
```
For staff roles, promote the throwaway account with the seed helpers' SQL (`promoteToNgoAdmin`, `promoteToPlatformAdmin`,
…) — don't log in as, or change, the `@littlelife.test` accounts. Probe: the happy shape, each documented error, **and the
undocumented ones** (bad ranges, wrong role, someone else's id, missing auth, empty and huge inputs). Web sends **no**
`X-Client` header (refresh token stays an httpOnly cookie). Lists are `limit`/`offset`; out-of-range values are clamped.
Errors are `{"error": "…"}`. IDs are UUIDs; timestamps ISO-8601 UTC; optional keys are omitted.

### 9.3 Postgres and Redis
`docker exec [-i] littlelife_postgres psql -U littlelife -d littlelife -At -c "…"` for reads, and only test-scoped seed
writes (§2). `docker exec littlelife_redis redis-cli …` read-only. PostGIS is available (`ST_AsGeoJSON`, `ST_Contains`, …).

### 9.4 Real data on the developer's machine
The user has their own real rows next to the seed data (accounts, connections, reports, ML-ingested zones). Don't hard-code
counts of "real" rows in tests, don't rely on a specific real row existing, and use `randomWorld()` / `E2E `-named regions
to keep spatial tests away from real geometry. A different machine has a different (smaller) database.

### 9.5 When a backend change is needed — the contract document
Never edit the backend. Write `supporting-material/backend-requests/<slug>.md` for the user to hand to the backend owner.
Follow `activity-timeline.md`: **From / Status / Touches** header · why the screen needs it (with the roadmap/route reference
if any) · **Request** (method, path, auth, params, validation) · **Response** (JSON example, ordering, omitted keys) ·
**Responses** table (status + exact error strings) · notes on the build (pointers to the analogous existing files) · **what
the web screen does once it ships** · tests worth adding on their side. Then continue with what you *can* build. When the
owner says it's done: **probe it for real**, mark the doc "✅ built <date>" with an *As built* note describing any deviation,
wire the frontend, and correct any plan claim that was wrong.

---

## 10. Keeping the documents current

[FRONTEND_IMPLEMENTATION_PLAN.md](FRONTEND_IMPLEMENTATION_PLAN.md) is a living, **honest as-built record**, not a
restatement of the plan. After each screen (and again at phase end) update, in the plan's own style:

- the phase heading's status marker, and the **Progress so far** paragraph (short version, must never drift);
- the phase's **Screens** table (⬜ → ✅) and **Backend routes** table (Status → ✅ Wired);
- **Build steps** (cross out what's done);
- **Real deviations from the mockups** (what differs and *why* — usually "no route"), **Backend gaps found building …**
  (gap · what was verified · suggested backend change), **Real bugs found and fixed** (root cause, how it was found,
  how it was fixed, what proves it), **Testing done so far (<screen>)** (only what was actually run, with counts;
  what the visual captures caught), **Deferred tests** (specific enough to implement later), and the **component list**
  if you added a primitive;
- any wrong claim you discover (e.g. a route listed as built before it existed) — correct it and say it was wrong;
- `supporting-material/api/*` copies and any contract doc's status.

Rules for writing it: dated (absolute dates, never "yesterday"); specific (route, file, number); no marketing;
record failures and dead ends, not only successes; leave earlier sections intact unless they're wrong.
**Two developers, one plan:** edit only the sections of the phase you are building; append, don't reorganise; expect to
merge.

If your harness has persistent memory, keep one short "phase state + open decisions" note per phase and update it when a
phase lands. When the user states a new *standing* rule ("always…", "from now on…"), save it and tell them it may belong in
this file too.

---

## 11. How to communicate

- **Lead with the answer or the decision.** Terse, plain prose; short paragraphs; tables for enumerable facts; code blocks
  for commands. No preamble, no recap of what the user just said, no emoji unless they use them.
- **"Just guide" / a question ≠ a request to edit.** Answer, don't touch code.
- **Before a sizeable build**, give the scope decisions (what, what not, why) in a few lines, then build. Ask a question
  only when the answer is genuinely the user's and changes what you do next; otherwise pick the conventional option and say so.
- **While working**, post a short status line when a step takes a while; don't narrate every tool call.
- **At the end**, say what changed, what the real backend forced, what you verified (with counts), what you did *not* do,
  and what you need from the user. If tests failed, say which and why. If you found a backend gap or a wrong doc, say so.
- **Reference code as markdown links** (`[file.ts:42](src/file.ts#L42)`), not backticks, in chat.
- **When you write something for someone else** (a doc, message, PR description), start the hand-over with one line naming
  the audience as you understood it, so the user can correct it.
- Use **absolute dates** in anything durable. Use they/them for anyone whose pronouns you haven't been told.

---

## 12. Lessons learned (each one already cost time — check this list before debugging)

**Environment**
- `page.goto: net::ERR_ABORTED` / slow backend calls in E2E were the **owner's macOS TCP stack** (TIME_WAIT sockets never
  drain after ~49.7 days of uptime; Vite listens on IPv6 loopback and the port pool exhausts). Cured by a reboot. Before
  calling a stall an app bug, run `netstat -an -p tcp | grep -c TIME_WAIT` twice a minute apart; a big number that doesn't
  fall is this. Not relevant on other OSes.
- The Vite dev server double-mounts under React StrictMode: anything with side effects on mount (sockets, timers) needs a
  grace period, and E2E that counts sockets must filter out Vite's own HMR socket by URL.

**Backend behaviour**
- Register lowercases emails. The web client sends no `X-Client`. The email OTP is only logged server-side.
- The server does not range-check `lat`/`lng` (200 and 95 are accepted), doesn't validate some geometry shapes (bare
  `500`), and allows duplicate names — the client must validate and refuse.
- `ngo_id` is only set on an account after NGO **approval**; approving also promotes the applicant and revokes their sessions.
- Facility routes answer **per region**; the flood pipeline leaves old zones active (many copies per cell — a nationwide
  overlay was 6.7 MB); `confidence_score` is `mean_prob`; citizens never receive model zones under 0.34.
- Live location: one WebSocket per account (last wins, the older stays open but deaf), no snapshot on connect (sharer
  re-sends every 15 s), no "stopped" frame, no per-member targeting; the relay writes `location_trail` rows.
- A safety-connection **requester sees nothing about the recipient until they accept** (privacy rule) — the UI shows the
  email the user typed (remembered per account) or "Member XXXXXXXX".
- A seeded NGO founder with a NULL password hash made queries on that account fail with `500` — seeded accounts must have
  real hashes (borrow one).

**Frontend behaviour**
- Sidebar pages need `lg`, not `sm`/`md` (§7). Flex children need `min-w-0`. A hidden Leaflet map has size 0.
- React Router `setSearchParams` updaters use last-render params — two quick filter changes drop one (§6).
- A guard's stateless redirect can race a page's own `navigate()` and lose its `state` — carry messages in the store.
- Don't consume-and-clear inside a `useState` lazy initialiser (StrictMode runs it twice); read purely, clear in an effect.
- `name ? … : skeleton` mistakes `""` (a real "not set" value) for "loading" — test `!== null`.
- The query cache must not survive an account switch (privacy) — `queryClient.ts` already clears it; don't bypass it.
- Safari's autofill highlight anchors to the real `<input>`, which must own the full visible box.
- Phosphor bare icon names are deprecated; a `Button`'s loading state must keep an accessible name.
- Trailing send of the newest value beats waiting for the next heartbeat when a throttle drops a fix; a reconnect engine
  must grow its pause when a connection drops right after opening.

**Testing**
- `page.request` shares the page's cookie jar (§8.2). Playwright's offline mode doesn't kill open sockets.
- Parallel workers make slow specs time out — raise the describe timeout rather than weakening assertions.
- Don't add retries to hide a flake; diagnose it. A `goto` load stall that passes alone is environment.
- Cleanup once failed on a new table's foreign key (`location_trail`) — extend the script whenever you seed a new table.

---

## 13. Command cheat sheet

```bash
npm run dev                      # the USER runs this; you never start/stop it
npm run build                    # tsc -b && vite build (type-checks the app + node configs)
npx tsc -b --noEmit              # fast type check
npm run lint                     # eslint .
npm test                         # vitest run (whole unit suite)
npx vitest run src/features/x    # a subset
npx playwright test e2e/<file>.spec.ts            # ONE focused E2E spec (Vite must already be on :5173)
npx playwright test e2e/<file>.spec.ts --workers=1 --reporter=list

curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/      # Vite alive?
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/v1/regions   # API alive?
docker exec littlelife_postgres psql -U littlelife -d littlelife -At -c "select version, dirty from schema_migrations"
docker exec -i littlelife_postgres psql -U littlelife -d littlelife -v end=ROLLBACK < e2e/cleanup-test-data.sql   # dry-run cleanup
```

---

## Appendix A — State snapshot (2026-09-26; the plan is the truth, re-check it)

- **Phases 0–3 done** (foundation, identity/account shell, geo, facilities + flood intel + map; Offline Map Packages
  skipped on purpose). **Phase 4 (Trust) — every screen built** (Safety Groups incl. live location over WebSocket,
  Credibility, Alert Preferences, Edit Profile account card, Activity Timeline) — **its phase-end pass (full E2E suite +
  the deferred-test list in the plan) has not been run.** Phase 4 is committed on `main`.
- **Phase 5 (Community Intelligence) is next and not started:** `src/api/community.ts` is an empty stub and every Phase 5
  route in `router.tsx` is a `PlaceholderPage` (Community Feed, Incident Detail, Report Incident drawer, NGO Incidents,
  Admin Incident Reports, plus the map's incident markers). Research so far is in Appendix B.
- Phases 6–10: not started (Relief Ops core; not-yet-built backend domains against MSW; dashboards; real-time/i18n/dark
  mode; cross-role hardening).
- Last full check on the owner's machine: unit 1,578 tests / 166 files green; tsc clean; eslint 0 errors, 2 warnings.
- The backend has moved on since `supporting-material/api` was last synced (docs for identity, geo, flood-intel and
  relief-operations differ; new relief-operations routes such as NGO aid-request/missing-person listings and feedback
  exist, migration 000017 is applied). **Resync docs before starting Phase 6** (§3.5).

## Appendix B — Phase 5 research (probed against the owner's running backend, 2026-09-26; re-verify on your data)

Not yet in the plan — move it there when Phase 5 starts. Backend doc: `supporting-material/api/07-community-intelligence.md`.

**Routes (all built):** `POST /incident-reports` (multipart: `category` ∈ flooding|blocked_road|other_hazard, optional
`description`, `lat`, `lng`, ≥1 `files`) · `POST/GET /incident-reports/{id}/media` (only the reporter may add; others `403`) ·
`POST/DELETE /incident-reports/{id}/votes` (upsert; repeating the same vote is a no-op `200`; `DELETE` is an idempotent `204`) ·
`GET /incident-reports?region_id=|bbox=` (mutually exclusive, one required, public) · `PATCH /incident-reports/{id}/status`
(admin, any of the 5 statuses) · `GET /admin/incident-reports?status=&sort=priority_score` ·
`PATCH /admin/incident-reports/{id}/verify|reject` (no body) · `GET /ngo/incident-reports?region_id=` (the NGO's own
operational regions only; any NGO staff) · `PATCH /ngo/incident-reports/{id}/verify` (`ngo_admin` only) ·
`PATCH /ngo/incident-reports/{id}/status` (any NGO staff; only verified/in_progress/resolved) ·
`POST/GET /community-updates` (POST admin/ngo_admin — Phase 7/8 UI; GET public `?region_id=`, includes platform-wide).
`POST /internal/.../ai-classification` is service-to-service — not a frontend route.

**Report shape:** `id, reporter_account_id, category, description?, location{Point}, region_id?, status
(reported|verified|in_progress|resolved|rejected), ai_classified_category?, ai_confidence?, auto_verified, upvote_count,
downvote_count, verified_at?, resolved_at?, created_at, updated_at, priority_score?` — optional keys **omitted**. There is
**no** title, severity, comments count or reporter name.

**What probing found:**
- **No `GET /incident-reports/{id}`.** A detail page must find its report in a list query (a deep link needs a wide bbox).
- Real reports have **no `region_id`** (regions are tiny placeholders), so use **`bbox`** (e.g. `60,20,80,38` or
  `-180,-90,180,90`), not a region fan-out. The feed needs one media request per card (N+1) → paginate ~12 cards.
- Media URLs are absolute and browser-loadable: `http://localhost:8080/uploads/incident-reports/<id>/<uuid>`; seed data also
  has `placehold.co` URLs. The base comes from the backend's `EXTERNAL_URL`.
- The server does **not** range-check lat/lng (lat 95 / lng 200 → `201`) → the client must. Description is optional.
  Backend media rules: ≥1 file, ≤25 MB each, jpeg/png/webp/heic/mp4/quicktime/webm. The design's 20-char minimum and
  "5 files, 10 MB" are design-only.
- **No route reads "my vote".** Voting on your own report is allowed; unknown id and unauth behave as expected.
- NGO/admin can read a reporter's credibility via `GET /accounts/{id}/trust-score` (staff roles only; an unscored account
  is an implicit `0` with no `updated_at` → "Not scored yet"); an admin can read the reporter's email via
  `GET /admin/accounts/{id}`; an NGO has no way to resolve reporter names.
- Design features with **no backend** (do not invent): internal notes, "Assign task", bulk actions, severity, titles,
  comment counts, "Q&A" tab (show "Coming soon").

**Proposed decisions (confirm the open ones with the user):** bbox-based feed with the detail read from the list cache ·
per-account "my vote" memory in `localStorage` (flag the gap) · three real categories · reporter shown as "You" /
"A community member" · report location picker: real reports have no region, so **do not** refuse points outside every
region (this differs from the facilities pickers — needs the user's OK) · media limits: enforce the backend's, decide
whether to add the design's · NGO list needs the NGO's operational regions and real reports lack `region_id`, so it may be
empty on real data (say so in the UI).
**Build order:** Community Feed (+ official updates card variant) → Incident Detail → Report Incident drawer (overlay, no
route) → NGO Incidents (+ detail) → Admin Incident Reports (+ detail) → map "Reports" chip retrofit onto `MapCanvas`.

## Appendix C — For the human: setting up the second laptop

1. **Prerequisites:** Node 24 + npm 11, Docker, Go ≥ 1.25, the `migrate` CLI (golang-migrate, e.g. `brew install
   golang-migrate`), Git. Windows: use WSL2 (the commands assume a POSIX shell).
2. **Copy both repos as siblings** (`littlelife-web/` and `littlelifego/`). Don't copy `node_modules`, `dist`, `test-results`,
   or another person's `.env`/`.env.local`.
3. **Backend bring-up (yours to run, not Claude's):** in `littlelifego/`: `cp .env.example .env` (keep `ENV=development`,
   `CORS_ALLOWED_ORIGIN=http://localhost:5173`, `EXTERNAL_URL=localhost:8080`; `AUTH_TOKEN_SECRET` may be any string outside
   production; leave the `MAILTRAP_*` keys **empty** and the API switches to a log mailer that prints every email OTP in its
   own log — that is how you verify an account by hand) · `docker compose up -d` · apply migrations, typically
   `migrate -path migrations -database 'postgres://littlelife:<dev password from docker-compose.yml>@localhost:5432/littlelife?sslmode=disable' up`
   · seed with `docker exec -i littlelife_postgres psql -U littlelife -d littlelife -v ON_ERROR_STOP=1 < seeds/dev_seed.sql`
   · `go run ./cmd/api` and leave it running.
4. **Frontend:** `npm ci` · `cp .env.example .env.local` · `npx playwright install chromium` · `npm run dev` in its own
   terminal and leave it running.
5. **Claude Code:** start the session **in the frontend repo root** (so this file loads). Optional but recommended:
   set effort to high/`xhigh` for parity, and allow the routine read/test commands so it isn't prompted constantly, e.g. in
   `.claude/settings.local.json`:
   `{"permissions":{"allow":["Bash(npm run *)","Bash(npm test*)","Bash(npx vitest *)","Bash(npx playwright test *)","Bash(npx tsc *)","Bash(npx eslint *)","Bash(docker exec littlelife_postgres psql *)","Bash(docker exec -i littlelife_postgres psql *)","Bash(docker exec littlelife_redis redis-cli *)","Bash(docker ps*)","Bash(curl *)","Bash(git status*)","Bash(git log*)","Bash(git diff*)"]}}`
   (deliberately no `git commit`/`git push`). First message to Claude: *"Read CLAUDE.md, run the first-ten-minutes checklist,
   and tell me what you find."*
6. **Coordinate with the owner:** who builds which phase (avoid two people in the same plan sections); how backend
   requests reach the backend owner; each laptop has its **own** database, so E2E on both at once is fine but their data differs.
7. **Memory:** the owner's private Claude memory doesn't travel and doesn't need to — its content is in this file. Claude will
   build its own memory as it works.

## Appendix D — Open decisions (raise them, don't decide silently)

- **Phase 3, unanswered:** apply the citizen floor (0.34) to `POST /hazard-zones/risk-check`? (backend change; blocks
  deferred tests 6b and 13 and the "flood risk at this shelter" line) · what to call the model's score — the API's
  `confidence_score` is `mean_prob` but the UI says "model confidence" · should Escape ask before discarding a half-filled
  Register/Add drawer? · should pagination show thousands separators?
- **Phase 5:** the "proposed decisions" in Appendix B (region-less incident location picker, vote memory, media limits).
- **Not yet asked:** whether/when to run Phase 4's phase-end pass (offer it), and when to commit.
