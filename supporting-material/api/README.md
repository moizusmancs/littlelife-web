# LittleLife API Documentation — Index & Conventions

This is the frontend-facing API reference for the LittleLife backend. It documents every route
that has actually been built and tested (verified directly against the Go source in this repo at
the time each phase's document was written — not reconstructed from memory or from
`IMPLEMENTATION_ROADMAP.md`'s own prose, though it follows that document's same phase/FE grouping
so the two can be cross-referenced).

**How this differs from `IMPLEMENTATION_ROADMAP.md`:** that document is a build log — why each
route exists, what design decisions were made, what bugs were caught. This document is a
*consumption* reference — exactly what a frontend client must send and can expect back, written
for someone integrating against the API who has never read the backend code.

**Built incrementally, phase by phase.** Each linked file below covers one bounded context. A
phase not yet linked has not been documented yet — it may still be unbuilt on the backend, or
simply not yet written up. Check `IMPLEMENTATION_ROADMAP.md` for what's actually built if a phase
is missing here.

## Phases documented so far

| Phase | Bounded context | File | Status |
|---|---|---|---|
| 0 | Identity (auth, NGO lifecycle, admin account management) | [00-identity.md](00-identity.md) | Complete |
| 1 | Geo (regions, NGO operational coverage) | [01-geo.md](01-geo.md) | Complete |
| 3 | Flood Intelligence (flood predictions, hazard zones) | [03-flood-intelligence.md](03-flood-intelligence.md) | Complete |
| 4 | Facilities (shelters, infrastructure, essential locations, offline maps) | [04-facilities.md](04-facilities.md) | Complete |
| 5 | Profiling (personal profile, alert preferences) | [05-profiling.md](05-profiling.md) | Complete |
| 6 | Trust (safety connections + live GPS WS, trust scores, moderation actions) | [06-trust.md](06-trust.md) | Complete |
| 7 | Community Intelligence (incident reports, votes, AI classification, community updates) | [07-community-intelligence.md](07-community-intelligence.md) | Complete |
| 8 | Trust, follow-up: `credibility_events` | — | **Not built.** No migration, no route, no code exists for this phase yet — confirmed by checking the repo directly, not an oversight in this index. Skip it; there is nothing to document. |
| 9 | Relief Operations, core (aid requests, donation campaigns + lifecycle, missing persons) | [09-relief-operations.md](09-relief-operations.md) | Complete |

Phase numbers follow `IMPLEMENTATION_ROADMAP.md`'s own numbering, not a sequential count — **Phase
2** ("Identity NGO support") is covered entirely within Phase 0's file (it's the same
`internal/identity` code, sequenced separately in the roadmap only because it chronologically
landed after Geo); there is no separate Phase 2 file, and that isn't a documentation gap.

---

## Conventions used across every phase document

These apply to every route below unless a specific route explicitly overrides one.

### Base URL

All routes are mounted under `/api/v1`. A route documented as `POST /auth/register` means the
real path is `POST /api/v1/auth/register`.

### Authentication

Protected routes require an `Authorization: Bearer <access_token>` header. The access token is a
short-lived (15 minutes by default — `AUTH_ACCESS_TOKEN_TTL`, configurable) signed JWT. There is
no session/cookie-based auth for the access token itself — only the **refresh** token uses a
cookie, and only for web clients (see below).

A request to a protected route with a missing/malformed `Authorization` header gets
`401 {"error": "missing or malformed authorization header"}`. A request with a present but
invalid/expired token gets `401 {"error": "invalid or expired token"}`. Both are produced by
middleware, before the route handler ever runs.

Some routes additionally require the account's **role** (`RequireRole`) or that its email was
**verified at the time the access token was issued** (`RequireVerified`). Each route below states
which apply. A role failure returns `403 {"error": "insufficient permissions"}`. A verification
failure returns `403 {"error": "email verification required"}`.

**Important:** `RequireVerified` checks the `email_verified` claim baked into the *access token at
issuance time*, not the account's live database state. If a user verifies their email in one tab,
their existing access token in another tab still claims unverified until it's refreshed or
re-issued. Frontends should treat "verify email" and "log in / accept invitation / approve NGO" as
each producing a **fresh token** (see each route's own notes — several deliberately re-issue a
token for exactly this reason) and should not assume an old token updates itself.

