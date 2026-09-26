# Backend request — `GET /incident-reports/{id}` (one report)

**From:** the web frontend (Phase 5, Incident Detail; later NGO Incidents and Admin Incident Reports detail pages) · **Status:** ✅ **built 2026-09-26**, to this contract, on the backend's `feature-report-my-votes` branch (on top of `my-votes`; not yet committed there) · **Touches:** `internal/community` (the repository's `FindByID` already exists; only a handler and a route are missing)

> **As built** (probed against the running server on :8080, 2026-09-26): a known report → `200` in the shared shape; the seed's **rejected** report → `200` with `status: "rejected"`; an unknown UUID → `404 "incident report not found"`; `not-a-uuid` → `400 "id must be a valid uuid"`; no token needed; `my-votes` without a token still `401` (so it isn't read as an id) and `…/{id}/media` still `200`. Choices the backend made: **`region_id` is omitted**, as in the list (picking the "most specific" of overlapping regions was left for when something needs it); **timestamps are UTC on this route only** — the list still answers in `+05:00`, since changing it would change every list route. The backend's `docs/api/07-community-intelligence.md` documents the route and is now the authoritative description.
>
> **Wired in the web app the same day:** Incident Detail reads by id, starting from the feed's cached copy when there is one (no request from the feed; one small request from a direct link, never the nationwide list), and a vote re-reads only that report.

The citizen Incident Detail page (`/app/community/:incidentId`, built 2026-09-26) needs one report. There is no route that returns one, so today the page downloads **the whole nationwide list** (`GET /incident-reports?bbox=-180,-90,180,90` — unpaginated, every report in the country) and looks for the id in it. Opened from the feed that costs nothing extra (the list is already cached), but a **direct link** — a shared URL, a notification, a reload — pays for the whole country to show one card, and that grows with every report filed. The NGO and admin detail pages still to be built will need the same thing. `IncidentReportRepository.FindByID` already exists and already returns `ErrIncidentReportNotFound`, so this should be a thin handler.

---

## Request

`GET /incident-reports/{id}`

- **Auth:** none — **public**, like `GET /incident-reports` and `GET /incident-reports/{id}/media` (anyone who can list a report can already see it).
- `id` — the report's UUID.
- **Routing note (Gin):** this must coexist with the static `GET /incident-reports/my-votes` registered on the same group. Gin ≥ 1.8 resolves a static segment ahead of a `:id` param at the same level, so `my-votes` keeps working — worth one check after adding it that `GET /incident-reports/my-votes` still returns the caller's votes and not `400 "id must be a valid uuid"`.

## Response — `200 OK`

The shared `incidentReportResponse` shape, exactly as the list returns it (optional keys **omitted**, not `null`):

```json
{
  "id": "d0acfd23-e5e0-5d91-16d0-e5fffc53d74e",
  "reporter_account_id": "113245cb-...",
  "category": "flooding",
  "description": "Water level rising fast on Indus Road, knee-deep in places.",
  "location": { "type": "Point", "coordinates": [68.86, 27.7] },
  "status": "verified",
  "ai_classified_category": "flooding",
  "ai_confidence": 0.93,
  "auto_verified": true,
  "upvote_count": 3,
  "downvote_count": 0,
  "verified_at": "2026-09-26T05:12:58Z",
  "created_at": "2026-09-26T04:12:58Z",
  "updated_at": "2026-09-26T05:12:58Z"
}
```

- **A `rejected` report is returned like any other** (the public list returns them too). The web client decides what to show — the citizen page says "This report was rejected" and hides the content; a moderator page will want the whole thing.
- `region_id`: the list omits it (the column is never written — regions are resolved live). Either keep it omitted here too, or — nicer — resolve it the way `ListForRegion` does (`ST_Intersects` with `regions.boundary`, the most specific region). Not required; say which you chose.
- Timestamps in UTC (`…Z`), as `my-votes` now does — the list currently answers in the server's zone (`+05:00`); either parses the same.

## Responses

| Condition | Status | Body |
|---|---|---|
| Found (any status, `rejected` included) | `200` | the report |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` (the same text the other `/{id}` routes use) |
| No report with that id | `404` | `{"error":"incident report not found"}` (the same text as `POST …/votes` and the status routes) |

## What the web screens do once this ships

- **Incident Detail:** `GET /incident-reports/{id}` for the page, seeded from the feed's cached list when the report is already in it (so opening from the feed still costs no request, and the page never flashes a skeleton), and a `404` / `400` becomes "Report not found". The list stays the feed's; the detail stops depending on it.
- After a vote, only this report is re-read, not the whole country.
- **NGO Incidents and Admin Incident Reports detail pages** read the same route instead of scanning their region's or the whole list.
- The client's "find it in the list" code is kept only as the cache seed.

## Tests worth adding on your side

- A known id → `200` with the same fields and values the list gives for that report (compare one report from `?bbox=-180,-90,180,90`).
- A `rejected` report → `200` with `status: "rejected"`.
- A well-formed unknown id → `404 "incident report not found"`; `not-a-uuid` → `400 "id must be a valid uuid"`.
- No token → `200` (public).
- `GET /incident-reports/my-votes` (with a token) still answers the caller's votes after the new route is registered.
