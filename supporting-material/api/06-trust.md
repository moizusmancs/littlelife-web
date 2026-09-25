# Phase 6 — Trust (`internal/trust`)

Read [README.md](README.md) first for base URL, auth header, error shape, and `PATCH` semantics.

Trust owns three independent concepts: **safety connections** (a citizen's family/safety-group
relationships, plus a live GPS-sharing WebSocket for those connections), **trust scores** (a
maintained reputation number — this module only *reads* it; nothing here writes it yet, see the
note below), and **moderation actions** (an admin-only, append-only enforcement history, distinct
from `accounts.status`).

| Group | Base path | Middleware |
|---|---|---|
| safety connections (REST) | `/safety-connections` | `RequireAuth` — any authenticated citizen |
| live GPS relay | `/ws/safety-connections/location` | its own in-handler auth (see the WS section — **not** `RequireAuth` middleware) |
| trust score (own) | `/trust-score` | `RequireAuth` |
| trust score (any account) | `/accounts/{id}/trust-score` | `RequireAuth`, `RequireRole("ngo_admin", "ngo_volunteer", "admin", "super_admin")` |
| moderation actions | `/admin/accounts/{id}/moderation-actions` | `RequireAuth`, `RequireRole("admin", "super_admin")` |

**Trust scores have no write path yet.** The `credibility_events` table that's meant to feed this
number (community-report verification/rejection, etc.) is a later phase, not built as of this
document. Every account's trust score is `0` today, always — the two `GET` routes below are fully
functional and safe to integrate against now, they just won't return anything other than `0` until
that later phase ships.

---

## FE-5 (M1) — Family/safety group connections + live GPS during active emergencies

**What it covers:** requesting (by email or by member id), accepting/declining, listing, and removing a
family/safety-group relationship with another account, plus a WebSocket that relays a tracked
citizen's live GPS position to everyone in an **accepted** connection with them.

**Routes:** `POST /safety-connections`, `GET /safety-connections`,
`PATCH /safety-connections/{id}/accept`, `PATCH /safety-connections/{id}/decline`,
`DELETE /safety-connections/{id}`, `WS /ws/safety-connections/location`.

### The connection object, and who sees whom

Every route that returns a connection (`POST`, `GET`, and both `PATCH`es) returns the **same shape**:

```json
{
  "id": "3d4e5f6a-...",
  "requester_account_id": "48434d1b-...",
  "requester_name": "Amna Khan",
  "requester_email": "amna@example.com",
  "recipient_account_id": "086fa55a-...",
  "recipient_name": "Bilal Rehman",
  "recipient_email": "bilal@example.com",
  "connection_type": "family",
  "status": "accepted",
  "created_at": "2026-09-20T06:00:00Z",
  "responded_at": "2026-09-20T06:05:00Z",
  "updated_at": "2026-09-20T06:05:00Z"
}
```
The four `requester_*` / `recipient_*` name and email fields are **always present, never omitted** — so
a client handles one shape. They are `""` when the person hasn't set a name yet (the "not yet set" state
in [05-profiling.md](05-profiling.md)), when the person's account no longer exists, or when **you aren't
allowed to see them yet**. `responded_at` is omitted while the connection is still `pending`.

**Who sees whom.** A stranger's name and email are not shown to just anyone:

| Status | You are the… | Requester's name / email | Recipient's name / email |
|---|---|---|---|
| `pending` | **recipient** (you were asked) | ✅ shown — you need it to decide | ✅ yours |
| `pending` | **requester** (you asked) | ✅ yours | ❌ `""` / `""` |
| `declined` | recipient | ✅ | ✅ yours |
| `declined` | requester | ✅ yours | ❌ `""` / `""` |
| `accepted` | either | ✅ | ✅ |

**Why the requester can't see the recipient until they accept:** account ids are *not* secret — public
incident reports, community updates and missing-person reports all carry them. If sending a request by id
returned the recipient's email, anyone signed in could turn a public id into someone's email address. So the
person being asked sees who is asking, and the person who asked learns nothing about them until they say yes.

