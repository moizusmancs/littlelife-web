# Backend request — `GET /profile/activity-timeline`

**From:** the web frontend (Phase 4, Activity Timeline) · **Status:** ✅ **built 2026-09-25**, to this contract (it answered `404` when requested) · **Touches:** `internal/profiling` (a read composition across other contexts, as the roadmap already describes it)

`IMPLEMENTATION_ROADMAP.md` lists this as **M1 FE-4** under "No Single Owner": *"chronological activity timeline: incident reports, aid requests, donations, verification contributions, interactions"*, with the route
`GET /api/v1/profile/activity-timeline` — but it was never registered, and `05-profiling.md` doesn't mention it. The web screen
(`/app/profile/activity`, Batch 3 citizen Profile › Activity) has nothing to call, so it is still a placeholder. Everything it would list
already exists in Postgres. The contract below is what the screen needs; change any of it that doesn't suit the tables and tell me.

> **As built.** Everything below shipped as written, with one addition: a `status_report`'s `detail` also carries `place_type` (`shelter` / `essential_location`), because its `subject_id` could be either. Note that `limit` over 100 (or zero, negative or non-numeric) is reset to **25**, not clamped to 100. The backend's own `05-profiling.md` (*FE-4*) is now the authoritative description; this file is kept as the request that led to it. The claim in *Notes on the build* that every source already had an index was wrong — only two did, and migration 000016 adds the rest.

---

## Request

`GET /profile/activity-timeline?limit=&offset=&type=`

- **Auth:** `RequireAuth`, any role. The caller's **own** activity only — no path parameter, no way to see anyone else's (same as the rest of `/profile`).
- `limit` / `offset` — the API's usual pagination (`README.md#pagination`): out-of-range or non-numeric values are clamped to a default, not rejected. Suggested default `limit` 25, max 100.
- `type` (optional) — one of the event types below to show only that kind; unknown value → `400 {"error":"type must be one of: …"}`. Absent = everything.

## Response — `200 OK`, an array, newest first (by `occurred_at`), possibly empty

```json
[
  {
    "id": "incident_report:4e5f6a7b-...",
    "type": "incident_report",
    "occurred_at": "2026-09-20T06:00:00Z",
    "subject_id": "4e5f6a7b-...",
    "detail": { "category": "flooding", "status": "verified" }
  },
  {
    "id": "incident_vote:9a8b7c6d-...",
    "type": "incident_vote",
    "occurred_at": "2026-09-19T17:12:00Z",
    "subject_id": "4e5f6a7b-...",
    "detail": { "vote_type": "upvote" }
  }
]
```

- `id` — `"<type>:<source row id>"`, unique and stable, so a client can key a list on it and dedupe across pages.
- `type` — one of the values in the table below.
- `occurred_at` — RFC3339, the source row's own timestamp (the "when").
- `subject_id` — the id of the thing the event is *about*, so the screen can link to it (an incident report, an aid request, a missing person, a campaign, a place). Always present.
- `detail` — a small object of the few facts the screen wants to print, **structured, not prose** (the web app is going to Urdu and Sindhi, so the client builds the sentence). The keys per type are below; an unknown key must be ignored by the client, so adding one later is safe.
- Nothing about anyone else is included: no other account's id, name or email.

| `type` | Source (`created_at` unless noted) | `subject_id` | `detail` |
|---|---|---|---|
| `incident_report` | `incident_reports` where `reporter_account_id` = caller | the report | `category`, `status` |
| `incident_vote` | `incident_report_votes` where `account_id` = caller | the report voted on | `vote_type` |
| `aid_request` | `aid_requests` where `requester_account_id` = caller | the request | `category`, `severity`, `status` |
| `donation` | `donations` where `donor_account_id` = caller (`collected_at`) | the campaign (`campaign_id`) | `amount`, `status` |
| `status_report` | `essential_location_status_reports` where `reported_by_account_id` = caller | the place (`essential_location_id`, or `shelter_id`) | `status` |
| `missing_person_report` | `missing_persons` where `reported_by_account_id` = caller | the missing person | `status` |
| `missing_person_sighting` | `missing_person_sightings` where `reported_by_account_id` = caller | the missing person | — |

Not in this first cut (the tables aren't there yet): `messages` — the roadmap's "interactions" — once Communication ships. Adding a type later is additive.

## Responses

| Condition | Status | Body |
|---|---|---|
| Success (including no activity at all) | `200` | the array above, `[]` when there's nothing |
| `type` not one of the values | `400` | `{"error":"type must be one of: incident_report, incident_vote, aid_request, donation, status_report, missing_person_report, missing_person_sighting"}` |
| Not signed in | `401` | the usual |

An account with no activity is `[]`, never a `404` (the API's "filter routes don't 404" convention).

## Notes on the build

- **A read composition, not a write path** — one `UNION ALL` over the seven sources filtered by the caller's id, ordered by `occurred_at DESC`, with `LIMIT`/`OFFSET` applied after the union. Every source already has an index on its account column or is small.
- **Deletions and privacy.** An event about something since deleted or hidden still appears (the caller did it) but the client may find `subject_id` no longer opens; that is fine.
- **Ties** — two events with the same `occurred_at` should order by `id` so paging is stable.

## What the web screen does once this ships

A vertical timeline in the Profile sub-nav: each event as an icon, a sentence built from `type` + `detail` ("You reported a flood · verified"), the time, and a link to the subject where its screen exists (incident detail, aid request, missing person, campaign, shelter). Filter chips by type, "Load more" over `limit`/`offset`, and an empty state. Links to screens that aren't built yet stay plain text until they are.

## Tests worth adding on your side

- Only the caller's events, across all seven sources; another account's rows never appear.
- Newest first, stable ordering on ties, `limit`/`offset` paging with no repeats or gaps.
- `type=` filters to one kind; an unknown `type` is `400`; a new account gets `[]`.
