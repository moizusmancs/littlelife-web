# Backend request — names in safety connections, and invite by email

**From:** the web frontend (Phase 4, Safety Groups) · **Status:** ✅ **built 2026-09-25** (migration 000015) — with one deliberate deviation, below · **Touches:** `internal/trust` only (plus one migration for §3)

> **As built.** §1–§3 shipped as written, plus: the requester never sees the recipient's name or email until they accept (not even after a decline) — account ids are public, so returning the recipient's email to whoever sends a request by id would let any signed-in user turn an id into an address; and only *active citizens* can be invited. Account enumeration via the `404` is not rate-limited. The backend's own `06-trust.md` is now the authoritative description; this file is kept as the request that led to it.

Today `GET /safety-connections` returns account ids and nothing else, and `POST /safety-connections` only accepts a raw
account UUID. The web screen has to call every person "Member 8D0D395C" and ask people to paste UUIDs at each other.
Two additive changes fix that. Nothing here breaks the current mobile/web contract.

---

## 1. Say who the other person is — extra fields on every connection object

Add four fields to the connection object returned by `GET /safety-connections`, `POST /safety-connections` and
`PATCH …/accept|decline` (same shape everywhere, as today):

```json
{
  "id": "3d4e5f6a-…",
  "requester_account_id": "48434d1b-…",
  "requester_name": "Amna Khan",
  "requester_email": "amna@example.com",
  "recipient_account_id": "086fa55a-…",
  "recipient_name": "Bilal Rehman",
  "recipient_email": "bilal@example.com",
  "connection_type": "family",
  "status": "pending",
  "created_at": "…", "responded_at": "…", "updated_at": "…"
}
```

- `*_name` is `profiles.name` for that account. It is `""` when the person hasn't set one (the documented "not yet set"
  state in `05-profiling.md`) — always present, never omitted, so the client only handles one shape.
- `*_email` is `accounts.email`, always present.
- Both parties are already in the row, so this is one `JOIN accounts` + `JOIN profiles` in `ListForAccount` /
  `FindByID` (or two lookups after the list is fetched).

**Decision for you — a stranger's email before they're accepted.** As written, the recipient of a pending request sees
the requester's email. That is normally what you want ("Amna Khan · amna@example.com wants to connect"), but if you'd
rather not show it until accepted, return `requester_email: ""` to the recipient while `status = 'pending'`. The web
screen falls back to name → email → "Member XXXXXXXX", so either choice works without a frontend change.

## 2. Invite by email — `recipient_email` as an alternative to `recipient_account_id`

`POST /safety-connections` request:

```json
{ "recipient_email": "bilal@example.com", "connection_type": "family" }
```

Exactly one of `recipient_account_id` / `recipient_email` must be given.

| Condition | Status | Body |
|---|---|---|
| Neither field given | `400` | `{"error":"one of recipient_account_id or recipient_email is required"}` |
| Both given | `400` | `{"error":"send either recipient_account_id or recipient_email, not both"}` |
| `recipient_email` not an email | `400` | `{"error":"recipient_email must be a valid email"}` |
| The email is the caller's own | `400` | `{"error":"cannot send a safety connection request to yourself"}` (existing) |
| No such account | `404` | `{"error":"recipient account not found"}` (existing message — the frontend already shows it) |
| Everything else | as today (`201`, `409` duplicate pending, …) | |

Matching: trim and lowercase the email; `lower(email) = lower($1) AND deleted_at IS NULL` — the same lookup the volunteer
invitation route (`POST /ngo/volunteers/invitations`) already does. The response is the connection object from §1.

**Who may be invited (closes a gap found while probing).** Today the only check is that the id exists — an unverified,
suspended or NGO/admin account is a valid recipient. Suggested rule for *both* the id and email forms: the recipient must be
an **active citizen** (`role = 'user'`, `status = 'active'`), otherwise `404 "recipient account not found"` (the same
message, so it doesn't reveal *why*). Your call whether unverified counts; the frontend needs no change either way.

**Account enumeration.** Any signed-in citizen could probe whether an email is registered (`404` vs `201`). The volunteer
route has the same property but is NGO-admin-only. The usual mitigations are a per-caller rate limit on this route, or
answering `201` for an unknown email and simply not creating anything (the UX cost: a typo looks like success). The web
screen assumes the `404` behaviour above; say if you choose the other one and it will change its wording.

## 3. (Recommended) refuse the duplicates the database currently allows

`06-trust.md` says a pending request "in either direction" is a `409`. Probing the real API shows it is only the *same*
direction: the unique index is on the ordered pair, only while `pending`. So today all of these succeed:

- A→B pending **and** B→A pending (a crossed pair);
- a new A→B request after A→B was already `accepted`.

Suggested rules (`409` with a clear message):

- a request while an **accepted** connection exists between the two, either direction —
  `{"error":"you are already connected to this person"}`;
- a request while a **pending** one exists in the *reverse* direction —
  `{"error":"this person has already sent you a request"}`.

Enforce with a partial unique index on the unordered pair, e.g.
`CREATE UNIQUE INDEX … ON safety_connections (LEAST(requester_account_id, recipient_account_id), GREATEST(requester_account_id, recipient_account_id)) WHERE status IN ('pending','accepted')`
(this also subsumes the existing ordered-pair index). A `declined` row stays outside it, so asking again after a decline
still works. **The web screen already checks both cases from its loaded list and refuses before sending**, so this is a
safety net for other clients (and for a stale page), not a blocker.

---

## What the web screen does once this ships

- Everyone is shown by `name`, falling back to `email`, falling back to "Member XXXXXXXX" — rows, detail page, notices, dialogs.
- The Invite dialog asks for an **email** (with "Use a Member ID instead" underneath, since the id path still works); an
  unknown email shows the server's `recipient account not found`.
- "Your Member ID" stays on the page as the fallback, no longer the headline.
- No other behaviour changes.

## Tests worth adding on your side

- `GET /safety-connections` returns both parties' name/email, with `""` for an unset name, on all four routes that return a connection.
- Invite by email: mixed case and padded email resolves; unknown → `404`; own email → `400`; both/neither field → `400`; id form still works.
- (§3) accepted-then-request → `409`; reverse-pending → `409`; declined-then-request → `201`.