**Frontend handling:** show each person by `name`, falling back to `email`, falling back to
"Member XXXXXXXX" (the first 8 characters of the account id). An *outgoing pending* request will therefore
show the fallback — you know who you asked, so if you want to show the email you typed, keep it in your own
state.

---

### `POST /safety-connections`

**Auth required:** Yes.

**Request** — name the recipient by **email** *or* by **account id** (exactly one of the two):
```json
{ "recipient_email": "bilal@example.com", "connection_type": "family" }
```
```json
{ "recipient_account_id": "48434d1b-...", "connection_type": "family" }
```
- `recipient_email` — trimmed and matched case-insensitively against registered accounts (`  Bilal@Example.com ` finds `bilal@example.com`).
- `recipient_account_id` — the account's UUID (its "Member ID"). The original form; it still works exactly as before.
- `connection_type` — `family` or `safety_group`.

**Who can be invited.** The recipient must be an **active citizen** (`role` `user`, `status` `active`). NGO
staff, admins, and accounts that are unverified, suspended, deactivated or deleted **cannot** — and you get
the **same** `404 recipient account not found` for all of those as for an account that doesn't exist, so the
response never says why. This gates *new* requests only; existing connections are unaffected.

**Behavior**

Creates a `pending` request — the requester is always the caller's own account (from the JWT).

**There is at most one live relationship between any two people, whichever way round it was asked.** A
request is refused (`409`) while a `pending` or `accepted` connection already exists between the two accounts
in *either* direction. A `declined` request doesn't count, so asking again after a decline works. This is
enforced by the database itself (a unique index over the unordered pair), not just by a check.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | the connection object (see above) — `responded_at` omitted |
| `connection_type` missing, or a field has the wrong JSON type | `400` | bind-failure shape |
| Neither `recipient_account_id` nor `recipient_email` given (missing, `""`, or whitespace) | `400` | `{"error":"one of recipient_account_id or recipient_email is required"}` |
| Both given | `400` | `{"error":"send either recipient_account_id or recipient_email, not both"}` |
| `recipient_email` not an email | `400` | `{"error":"recipient_email must be a valid email"}` |
| `recipient_account_id` not a valid UUID | `400` | `{"error":"recipient_account_id must be a valid uuid"}` |
| `connection_type` not `family`/`safety_group` | `400` | `{"error":"connection_type must be one of: family, safety_group"}` |
| The recipient is yourself (your own id **or** your own email, any case) | `400` | `{"error":"cannot send a safety connection request to yourself"}` |
| No such account, **or** it isn't an active citizen (see above) | `404` | `{"error":"recipient account not found"}` |
| You already sent this person a pending request | `409 Conflict` | `{"error":"a pending connection request already exists between these two accounts"}` |
| This person already sent **you** a pending request | `409 Conflict` | `{"error":"this person has already sent you a request"}` |
| You are already connected (`accepted`, either direction) | `409 Conflict` | `{"error":"you are already connected to this person"}` |
| Two requests between the same pair landed at the same instant and this one lost | `409 Conflict` | `{"error":"a connection or pending request already exists between you and this person"}` |

Request problems that can be judged without looking anyone up (malformed body, both/neither field, a bad
email, a bad `connection_type`) are always a `400` — they never reveal whether an account exists.

**Frontend handling**
- Prefer the email form; the `409` messages are written to be shown to a person as they are.
- **A `404` on an email is the only signal that it isn't registered as an active citizen** — anyone signed in
  can probe for that, and there is no rate limit on this route today. Treat "recipient account not found"
  as "we couldn't find an active member with that email".
- The requester does **not** get the recipient's name or email back (see the table above) — the `201`
  shows `recipient_name`/`recipient_email` as `""`.

---

### `GET /safety-connections`

**Auth required:** Yes.

**Behavior**

