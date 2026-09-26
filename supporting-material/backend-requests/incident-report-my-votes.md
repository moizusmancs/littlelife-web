# Backend request — `GET /incident-reports/my-votes` (which way did I vote?)

**From:** the web frontend (Phase 5, Community Feed and Incident Detail) · **Status:** ✅ **built 2026-09-26**, to this contract, on the backend's `feature-report-my-votes` branch (not yet committed there) · **Touches:** `internal/community` (the votes repository already has everything needed)

> **As built** (probed against the running server on :8080, 2026-09-26, with a throwaway account voting only on its own test reports). Everything below behaves as written: `[]` with no votes; every vote, newest first; `ids` narrowing, an unknown id left out; a switched vote returned once as the new type; a removed vote absent; 100 ids `200`, 101 ids `400 "at most 100 ids"`; a malformed id `400 "ids must be comma-separated uuids"`; no token `401`. Choices the contract left open, made by the backend: an **empty `ids=` returns `[]`** (not every vote), and `created_at` is **always UTC** (`…Z`). Found by probing: spaces after the commas are tolerated, but **a trailing comma is `400`** — the web client never sends an empty or trailing list. No migration was needed (000016's `account_id` index serves it). The backend's `docs/api/07-community-intelligence.md` now documents the route and is the authoritative description; this file is kept as the request that led to it.
>
> **Wired in the web app the same day:** the Community Feed reads one unfiltered `GET /incident-reports/my-votes` per account (cached; a citizen's own votes are few) rather than per-page `ids`, and shows Upvote / Downvote with the caller's vote pressed.

The Community Feed and Incident Detail designs (`WEB_DESIGN_PLAN.md` §6.2 — "Upvote / Downvote (inline on card)", and the detail's large pair) draw the caller's own vote as a **pressed** button, and a second press on it takes the vote back. The API can **cast** (`POST /incident-reports/{id}/votes`, an upsert) and **remove** (`DELETE …/votes`) a vote, but nothing **reads** one back: `GET /incident-reports` is public and carries only the two totals, and there is no `GET …/votes`. So a client cannot tell whether the person looking at a card has voted, or which way — after a reload, on a second device, or for a vote cast yesterday. Without it a vote button can only fire blind (the caller can't see or undo what they did), so the web screens show the totals read-only until this exists. Decided with the project owner on 2026-09-26: wait for the route rather than guess from browser storage.

Verified on the running server (2026-09-26) before writing this: upvote → `1/0`, the same upvote again → still `1/0`, a downvote → `0/1`, `DELETE` → `0/0` and a second `DELETE` → `204`; `DELETE` on an unknown report is also `204` (not `404`); voting on a `rejected` report is allowed; no route returns the caller's vote.

---

## Request

`GET /incident-reports/my-votes?ids=`

- **Auth:** `RequireAuth`, any role (whoever can vote can read their own votes). Only the **caller's own** votes — never anyone else's.
- `ids` (optional) — a comma-separated list of report ids, to ask about just the cards on screen. Absent = every vote the caller has cast. A malformed id → `400 {"error":"ids must be comma-separated uuids"}`. Suggested cap: 100 ids (`400 {"error":"at most 100 ids"}` over it).
- Must be registered **before** `/incident-reports/{id}/…` routes if the router would otherwise read `my-votes` as an `{id}` (or put it at `/incident-report-votes/mine` — any path is fine, tell me which).

## Response — `200 OK`, an array, possibly empty

```json
[
  { "incident_report_id": "032a2312-9d62-eed2-5c25-04dc761a4fa5", "vote_type": "upvote",   "created_at": "2026-09-26T11:00:31Z" },
  { "incident_report_id": "d0acfd23-e5e0-5d91-16d0-e5fffc53d74e", "vote_type": "downvote", "created_at": "2026-09-25T08:14:02Z" }
]
```

- One entry per report the caller has a vote on (the `UNIQUE(incident_report_id, account_id)` already guarantees at most one). A report with no vote from the caller is simply absent.
- An id in `ids` that is unknown or not voted on is absent, not an error ("filter routes don't 404").
- `vote_type` is `upvote` / `downvote`, the same values `POST …/votes` takes.

## Responses

| Condition | Status | Body |
|---|---|---|
| Success (including no votes) | `200` | the array above, `[]` when none |
| Not signed in | `401` | the usual |
| `ids` present but not comma-separated UUIDs | `400` | `{"error":"ids must be comma-separated uuids"}` |
| More than 100 ids | `400` | `{"error":"at most 100 ids"}` |

## Notes on the build

- One query on `incident_report_votes` filtered by `account_id` (and `incident_report_id = ANY($2)` when `ids` is given). The table's unique constraint on `(incident_report_id, account_id)` already gives an index that serves the `ids` form; the unfiltered form wants an index on `account_id` (migration 000016 may already have added one for the activity timeline — check).
- **Alternative, if you prefer it:** a `my_vote` key (`"upvote"` / `"downvote"`, omitted when none) on every report in `GET /incident-reports` when a valid bearer token is sent. That route is public today, so it would need an *optional-auth* middleware (read the token if present, never refuse without one). The separate route above avoids touching the public route and its caching, which is why it is the first choice.
- Nothing else changes: `POST` and `DELETE …/votes` stay as they are.

## What the web screens do once this ships

- **Community Feed** (`/app/community`): after a page of cards loads, one `GET …/my-votes?ids=<those cards>` (or one unfiltered call, cached per account); each card's up/down buttons then show the caller's vote as pressed. Pressing the other side sends `POST` (switch); pressing the pressed side sends `DELETE` (take it back); pressing an unpressed pair sends `POST`. The totals and the pressed state update at once and are corrected from the server's answer; a refusal puts them back and shows the server's words.
- **Incident Detail** (`/app/community/:id`): the same, for one report, with the large buttons.
- The web client keeps nothing in browser storage for this — the route is the only source of truth.

## Tests worth adding on your side

- A caller with no votes → `[]`; with votes on three reports → three entries with the right `vote_type`.
- A vote switched (upvote → downvote) is returned as `downvote`, once; a removed vote is absent.
- Another account's votes on the same reports are never returned.
- `ids` narrows the result; an unknown id in `ids` is absent, not an error; a malformed id and 101 ids are `400`.
- No token → `401`.