### The `X-Client` header — web vs. mobile

Several auth routes (`login`, `refresh`) hand back a **refresh token**, and where that token goes
depends on this header:

- **Not sent, or any value other than `mobile`** → treated as a **web** client. The refresh token
  is set as an `httpOnly`, `SameSite=Lax` cookie named `refresh_token`, scoped to path
  `/api/v1/auth` only. It is **never included in the JSON response body** for a web client. The
  cookie's `Secure` attribute is on in production, off in local dev (so plain-HTTP dev servers
  still receive it).
- **`X-Client: mobile`** → the refresh token is returned as a plain string in the JSON response
  body (`refresh_token` field), and no cookie is set. Mobile clients have no cookie jar tied to
  this origin, so they must store this token themselves (e.g. secure device storage) and send it
  back explicitly in the request body on `POST /auth/refresh` and `POST /auth/logout`.

A web frontend built with a standard browser `fetch`/`axios` setup should send credentialed
requests (`credentials: "include"` / `withCredentials: true`) so the cookie round-trips
automatically, and should **never** try to read or store the refresh token itself — it is
`httpOnly` by design and inaccessible to JavaScript.

### Standard error shape

Every error response is JSON:

```json
{ "error": "human-readable message" }
```

Request-binding failures (malformed JSON, a required field missing, wrong type, an `email` field
that isn't a valid email shape, etc.) additionally include a raw validator string:

```json
{ "error": "invalid request", "detail": "Key: 'registerRequest.Email' Error:Field validation for 'Email' failed on the 'required' tag" }
```

**Treat `detail` as debug-only, not user-facing.** It's the raw output of Go's
`go-playground/validator`, not a stable, translatable, or well-formatted string. Build your own
field-level validation messages in the frontend from the request shape documented per route rather
than displaying `detail` directly to an end user.

Only the `error` field's *presence* (and the HTTP status code) should ever drive frontend logic
(retry, redirect to login, show a specific message). Do not pattern-match on the exact text of
`error` for anything except display — where a route can fail for genuinely different *reasons*
with the same status code, this doc calls that out explicitly per-route.

### IDs, timestamps, enums

- Every ID (`id`, `account_id`, `ngo_id`, etc.) is a v4 UUID string, e.g.
  `"48434d1b-b4af-49cc-abbc-c559b8e30b4c"`.
- Every timestamp is RFC3339 with timezone offset (Go's default `time.Time` JSON marshaling), e.g.
  `"2026-09-20T06:44:58.08553Z"`. Treat these as opaque ISO-8601 strings — parse with your
  platform's standard date library, don't hand-roll a parser.
- Enum-typed fields (`role`, `status`, etc.) are always lowercase snake_case strings matching the
  Postgres enum values listed per route — never numbers, never capitalized.

### `PATCH` semantics — real partial patch, not full replace

Where a route is documented as a "partial patch," it means: a field **omitted** from the JSON body
leaves that value unchanged; a field **present** (even as `""` or `null` where the domain allows
clearing it) is applied as a real update. This is implemented via nilable/pointer fields on the Go
side, so the wire contract is genuine — do not send a field with its *current* value just to
"round-trip" it; omit anything you don't intend to change. Every partial-patch route in this API
rejects a body where **every** field was omitted (nothing to update), documented per-route.

### Pagination

Where a route paginates, it uses `limit`/`offset` query parameters, not cursor-based pagination.
An out-of-range or non-numeric `limit`/`offset` is **silently clamped to a default**, not rejected
with a `400` — documented per-route with its exact default/max.

### What this document does not cover

Request/response bodies, status codes, and documented error conditions below are exhaustive for
what the current backend code implements and was tested against. They do **not** describe:
rate-limiting behavior (none is implemented anywhere in this API today), CORS configuration (a
deployment concern, not a route-level one), or WebSocket routes (documented separately per-phase
where they exist, since their contract — a persistent connection with its own message protocol —
doesn't fit this REST-route template).