Returns **every** connection the caller is party to, on **either** side (sent or received), **any**
status (`pending`/`accepted`/`declined`), newest first. **Direction is not labeled in the
response** — determine whether the caller sent or received a given connection by comparing
`requester_account_id`/`recipient_account_id` against the caller's own account ID client-side.

Each entry carries the people's names and emails **as far as the caller may see them** — see
[the connection object, and who sees whom](#the-connection-object-and-who-sees-whom). The lookup is
one batched query for the whole list, however long it is.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (authenticated) | `200 OK` | array, possibly empty, same shape as `POST`'s response |

`responded_at` is present (non-omitted) for any connection that has actually been accepted or
declined, and absent for one still pending.

---

### `PATCH /safety-connections/{id}/accept`

**Auth required:** Yes. **Only the recipient** of the request may accept it — this is checked as
an ownership rule, not just authentication.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated connection object — now `accepted`, so **both** people's names and emails are visible |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No connection with that ID | `404` | `{"error":"safety connection not found"}` |
| Connection exists, but caller is the **requester**, not the recipient | `403` | `{"error":"only the recipient can accept or decline this connection"}` |
| Connection is not currently `pending` (already accepted/declined) | `409 Conflict` | `{"error":"connection is not pending"}` |

**Frontend handling:** note the 403 here is deliberately **not** the same error a totally
unrelated third party would get for probing a connection they have no part in at all — accessing a
connection your account isn't involved in *at all* also surfaces via this same route as this 403
(the check is simply "is the caller the recipient," which a non-party naturally fails too) — the
response body doesn't distinguish "you're the wrong party" from "you're the requester, not the
recipient." Both are `403 {"error":"only the recipient can accept or decline this connection"}`.

---

### `PATCH /safety-connections/{id}/decline`

**Auth required:** Yes. Same recipient-only ownership rule as accept.

**Responses** — identical shape to `accept`, substituting "declined" for "accepted" in the success
body's `status`.

| Condition | Status | Body |
|---|---|---|
| Success | `200 OK` | the updated connection object, `status: "declined"` (the person who declined still sees who asked; the requester still sees nothing about them) |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No connection with that ID | `404` | `{"error":"safety connection not found"}` |
| Caller is the requester, not the recipient (or unrelated) | `403` | `{"error":"only the recipient can accept or decline this connection"}` |
| Connection is not currently `pending` | `409 Conflict` | `{"error":"connection is not pending"}` |

---

### `DELETE /safety-connections/{id}`

**Auth required:** Yes. **Unlike accept/decline, EITHER party may call this** — the requester
cancelling their own still-pending request, or either side severing an already-accepted
connection.

**Behavior**

A real deletion, not a status transition — there is no "removed"/"deleted" value in the connection
status enum. Works at **any** status (pending, accepted, or declined) — nothing is protected from
deletion.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | **`204 No Content`** | *(empty)* |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| No connection with that ID | `404` | `{"error":"safety connection not found"}` |
| Caller is neither the requester nor the recipient | `403` | `{"error":"this safety connection does not involve your account"}` |

---

### `WS /ws/safety-connections/location`

**This is a WebSocket, not a REST route** — the request/response table format above doesn't apply.
Documented here as a protocol instead.

**⚠️ Current known limitation, stated plainly: live tracking is gated behind "is there an active
alert for this account," but that check is a stub that always answers "yes" today** — the real
Alerting module this depends on doesn't exist yet. In practice, this means the gate below never
actually blocks anyone right now; treat the `403` case in the table as documented future/intended
behavior, not something you can currently trigger through normal use.

**Connecting (the HTTP upgrade request):**

- **Auth**: a JWT access token, supplied **either** as a normal `Authorization: Bearer <token>`
  header (works for native/mobile clients that can set custom headers on a WS upgrade) **or** as a
  `?token=<token>` query parameter (required for browser clients — the browser `WebSocket` API
  cannot set custom headers at all). If both are present, the header wins.
- Both the token check and the active-alert gate run **before** the WebSocket upgrade completes —
  a rejected client gets a normal HTTP JSON error response, never a socket that opens and then
  immediately closes.

| Rejection condition | HTTP status (on the upgrade request) | Body |
|---|---|---|
| No token in either the header or `?token=` | `401` | `{"error":"missing token"}` |
| Token present but invalid/expired | `401` | `{"error":"invalid or expired token"}` |
| Token valid, but tracking isn't currently allowed for this account (the gate — see the limitation note above) | `403` | `{"error":"live location tracking is only available during an active alert"}` |

**Once connected**, the client sends one JSON text frame per GPS update:
```json
{ "lat": 24.86, "lng": 67.05 }
```
No envelope, no message-type field — every inbound frame is assumed to be a location ping.

**What happens server-side per ping:**
1. Coordinates are validated (`-90..90` lat, `-180..180` lng). **An out-of-range ping is silently
   dropped** — the connection stays open, nothing is relayed, no error frame is sent back to the
   sender. There is no acknowledgment protocol on this socket at all.
2. **A frame that isn't valid JSON is also silently dropped**, same as an out-of-range coordinate —
   only a genuine network-level disconnect closes the connection. A client-side bug that sends
   garbage will not get any error back; if pings aren't reaching viewers, check your own outgoing
   payload shape first.
3. The ping is durably buffered (Redis Streams) for eventual persistence to a location trail (a
   throttled write — roughly one row per 30 seconds **or** 50 meters of actual movement per
   account, whichever comes first; a stationary account pinging once a second does **not** produce
   a database row once a second). **This durable trail is not exposed through any route in this
   API** — it exists for a future "where did this person last go" recovery feature, not something
   a frontend can query today.
4. The server resolves every account with an **`accepted`** safety-connection involving the
   tracker (either direction) and relays the ping to each one that's currently connected to this
   same WebSocket endpoint. **A `pending` or `declined` connection never receives live location
   data** — only `accepted` ones do.

**What a viewer receives** (one JSON text frame per relayed ping):
```json
{ "account_id": "48434d1b-...", "lat": 24.86, "lng": 67.05, "recorded_at": "2026-09-20T06:00:00.123Z" }
```
`account_id` identifies **who is being tracked** — a single viewer connection can receive pings
from multiple trackers interleaved on the same socket (anyone who has an accepted connection with
the viewer), so always read this field rather than assuming a single-tracker session.

**Frontend handling:**
- There is no "list of who is currently tracking me" or "who am I currently viewing" query on this
  socket — that has to be derived client-side from `GET /safety-connections`'s own `status:
  "accepted"` entries.
- Reconnection is entirely your responsibility — there is no session resumption; if the socket
  drops, re-run the full auth+upgrade handshake from scratch.
- Because a viewer only receives pings from a tracker while **both** are connected to this
  endpoint at the same moment, a viewer who wants to watch a family member's live location needs
  their own open WebSocket connection too — this is a live relay, not a queue that delivers missed
  pings on reconnect.

---

## FE-6 (M1) — Trust score (own)

**Routes:** `GET /trust-score`.

### `GET /trust-score`

**Auth required:** Yes. Always the **caller's own** score.

**Behavior**

**An account never gets a `404` here, even one that's never had any trust-related activity at
all** — the absence of a stored row is treated as an implicit score of `0`, not a missing
resource. See the module-level note above: every score is `0` today regardless, since nothing
writes to this yet.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (authenticated) | `200 OK` | see shape below |

```json
{ "account_id": "48434d1b-...", "score": 0 }
```
**`updated_at` is omitted entirely** for an account with no real, persisted score row (i.e.
currently, every account) — rather than serializing a misleading "updated at year 1" zero-time. It
will start appearing once a real write path exists and actually updates a row.

---

## FE-10 (M1) — NGOs/admins view any citizen's credibility score

**Routes:** `GET /accounts/{id}/trust-score`.

### `GET /accounts/{id}/trust-score`

**Auth required:** Yes, role `ngo_admin`, `ngo_volunteer`, `admin`, or `super_admin` — a read, not
a moderation action, so both NGO staff roles get it, not just `ngo_admin`.

**Behavior**

Identical read logic to `GET /trust-score` — the only difference is `{id}` can be **any** account,
not just the caller's own. **A syntactically valid but genuinely nonexistent target account ID
also returns `score: 0`, not a `404`** — same "absence isn't an error" philosophy as the
self-service route; there is no separate existence check against the accounts table for this read.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (correctly authorized) | `200 OK` | same shape as `GET /trust-score`, for the target `{id}` |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| Caller role isn't one of the four allowed | `403` | `{"error":"insufficient permissions"}` |

Also reused as-is for **M8 FE-7**'s credibility-score half (an incident-report overlay showing the
reporter's credibility) — same route, same response, just a different consumer context.

---

## FE-12 (partial, M1) — Fraud/violation-handling (moderation actions)

**What it covers:** an admin-only, append-only log of individual enforcement decisions against an
account — **deliberately not the same thing as `accounts.status`**
([documented in Identity](00-identity.md#patch-adminaccountsidstatus)). Recording a `suspend` or
`block` action here does **not** itself suspend the account — if you want both effects (a logged
reason *and* the account actually locked out), you must call both routes; an admin UI should almost
always do both together in practice, but the backend will not do it for you.

**Routes:** `POST /admin/accounts/{id}/moderation-actions`,
`GET /admin/accounts/{id}/moderation-actions`.

### `POST /admin/accounts/{id}/moderation-actions`

**Auth required:** Yes, role `admin` or `super_admin` — unlike trust-score viewing, this is not
NGO-scoped at all.

**Request**
```json
{ "action_type": "warn", "reason": "Repeated false incident reports." }
```
`action_type` is one of `warn`/`suspend`/`block`/`unblock`. `reason` is required, non-blank.

**Behavior**

`performed_by` is always the calling admin's own account (from the JWT), never client-supplied. An
admin **cannot** record a moderation action against their own account.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Success | `201 Created` | see shape below |
| `id` (path, target account) not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |
| `action_type`/`reason` missing | `400` | bind-failure shape |
| `action_type` not one of the four values | `400` | `{"error":"action_type must be one of: warn, suspend, block, unblock"}` |
| `reason` blank/whitespace-only | `400` | `{"error":"reason is required"}` |
| Target account ID is the calling admin's own account | `400` | `{"error":"cannot record a moderation action against your own account"}` |
| `id` well-formed but no such account exists | `404` | `{"error":"target account not found"}` |

```json
{
  "id": "4e5f6a7b-...",
  "target_account_id": "086fa55a-...",
  "action_type": "warn",
  "reason": "Repeated false incident reports.",
  "performed_by": "4ac58f97-...",
  "created_at": "2026-09-20T06:00:00Z"
}
```

---

### `GET /admin/accounts/{id}/moderation-actions`

**Auth required:** Yes, role `admin` or `super_admin`.

**Behavior**

**Never 404s** — same "filter routes don't 404" convention used throughout this API. A target with
zero recorded actions (or one that doesn't exist at all) both return `[]`, indistinguishably.

**Responses**

| Condition | Status | Body |
|---|---|---|
| Always (correctly authorized, `id` well-formed) | `200 OK` | array, possibly empty, newest first |
| `id` not a valid UUID | `400` | `{"error":"id must be a valid uuid"}` |

---

## FE-3 (M11) — Share live GPS during active navigation

No new route. Reuses the exact same `WS /ws/safety-connections/location` documented above — the
relay logic is generic (it delivers to every accepted safety-connection member regardless of *why*
the tracker is sending pings), so navigating toward a shelter and simply being tracked during an
emergency share one implementation. The same current limitation applies here too: the "only during
an active alert" gate is currently a stub that always allows, so this route is not yet genuinely
gate-enforced for either use case.
