import { execFileSync } from 'node:child_process'

/**
 * Test-data seeding straight into the local Postgres (the docker-compose container), used only
 * where the API alone can't get a test into the state it needs. Two constraints are deliberate:
 *
 * - Rows only, and only in tables that already exist — never schema changes, never backend code.
 * - Every write is guarded to test-owned rows: accounts whose email starts `e2e-`, NGOs whose
 *   name starts `E2E `. A typo can never touch a real account or NGO.
 *
 * What this unlocks: the debug-hook technique (`window.__authStore`, see profile-edit.spec.ts)
 * only fools *frontend* guards, so routes that check verification server-side (`RequireVerified`)
 * couldn't be reached for real. Marking a freshly-registered e2e account verified in the database
 * *before* it logs in means the login mints a genuinely verified access token — the whole flow
 * after that runs with no spoofing and no stubbed responses.
 *
 * Override the container name with E2E_PG_CONTAINER if yours differs.
 */
const CONTAINER = process.env.E2E_PG_CONTAINER ?? 'littlelife_postgres'

function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', 'littlelife', '-d', 'littlelife', '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

const lit = (value: string) => `'${value.replace(/'/g, "''")}'`

function assertE2eEmail(email: string) {
  if (!email.startsWith('e2e-')) throw new Error(`seed helper refuses a non-test email: ${email}`)
}

/** Marks a registered `e2e-` account verified + active and gives it a profile name, so a fresh
 *  login is a genuinely verified, fully onboarded session (lands on /app/home, no onboarding). */
export function verifyAndOnboardAccount(email: string, name: string): string {
  assertE2eEmail(email)
  const id = psql(`
    WITH acct AS (
      UPDATE accounts SET email_verified = true, status = 'active', updated_at = now()
      WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
      RETURNING id
    )
    UPDATE profiles SET name = ${lit(name)}, updated_at = now()
    WHERE account_id IN (SELECT id FROM acct)
    RETURNING account_id`)
  if (!id) throw new Error(`no account found to verify for ${email}`)
  return id
}

export interface SeededInvitation {
  invitationId: string
  ngoName: string
}

/** Seeds an active `E2E …` NGO (with its own throwaway `e2e-` admin) and a pending volunteer
 *  invitation from it addressed to `invitedEmail` (an existing `e2e-` account). */
export function seedPendingInvitation(invitedEmail: string, ngoName: string): SeededInvitation {
  assertE2eEmail(invitedEmail)
  if (!ngoName.startsWith('E2E ')) throw new Error(`seed helper refuses a non-test NGO name: ${ngoName}`)

  const founderEmail = `e2e-founder-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  // The founder borrows the invited account's password hash. A NULL hash made every backend query
  // that loaded this account fail (e.g. the admin accounts list), and these rows are never deleted.
  const [founderId, ngoId] = psql(`
    WITH founder AS (
      INSERT INTO accounts (email, password_hash, role, status, email_verified)
      SELECT ${lit(founderEmail)}, invited.password_hash, 'ngo_admin', 'active', true
      FROM accounts invited
      WHERE lower(invited.email) = lower(${lit(invitedEmail)}) AND invited.deleted_at IS NULL
      RETURNING id
    ), ngo AS (
      INSERT INTO ngos (name, status, created_by, approved_by, approved_at)
      SELECT ${lit(ngoName)}, 'active', id, id, now() FROM founder
      RETURNING id
    )
    SELECT (SELECT id FROM founder) || ',' || (SELECT id FROM ngo)`).split(',')
  if (!founderId || !ngoId) throw new Error(`no account found to invite for ${invitedEmail}`)

  const invitationId = psql(`
    WITH link AS (
      UPDATE accounts SET ngo_id = ${lit(ngoId)} WHERE id = ${lit(founderId)} RETURNING id
    )
    INSERT INTO ngo_volunteer_invitations (ngo_id, invited_account_id, invited_by)
    SELECT ${lit(ngoId)}, a.id, ${lit(founderId)}
    FROM accounts a WHERE lower(a.email) = lower(${lit(invitedEmail)})
    RETURNING id`)
  if (!invitationId) throw new Error(`no account found to invite for ${invitedEmail}`)

  return { invitationId, ngoName }
}

/** Simulates something else changing the invitation while a page has it open (e.g. the NGO
 *  withdrawing it, or the user acting from another tab). Only touches `E2E …` NGOs' invitations. */
export function setInvitationStatus(invitationId: string, status: 'pending' | 'accepted' | 'declined') {
  const updated = psql(`
    UPDATE ngo_volunteer_invitations SET status = ${lit(status)}, responded_at = now()
    WHERE id = ${lit(invitationId)} AND ngo_id IN (SELECT id FROM ngos WHERE name LIKE 'E2E %')
    RETURNING id`)
  if (!updated) throw new Error(`no seeded invitation ${invitationId} to update`)
}

/** Read-only: the account's current role and NGO link, to assert a real promotion happened. */
export function readAccountRole(email: string): { role: string; ngoId: string } {
  assertE2eEmail(email)
  const [role, ngoId] = psql(
    `SELECT role || ',' || COALESCE(ngo_id::text, '') FROM accounts WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL`,
  ).split(',')
  return { role, ngoId }
}

/** Turns a registered `e2e-` account into the `ngo_admin` of a brand-new active `E2E …` NGO —
 *  the state a real admin approval would leave it in (NGO `active`, `approved_by` set, account
 *  role + `ngo_id` set) — and marks it verified + onboarded, so a fresh login is a genuine NGO
 *  admin session that lands on `/ngo/dashboard`. Returns the NGO's id. */
export function promoteToNgoAdmin(
  email: string,
  ngoName: string,
  contact: { email?: string; phone?: string } = {},
): string {
  assertE2eEmail(email)
  if (!ngoName.startsWith('E2E ')) throw new Error(`seed helper refuses a non-test NGO name: ${ngoName}`)

  const ngoId = psql(`
    INSERT INTO ngos (name, status, contact_email, contact_phone, created_by, approved_by, approved_at)
    SELECT ${lit(ngoName)}, 'active', NULLIF(${lit(contact.email ?? '')}, ''), NULLIF(${lit(contact.phone ?? '')}, ''), id, id, now()
    FROM accounts WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
    RETURNING id`)
  if (!ngoId) throw new Error(`no account found to make an NGO admin: ${email}`)

  psql(`
    UPDATE accounts SET role = 'ngo_admin', ngo_id = ${lit(ngoId)}, updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL`)
  verifyAndOnboardAccount(email, 'E2E NGO Admin')
  return ngoId
}

/** Makes a registered `e2e-` account an `ngo_volunteer` of an existing `E2E …` NGO (as accepting
 *  an invitation would), verified + onboarded, ready for a genuine login. */
export function promoteToNgoVolunteer(email: string, ngoId: string) {
  assertE2eEmail(email)
  const updated = psql(`
    UPDATE accounts SET role = 'ngo_volunteer', ngo_id = ${lit(ngoId)}, updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
      AND ${lit(ngoId)}::uuid IN (SELECT id FROM ngos WHERE name LIKE 'E2E %')
    RETURNING id`)
  if (!updated) throw new Error(`could not make ${email} a volunteer of ${ngoId} (not an E2E NGO?)`)
  verifyAndOnboardAccount(email, 'E2E Volunteer')
}

/** Read-only: an NGO's stored state, to assert a save/deactivate really reached the database. */
export function readNgo(ngoId: string): { name: string; status: string; contactEmail: string; contactPhone: string } {
  const [name, status, contactEmail, contactPhone] = psql(
    `SELECT name || '|' || status || '|' || COALESCE(contact_email, '') || '|' || COALESCE(contact_phone, '') FROM ngos WHERE id = ${lit(ngoId)}`,
  ).split('|')
  return { name, status, contactEmail, contactPhone }
}

/** Makes a registered `e2e-` account a platform `admin` (verified + onboarded), ready for a
 *  genuine login that lands on `/admin/dashboard`. */
export function promoteToPlatformAdmin(email: string) {
  assertE2eEmail(email)
  const updated = psql(`
    UPDATE accounts SET role = 'admin', updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
    RETURNING id`)
  if (!updated) throw new Error(`no account found to make an admin: ${email}`)
  verifyAndOnboardAccount(email, 'E2E Platform Admin')
}

/** Makes a registered `e2e-` account a `super_admin` (verified + onboarded) — the role above `admin`, for the screens that must treat both alike. */
export function promoteToSuperAdmin(email: string) {
  assertE2eEmail(email)
  const updated = psql(`
    UPDATE accounts SET role = 'super_admin', updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
    RETURNING id`)
  if (!updated) throw new Error(`no account found to make a super admin: ${email}`)
  verifyAndOnboardAccount(email, 'E2E Super Admin')
}

/** Read-only: an account's role, lifecycle status, and whether it's soft-deleted — including
 *  deleted rows, so a delete/deactivate can be asserted against the database itself. */
export function readAccountState(email: string): { role: string; status: string; deleted: boolean } {
  assertE2eEmail(email)
  const [role, status, deleted] = psql(
    `SELECT role || ',' || status || ',' || (deleted_at IS NOT NULL)::text FROM accounts
     WHERE lower(email) = lower(${lit(email)}) ORDER BY created_at DESC LIMIT 1`,
  ).split(',')
  return { role, status, deleted: deleted === 'true' }
}

/** Read-only: the profile name stored for an account. */
export function readProfileName(email: string): string {
  assertE2eEmail(email)
  return psql(
    `SELECT p.name FROM profiles p JOIN accounts a ON a.id = p.account_id
     WHERE lower(a.email) = lower(${lit(email)}) AND a.deleted_at IS NULL`,
  )
}

/** Sets an `e2e-` account's lifecycle status (`active` / `suspended` / `deactivated`), e.g. to put
 *  a volunteer on a roster in a state only a platform admin or the account itself could reach. */
export function setAccountStatus(email: string, status: 'active' | 'suspended' | 'deactivated') {
  assertE2eEmail(email)
  const updated = psql(`
    UPDATE accounts SET status = ${lit(status)}, updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
    RETURNING id`)
  if (!updated) throw new Error(`no account found to set status on: ${email}`)
}

/** Sets an `E2E …` NGO's status straight in the database — e.g. `deactivated` to see how a screen
 *  behaves once the organisation can no longer invite, or `active` to make a pending application look
 *  decided behind an open page's back. Refuses any other NGO. */
export function setNgoStatus(
  ngoId: string,
  status: 'pending_approval' | 'active' | 'suspended' | 'rejected' | 'deactivated',
) {
  const updated = psql(`
    UPDATE ngos SET status = ${lit(status)}, updated_at = now()
    WHERE id = ${lit(ngoId)} AND name LIKE 'E2E %'
    RETURNING id`)
  if (!updated) throw new Error(`no E2E NGO ${ngoId} to set status on`)
}

/** Leaves an `e2e-` `ngo_admin` with no organisation (`ngo_id` NULL) — the state an account is in if its organisation link is ever cleared — so the screens that ask for "my organisation" can be shown what the real API says to it. */
export function detachFromNgo(email: string) {
  assertE2eEmail(email)
  const updated = psql(`
    UPDATE accounts SET ngo_id = NULL, updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL AND role IN ('ngo_admin', 'ngo_volunteer')
    RETURNING id`)
  if (!updated) throw new Error(`no NGO staff account to detach: ${email}`)
}

/** Takes an `e2e-` volunteer off their roster behind an open page's back — what an admin's remove
 *  (or anything else) would do — so a screen showing a stale roster can be provoked for real. */
export function demoteToCitizen(email: string) {
  assertE2eEmail(email)
  const updated = psql(`
    UPDATE accounts SET role = 'user', ngo_id = NULL, updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
    RETURNING id`)
  if (!updated) throw new Error(`no account found to demote: ${email}`)
}

/** Read-only: the status of every volunteer invitation addressed to an `e2e-` account (oldest
 *  first), to assert an invite really reached the database. */
export function readInvitationStatuses(invitedEmail: string): string[] {
  assertE2eEmail(invitedEmail)
  const out = psql(
    `SELECT i.status FROM ngo_volunteer_invitations i JOIN accounts a ON a.id = i.invited_account_id
     WHERE lower(a.email) = lower(${lit(invitedEmail)}) ORDER BY i.created_at`,
  )
  return out === '' ? [] : out.split('\n')
}

/** Read-only: an `e2e-` account's id, for building `/admin/users/:id` URLs. */
export function readAccountId(email: string): string {
  assertE2eEmail(email)
  const id = psql(`SELECT id FROM accounts WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL`)
  if (!id) throw new Error(`no account found for ${email}`)
  return id
}

/** Gives an `e2e-` account a stored credibility score (the row `GET /accounts/{id}/trust-score`
 *  reads; without one the backend reports an implicit, never-scored `0`). */
export function seedTrustScore(email: string, score: number) {
  assertE2eEmail(email)
  const id = psql(`
    INSERT INTO trust_scores (account_id, score)
    SELECT id, ${Math.trunc(score)} FROM accounts WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
    RETURNING id`)
  if (!id) throw new Error(`no account found to score: ${email}`)
}

/** Read-only: the moderation log entries recorded against an `e2e-` account, oldest first, to
 *  assert a log action really reached the database. */
export function readModerationActions(email: string): Array<{ type: string; reason: string }> {
  assertE2eEmail(email)
  const out = psql(`
    SELECT m.action_type || '|' || m.reason FROM moderation_actions m
    JOIN accounts a ON a.id = m.target_account_id
    WHERE lower(a.email) = lower(${lit(email)}) ORDER BY m.created_at`)
  return out === '' ? [] : out.split('\n').map((line) => {
    const [type, ...reason] = line.split('|')
    return { type, reason: reason.join('|') }
  })
}

export type RegionLevel = 'province' | 'district' | 'tehsil'

function assertE2eRegionName(name: string) {
  if (!name.startsWith('E2E ')) throw new Error(`seed helper refuses a non-test region name: ${name}`)
}

const polygonWkt = (ring: Array<[number, number]>) => `POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(',')}))`

/** A closed square ring, `size` degrees on a side with its south-west corner at (x, y). */
export const squareRing = (x: number, y: number, size = 0.5): Array<[number, number]> => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
]

/**
 * Seeds an `E2E …` region straight into `regions` (there is no delete route, so these rows are kept
 * and cleaned up by name), for tests that need a hierarchy to already exist. Tests that are *about*
 * creating a region use the UI and the real `POST /admin/regions` instead.
 */
export function seedRegion(name: string, level: RegionLevel, parentId?: string, ring: Array<[number, number]> = squareRing(67, 24), hole?: Array<[number, number]>): string {
  assertE2eRegionName(name)
  const text = hole ? `POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(',')}),(${hole.map(([x, y]) => `${x} ${y}`).join(',')}))` : polygonWkt(ring)
  return psql(`
    INSERT INTO regions (name, level, parent_region_id, boundary)
    VALUES (${lit(name)}, ${lit(level)}, ${parentId ? `${lit(parentId)}::uuid` : 'NULL'}, ST_GeomFromText(${lit(text)}, 4326))
    RETURNING id`)
}

/** A round `E2E …` region with a very detailed outline (`4 × segments + 1` vertices) — for the cost of drawing and testing a point against a real district boundary. */
export function seedRegionCircle(name: string, level: RegionLevel, options: { lng: number; lat: number; radius: number; segments?: number; parentId?: string }): string {
  assertE2eRegionName(name)
  return psql(`
    INSERT INTO regions (name, level, parent_region_id, boundary)
    VALUES (${lit(name)}, ${lit(level)}, ${options.parentId ? `${lit(options.parentId)}::uuid` : 'NULL'},
            ST_Buffer(ST_SetSRID(ST_MakePoint(${Number(options.lng)}, ${Number(options.lat)}), 4326), ${Number(options.radius)}, ${Number(options.segments ?? 32)}))
    RETURNING id`)
}

/**
 * Seeds `count` numbered `E2E …` regions of one level in one statement, as a grid of squares inside `parentId`'s box (or anywhere from `(lng, lat)`), each `size` degrees wide —
 * for a platform with hundreds of districts. Guarded: an `E2E …` prefix and parent, at most 500. Returns how many were inserted.
 */
export function seedRegionGrid(options: { prefix: string; level: RegionLevel; count: number; lng: number; lat: number; size: number; columns?: number; parentId?: string }): number {
  assertE2eRegionName(options.prefix)
  if (options.parentId) assertE2eRegionId(options.parentId)
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 500) throw new Error(`seed helper refuses a count of ${options.count}`)
  const columns = options.columns ?? 10
  return Number(
    psql(`
      WITH inserted AS (
        INSERT INTO regions (name, level, parent_region_id, boundary)
        SELECT ${lit(options.prefix)} || ' ' || lpad(g::text, 3, '0'), ${lit(options.level)}, ${options.parentId ? `${lit(options.parentId)}::uuid` : 'NULL'},
               ST_MakeEnvelope(x0, y0, x0 + ${Number(options.size)}, y0 + ${Number(options.size)}, 4326)
        FROM (SELECT g, ${Number(options.lng)} + ((g - 1) % ${columns}) * ${Number(options.size) * 1.05} AS x0, ${Number(options.lat)} + ((g - 1) / ${columns}) * ${Number(options.size) * 1.05} AS y0 FROM generate_series(1, ${options.count}) g) cells
        RETURNING id
      ) SELECT count(*) FROM inserted`),
  )
}

/** Gives every child region of `parentId` two `E2E …` children of its own — the left and right half of its box (`<prefix> <child name> A/B`). Returns how many were made. Guarded like the grid. */
export function seedRegionHalves(parentId: string, options: { prefix: string; level: RegionLevel }): number {
  assertE2eRegionName(options.prefix)
  assertE2eRegionId(parentId)
  return Number(
    psql(`
      WITH inserted AS (
        INSERT INTO regions (name, level, parent_region_id, boundary)
        SELECT ${lit(options.prefix)} || ' ' || right(c.name, 3) || ' ' || h.side, ${lit(options.level)}, c.id,
               CASE WHEN h.side = 'A' THEN ST_MakeEnvelope(ST_XMin(c.boundary), ST_YMin(c.boundary), (ST_XMin(c.boundary) + ST_XMax(c.boundary)) / 2, ST_YMax(c.boundary), 4326)
                    ELSE ST_MakeEnvelope((ST_XMin(c.boundary) + ST_XMax(c.boundary)) / 2, ST_YMin(c.boundary), ST_XMax(c.boundary), ST_YMax(c.boundary), 4326) END
        FROM regions c CROSS JOIN (VALUES ('A'), ('B')) AS h(side)
        WHERE c.parent_region_id = ${lit(parentId)}::uuid AND c.name LIKE 'E2E %'
        RETURNING id
      ) SELECT count(*) FROM inserted`),
  )
}



export interface StoredRegion {
  id: string
  name: string
  level: string
  parentId: string | null
  boundary: { type: string; coordinates: number[][][] }
  updatedAt: string
}

/** The stored row for an `E2E …` region, or `null` when there isn't one (a save the UI blocked). */
export function readRegionByName(name: string): StoredRegion | null {
  assertE2eRegionName(name)
  const row = psql(`
    SELECT json_build_object('id', id, 'name', name, 'level', level, 'parentId', parent_region_id,
                             'boundary', ST_AsGeoJSON(boundary)::json, 'updatedAt', updated_at)
    FROM regions WHERE name = ${lit(name)}`)
  return row ? (JSON.parse(row) as StoredRegion) : null
}

export function readRegion(id: string): StoredRegion {
  const row = psql(`
    SELECT json_build_object('id', id, 'name', name, 'level', level, 'parentId', parent_region_id,
                             'boundary', ST_AsGeoJSON(boundary)::json, 'updatedAt', updated_at)
    FROM regions WHERE id = ${lit(id)}::uuid AND name LIKE 'E2E %'`)
  if (!row) throw new Error(`no E2E region ${id}`)
  return JSON.parse(row) as StoredRegion
}

/** How many `E2E …` regions carry this name — to prove a blocked save wrote nothing. */
export function countRegionsNamed(name: string): number {
  assertE2eRegionName(name)
  return Number(psql(`SELECT count(*) FROM regions WHERE name = ${lit(name)}`))
}

/** Puts a region in an `E2E …` NGO's coverage directly (what `POST /ngo/me/regions` does), for tests that need it pre-assigned. */
export function seedNgoRegion(ngoId: string, regionId: string) {
  psql(`
    INSERT INTO ngo_regions (ngo_id, region_id)
    SELECT n.id, r.id FROM ngos n, regions r
    WHERE n.id = ${lit(ngoId)}::uuid AND n.name LIKE 'E2E %' AND r.id = ${lit(regionId)}::uuid AND r.name LIKE 'E2E %'`)
}

/** The ids of the regions an NGO covers, as stored — to prove an add or remove really reached the database. */
export function readNgoRegionIds(ngoId: string): string[] {
  const rows = psql(`SELECT region_id FROM ngo_regions WHERE ngo_id = ${lit(ngoId)}::uuid ORDER BY region_id`)
  return rows ? rows.split('\n') : []
}

/** Marks a registered `e2e-` account verified + active but leaves its profile name empty — the state
 *  right after the OTP step, so a real login lands on the name step of onboarding. */
export function verifyAccountOnly(email: string) {
  assertE2eEmail(email)
  const id = psql(`
    UPDATE accounts SET email_verified = true, status = 'active', updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
    RETURNING id`)
  if (!id) throw new Error(`no account found to verify for ${email}`)
}

/** The home region stored on an `e2e-` account's profile, or `null` when none is set. */
export function readHomeRegionId(email: string): string | null {
  assertE2eEmail(email)
  const id = psql(`
    SELECT COALESCE(p.home_region_id::text, '') FROM profiles p
    JOIN accounts a ON a.id = p.account_id
    WHERE lower(a.email) = lower(${lit(email)}) AND a.deleted_at IS NULL`)
  return id === '' ? null : id
}

/** Sets an `e2e-` account's home region directly (what `PATCH /profile` does), to a test-owned region. */
export function seedHomeRegion(email: string, regionId: string) {
  assertE2eEmail(email)
  const updated = psql(`
    UPDATE profiles SET home_region_id = ${lit(regionId)}::uuid, updated_at = now()
    WHERE account_id = (SELECT id FROM accounts WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL)
      AND ${lit(regionId)}::uuid IN (SELECT id FROM regions WHERE name LIKE 'E2E %')
    RETURNING id`)
  if (!updated) throw new Error(`could not set a home region for ${email} (not an E2E region?)`)
}

function assertE2eName(kind: string, name: string) {
  if (!name.startsWith('E2E ')) throw new Error(`seed helper refuses a non-test ${kind} name: ${name}`)
}

const point = (lng: number, lat: number) => `ST_SetSRID(ST_MakePoint(${Number(lng)}, ${Number(lat)}), 4326)`

/** Every place the map draws is seeded *inside an `E2E …` region* (the facility routes answer per region), and
 *  the row itself is an `E2E …` name — so cleanup by name reaches exactly these and nothing real. */
function assertE2eRegionId(regionId: string) {
  const found = psql(`SELECT id FROM regions WHERE id = ${lit(regionId)}::uuid AND name LIKE 'E2E %'`)
  if (!found) throw new Error(`seed helper refuses a region that is not an E2E region: ${regionId}`)
}

export interface SeedShelter {
  name: string
  lng: number
  lat: number
  capacityTotal: number
  capacityCurrent: number
  status?: 'open' | 'closed'
  type?: 'shelter' | 'relief_center'
  certification?: 'certified' | 'pending' | 'uncertified'
  /** The managing organisation — must be an `E2E …` NGO. Omitted, the shelter has none (as the map's seeded shelters don't). */
  ngoId?: string
}

/** Seeds an `E2E …` shelter in an `E2E …` region; returns its id. */
export function seedShelter(regionId: string, shelter: SeedShelter): string {
  assertE2eName('shelter', shelter.name)
  assertE2eRegionId(regionId)
  if (shelter.ngoId) assertE2eNgoId(shelter.ngoId)
  return psql(`
    INSERT INTO shelters (name, type, location, region_id, capacity_total, capacity_current, certification_status, status, managed_by_ngo_id)
    VALUES (${lit(shelter.name)}, ${lit(shelter.type ?? 'shelter')}, ${point(shelter.lng, shelter.lat)}, ${lit(regionId)}::uuid,
            ${Number(shelter.capacityTotal)}, ${Number(shelter.capacityCurrent)}, ${lit(shelter.certification ?? 'certified')}, ${lit(shelter.status ?? 'open')},
            ${shelter.ngoId ? `${lit(shelter.ngoId)}::uuid` : 'NULL'})
    RETURNING id`)
}

function assertE2eNgoId(ngoId: string) {
  const found = psql(`SELECT id FROM ngos WHERE id = ${lit(ngoId)}::uuid AND name LIKE 'E2E %'`)
  if (!found) throw new Error(`seed helper refuses an NGO that is not an E2E NGO: ${ngoId}`)
}

/** Makes a registered `e2e-` account the `ngo_admin` of an *existing* `E2E …` NGO (promoteToNgoAdmin creates a new one), verified and
 *  onboarded, ready for a genuine login — so several sessions can act for the same organisation. */
export function makeNgoAdminOf(email: string, ngoId: string) {
  assertE2eEmail(email)
  assertE2eNgoId(ngoId)
  const updated = psql(`
    UPDATE accounts SET role = 'ngo_admin', ngo_id = ${lit(ngoId)}::uuid, updated_at = now()
    WHERE lower(email) = lower(${lit(email)}) AND deleted_at IS NULL
    RETURNING id`)
  if (!updated) throw new Error(`no account found to make an NGO admin: ${email}`)
  verifyAndOnboardAccount(email, 'E2E NGO Admin')
}

/**
 * Seeds `count` numbered `E2E …` shelters in one statement (a hundred single seeds would be a hundred `docker exec`s), on a grid from `(lng, lat)`, all managed by one `E2E …` NGO.
 * Guarded like the single seed: an `E2E …` region, an `E2E …` name prefix, an `E2E …` NGO, at most 500 rows. The names are `<prefix> 001`, `<prefix> 002`, … so they sort as they read.
 */
export function seedShelters(regionId: string, options: { prefix: string; count: number; lng: number; lat: number; ngoId: string; capacityTotal?: number; step?: number }): number {
  assertE2eName('shelter', options.prefix)
  assertE2eRegionId(regionId)
  assertE2eNgoId(options.ngoId)
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 500) throw new Error(`seed helper refuses a count of ${options.count}`)
  const step = options.step ?? 0.02
  return Number(
    psql(`
      WITH inserted AS (
        INSERT INTO shelters (name, type, location, region_id, capacity_total, capacity_current, certification_status, status, managed_by_ngo_id)
        SELECT ${lit(options.prefix)} || ' ' || lpad(g::text, 3, '0'), 'shelter',
               ST_SetSRID(ST_MakePoint(${Number(options.lng)} + ((g - 1) % 10) * ${Number(step)}, ${Number(options.lat)} + ((g - 1) / 10) * ${Number(step)}), 4326),
               ${lit(regionId)}::uuid, ${Number(options.capacityTotal ?? 100)}, (g % 50), 'certified', 'open', ${lit(options.ngoId)}::uuid
        FROM generate_series(1, ${options.count}) g
        RETURNING id
      ) SELECT count(*) FROM inserted`),
  )
}

export interface SeedInfrastructure {
  name: string
  lng: number
  lat: number
  type?: 'hospital' | 'bridge' | 'utility'
  status?: 'safe' | 'at_risk' | 'damaged'
}

/** Seeds an `E2E …` infrastructure row (hospital, bridge, utility) in an `E2E …` region; returns its id. */
export function seedInfrastructure(regionId: string, item: SeedInfrastructure): string {
  assertE2eName('infrastructure', item.name)
  assertE2eRegionId(regionId)
  return psql(`
    INSERT INTO infrastructure (name, type, location, region_id, status)
    VALUES (${lit(item.name)}, ${lit(item.type ?? 'hospital')}, ${point(item.lng, item.lat)}, ${lit(regionId)}::uuid, ${lit(item.status ?? 'safe')})
    RETURNING id`)
}

export interface SeedEssentialLocation {
  name: string
  lng: number
  lat: number
  type?: 'atm' | 'grocery_store' | 'pharmacy'
  /** When set, a status report is filed by this `e2e-` account so the place shows Open / Closed instead of "Status unknown". */
  report?: { by: string; status: 'open' | 'closed' }
}

/** Seeds an `E2E …` essential location (ATM, grocery, pharmacy) in an `E2E …` region, optionally with one
 *  status report from an `e2e-` account; returns its id. */
export function seedEssentialLocation(regionId: string, place: SeedEssentialLocation): string {
  assertE2eName('essential location', place.name)
  assertE2eRegionId(regionId)
  const id = psql(`
    INSERT INTO essential_locations (name, type, location, region_id)
    VALUES (${lit(place.name)}, ${lit(place.type ?? 'pharmacy')}, ${point(place.lng, place.lat)}, ${lit(regionId)}::uuid)
    RETURNING id`)
  if (place.report) {
    assertE2eEmail(place.report.by)
    const filed = psql(`
      INSERT INTO essential_location_status_reports (essential_location_id, reported_by_account_id, status)
      SELECT ${lit(id)}::uuid, a.id, ${lit(place.report.status)}
      FROM accounts a WHERE lower(a.email) = lower(${lit(place.report.by)}) AND a.deleted_at IS NULL
      RETURNING id`)
    if (!filed) throw new Error(`no account ${place.report.by} to file the status report`)
  }
  return id
}

/**
 * Seeds `count` numbered `E2E …` essential locations in one statement (for tests about long lists — thirty single seeds would be thirty `docker exec`s), laid out
 * on a grid from `(lng, lat)`, all of one type, none with a status report. Guarded like the single seed: an `E2E …` region, an `E2E …` name prefix, and at most 500 rows.
 * The names are `<prefix> 01`, `<prefix> 02`, … so they sort as they read. Returns how many were inserted.
 */
export function seedEssentialLocations(regionId: string, options: { prefix: string; count: number; lng: number; lat: number; type?: 'atm' | 'grocery_store' | 'pharmacy'; step?: number }): number {
  assertE2eName('essential location', options.prefix)
  assertE2eRegionId(regionId)
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 500) throw new Error(`seed helper refuses a count of ${options.count}`)
  const step = options.step ?? 0.02
  return Number(
    psql(`
      WITH inserted AS (
        INSERT INTO essential_locations (name, type, location, region_id)
        SELECT ${lit(options.prefix)} || ' ' || lpad(g::text, 2, '0'), ${lit(options.type ?? 'atm')},
               ST_SetSRID(ST_MakePoint(${Number(options.lng)} + ((g - 1) % 10) * ${Number(step)}, ${Number(options.lat)} + ((g - 1) / 10) * ${Number(step)}), 4326),
               ${lit(regionId)}::uuid
        FROM generate_series(1, ${options.count}) g
        RETURNING id
      ) SELECT count(*) FROM inserted`),
  )
}

/**
 * Seeds `count` numbered `E2E …` organisations (active) in one statement — for a list that has to page through more than one hundred of them (`GET /admin/ngos` answers in pages
 * of 100). An account can create only one organisation (a unique index on `ngos.created_by`), so each gets a throwaway `e2e-…@example.com` founder that borrows the given
 * `e2e-` account's password hash (a NULL hash makes the backend fail to load the account). Returns the organisation ids in name order. Guarded: an `E2E …` prefix, an
 * `e2e-…@example.com` template account, at most 500.
 */
export function seedNgos(templateEmail: string, options: { prefix: string; count: number }): string[] {
  assertE2eEmail(templateEmail)
  assertE2eName('NGO', options.prefix)
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 500) throw new Error(`seed helper refuses a count of ${options.count}`)
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const out = psql(`
    WITH template AS (SELECT password_hash FROM accounts WHERE lower(email) = lower(${lit(templateEmail)}) AND deleted_at IS NULL),
    founders AS (
      INSERT INTO accounts (email, password_hash, role, status, email_verified)
      SELECT 'e2e-org-founder-' || ${lit(stamp)} || '-' || g || '@example.com', template.password_hash, 'ngo_admin', 'active', true
      FROM template, generate_series(1, ${options.count}) g
      RETURNING id, email
    ), numbered AS (
      SELECT id, row_number() OVER (ORDER BY id) AS n FROM founders
    ), inserted AS (
      INSERT INTO ngos (name, status, created_by, approved_by, approved_at)
      SELECT ${lit(options.prefix)} || ' ' || lpad(n::text, 3, '0'), 'active', id, id, now() FROM numbered
      RETURNING id, name
    ) SELECT COALESCE(json_agg(id ORDER BY name), '[]'::json) FROM inserted`)
  return JSON.parse(out) as string[]
}

export type FloodRisk = 'low' | 'medium' | 'high'

/**
 * Seeds an *active* hazard zone in an `E2E …` region; returns its id. With `confidence` it is a model forecast
 * (`ai_prediction`, backed by a `flood_predictions` row, as the flood pipeline writes them); without, it is a
 * zone a person declared (`manual_admin`) and has no confidence — the two shapes the map has to tell apart.
 */
export function seedHazardZone(regionId: string, options: { ring: Array<[number, number]>; /** A ring cut out of the zone. */ hole?: Array<[number, number]>; risk: FloodRisk; confidence?: number; status?: 'active' | 'resolved'; modelVersion?: string }): string {
  assertE2eRegionId(regionId)
  const text = options.hole ? `POLYGON((${options.ring.map(([x, y]) => `${x} ${y}`).join(',')}),(${options.hole.map(([x, y]) => `${x} ${y}`).join(',')}))` : polygonWkt(options.ring)
  const wkt = `ST_GeomFromText(${lit(text)}, 4326)`
  const status = options.status ?? 'active'
  const modelVersion = options.modelVersion ?? 'e2e-model-1'
  if (!modelVersion.startsWith('e2e-')) throw new Error(`seed helper refuses a model version that cleanup would not recognise: ${modelVersion}`)
  const resolvedAt = status === 'resolved' ? 'now()' : 'NULL'
  if (options.confidence === undefined) {
    return psql(`
      INSERT INTO hazard_zones (source, risk_level, boundary, region_id, status, resolved_at)
      VALUES ('manual_admin', ${lit(options.risk)}, ${wkt}, ${lit(regionId)}::uuid, ${lit(status)}, ${resolvedAt})
      RETURNING id`)
  }
  return psql(`
    WITH prediction AS (
      INSERT INTO flood_predictions (region_id, risk_level, confidence_score, model_version, valid_from, valid_until)
      VALUES (${lit(regionId)}::uuid, ${lit(options.risk)}, ${Number(options.confidence)}, ${lit(modelVersion)}, now() - interval '1 hour', now() + interval '23 hours')
      RETURNING id
    )
    INSERT INTO hazard_zones (source, risk_level, boundary, region_id, status, resolved_at, flood_prediction_id)
    SELECT 'ai_prediction', ${lit(options.risk)}, ${wkt}, ${lit(regionId)}::uuid, ${lit(status)}, ${resolvedAt}, id FROM prediction
    RETURNING id`)
}

export interface StoredShelter {
  id: string
  /** The managing organisation, or `null` if none. */
  ngoId: string | null
  name: string
  type: string
  status: string
  certification: string
  capacityTotal: number
  capacityCurrent: number
  lng: number
  lat: number
}

/** The stored row for an `E2E …` shelter — to prove a page shows what the database holds, not what the test assumed. */
export function readShelter(id: string): StoredShelter {
  const row = psql(`
    SELECT json_build_object('name', name, 'type', type, 'status', status, 'certification', certification_status,
      'capacityTotal', capacity_total, 'capacityCurrent', capacity_current, 'lng', ST_X(location), 'lat', ST_Y(location))
    FROM shelters WHERE id = ${lit(id)}::uuid AND name LIKE 'E2E %'`)
  if (!row) throw new Error(`no E2E shelter ${id}`)
  return JSON.parse(row) as StoredShelter
}

/** The stored row of the `E2E …` shelter with this exact name, or `null` — how a test finds one it created through the UI. */
export function findShelterByName(name: string): StoredShelter | null {
  assertE2eName('shelter', name)
  const row = psql(`
    SELECT json_build_object('id', id, 'ngoId', managed_by_ngo_id, 'name', name, 'type', type, 'status', status, 'certification', certification_status,
      'capacityTotal', capacity_total, 'capacityCurrent', capacity_current, 'lng', ST_X(location), 'lat', ST_Y(location))
    FROM shelters WHERE name = ${lit(name)}`)
  return row ? (JSON.parse(row) as StoredShelter) : null
}

/** Changes a seeded shelter's numbers *behind an open page* — a headcount someone else recorded, a capacity that no longer matches what the page holds. */
export function setShelterNumbers(id: string, numbers: { capacityTotal?: number; capacityCurrent?: number }) {
  const sets = [
    numbers.capacityTotal === undefined ? '' : `capacity_total = ${Number(numbers.capacityTotal)}`,
    numbers.capacityCurrent === undefined ? '' : `capacity_current = ${Number(numbers.capacityCurrent)}`,
  ].filter(Boolean)
  if (sets.length === 0) return
  const updated = psql(`UPDATE shelters SET ${sets.join(', ')}, updated_at = now() WHERE id = ${lit(id)}::uuid AND name LIKE 'E2E %' RETURNING id`)
  if (!updated) throw new Error(`no E2E shelter ${id} to change`)
}

/** Deletes a seeded `E2E …` shelter — for a page that is open on it (there is no delete route). */
export function deleteShelter(id: string) {
  const deleted = psql(`DELETE FROM shelters WHERE id = ${lit(id)}::uuid AND name LIKE 'E2E %' RETURNING id`)
  if (!deleted) throw new Error(`no E2E shelter ${id} to delete`)
}

export interface StoredEssentialLocation {
  name: string
  type: string
  lng: number
  lat: number
}

/** The stored row for an `E2E …` essential location. */
export function readEssentialLocation(id: string): StoredEssentialLocation {
  const row = psql(`
    SELECT json_build_object('name', name, 'type', type, 'lng', ST_X(location), 'lat', ST_Y(location))
    FROM essential_locations WHERE id = ${lit(id)}::uuid AND name LIKE 'E2E %'`)
  if (!row) throw new Error(`no E2E essential location ${id}`)
  return JSON.parse(row) as StoredEssentialLocation
}

/** Every status report filed against an `E2E …` essential location, oldest first, with the email of the account that filed it —
 *  the API never returns who reported, so this is the only way to prove the report is really attributed to the person who pressed the button. */
export function readEssentialReports(id: string): Array<{ status: string; by: string }> {
  const rows = psql(`
    SELECT COALESCE(json_agg(json_build_object('status', r.status, 'by', a.email) ORDER BY r.created_at), '[]'::json)
    FROM essential_location_status_reports r
    JOIN accounts a ON a.id = r.reported_by_account_id
    JOIN essential_locations l ON l.id = r.essential_location_id
    WHERE r.essential_location_id = ${lit(id)}::uuid AND l.name LIKE 'E2E %'`)
  return JSON.parse(rows) as Array<{ status: string; by: string }>
}

/** Removes an `E2E …` essential location (and its reports) — to make a report land on a place that has just disappeared. */
export function deleteEssentialLocation(id: string) {
  psql(`
    WITH target AS (SELECT id FROM essential_locations WHERE id = ${lit(id)}::uuid AND name LIKE 'E2E %'),
    gone AS (DELETE FROM essential_location_status_reports WHERE essential_location_id IN (SELECT id FROM target))
    DELETE FROM essential_locations WHERE id IN (SELECT id FROM target)`)
}


export interface StoredHazardZone {
  source: string
  risk: string
  status: string
  resolvedAt: string | null
  createdBy: string | null
  confidence: number | null
  modelVersion: string | null
  vertices: number
}

/** The stored row for a hazard zone that belongs to an `E2E …` region or was declared by an `e2e-` account — with the declaring account's
 *  email and the paired prediction's confidence, which the API's own responses don't all carry. */
export function readHazardZone(id: string): StoredHazardZone {
  const row = psql(`
    SELECT json_build_object('source', z.source, 'risk', z.risk_level, 'status', z.status, 'resolvedAt', z.resolved_at,
      'createdBy', a.email, 'confidence', p.confidence_score, 'modelVersion', p.model_version, 'vertices', ST_NPoints(z.boundary))
    FROM hazard_zones z
    LEFT JOIN accounts a ON a.id = z.created_by
    LEFT JOIN flood_predictions p ON p.id = z.flood_prediction_id
    WHERE z.id = ${lit(id)}::uuid
      AND (z.region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %') OR a.email LIKE 'e2e-%')`)
  if (!row) throw new Error(`no E2E hazard zone ${id}`)
  return JSON.parse(row) as StoredHazardZone
}

/** The ids of the active zones an `e2e-` account has declared, newest first. */
export function readZonesDeclaredBy(email: string): string[] {
  assertE2eEmail(email)
  const out = psql(`
    SELECT COALESCE(json_agg(z.id ORDER BY z.detected_at DESC), '[]'::json)
    FROM hazard_zones z JOIN accounts a ON a.id = z.created_by
    WHERE lower(a.email) = lower(${lit(email)})`)
  return JSON.parse(out) as string[]
}

/** Resolves an `E2E …` zone straight in the database — to make the page's Resolve land on a zone someone else has already resolved. */
export function resolveZoneInDb(id: string) {
  const updated = psql(`
    UPDATE hazard_zones SET status = 'resolved', resolved_at = now()
    WHERE id = ${lit(id)}::uuid AND region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %')
    RETURNING id`)
  if (!updated) throw new Error(`no E2E zone to resolve: ${id}`)
}

export interface StoredInfrastructure {
  id: string
  name: string
  type: string
  status: string
  /** When the status was last set — moves even when it is set to what it already was. */
  lastStatusUpdate: string
  lng: number
  lat: number
}

const infrastructureSelect = `
  SELECT json_build_object('id', id, 'name', name, 'type', type, 'status', status, 'lastStatusUpdate', last_status_update,
    'lng', ST_X(location), 'lat', ST_Y(location))
  FROM infrastructure`

/** The stored row for an `E2E …` infrastructure item — to prove a page shows what the database holds, and what a write really changed. */
export function readInfrastructure(id: string): StoredInfrastructure {
  const row = psql(`${infrastructureSelect} WHERE id = ${lit(id)}::uuid AND name LIKE 'E2E %'`)
  if (!row) throw new Error(`no E2E infrastructure ${id}`)
  return JSON.parse(row) as StoredInfrastructure
}

/** The `E2E …` infrastructure item with this exact name, or `null` — how a test finds one it added through the UI, **including one outside every region, which no route can list**. */
export function findInfrastructureByName(name: string): StoredInfrastructure | null {
  assertE2eName('infrastructure', name)
  const row = psql(`${infrastructureSelect} WHERE name = ${lit(name)}`)
  return row ? (JSON.parse(row) as StoredInfrastructure) : null
}

/** Deletes a seeded `E2E …` infrastructure item — for a page that is open on it (there is no delete route). */
export function deleteInfrastructure(id: string) {
  const deleted = psql(`DELETE FROM infrastructure WHERE id = ${lit(id)}::uuid AND name LIKE 'E2E %' RETURNING id`)
  if (!deleted) throw new Error(`no E2E infrastructure ${id} to delete`)
}

export interface StoredEssentialLocation {
  id: string
  name: string
  type: string
  lng: number
  lat: number
  reports: number
}

/** The `E2E …` essential location with this exact name, or `null`, with how many status reports it has. */
export function findEssentialByName(name: string): StoredEssentialLocation | null {
  assertE2eName('essential location', name)
  const row = psql(`
    SELECT json_build_object('id', l.id, 'name', l.name, 'type', l.type, 'lng', ST_X(l.location), 'lat', ST_Y(l.location),
      'reports', (SELECT count(*) FROM essential_location_status_reports r WHERE r.essential_location_id = l.id))
    FROM essential_locations l WHERE l.name = ${lit(name)}`)
  return row ? (JSON.parse(row) as StoredEssentialLocation) : null
}

/**
 * Files a *log* of reports on an `E2E …` essential location from one `e2e-` account, oldest first, each `minutesAgo` older than the next — so the order a page shows them in
 * is known. (The API would accept the same account reporting as often as it likes; this seeds it directly.)
 */
export function seedEssentialReportLog(placeId: string, by: string, log: Array<{ status: 'open' | 'closed'; minutesAgo: number }>) {
  assertE2eEmail(by)
  const place = psql(`SELECT id FROM essential_locations WHERE id = ${lit(placeId)}::uuid AND name LIKE 'E2E %'`)
  if (!place) throw new Error(`no E2E essential location ${placeId}`)
  for (const entry of log) {
    const filed = psql(`
      INSERT INTO essential_location_status_reports (essential_location_id, reported_by_account_id, status, created_at)
      SELECT ${lit(placeId)}::uuid, a.id, ${lit(entry.status)}, now() - (${Number(entry.minutesAgo)} * interval '1 minute')
      FROM accounts a WHERE lower(a.email) = lower(${lit(by)}) AND a.deleted_at IS NULL
      RETURNING id`)
    if (!filed) throw new Error(`no account ${by} to file the status report`)
  }
}

/** The report statuses of an `E2E …` essential location, newest first — what the log dialog must show, read from the table itself. */
export function readEssentialReportStatuses(placeId: string): string[] {
  const out = psql(`
    SELECT COALESCE(json_agg(r.status ORDER BY r.created_at DESC, r.id), '[]'::json)
    FROM essential_location_status_reports r JOIN essential_locations l ON l.id = r.essential_location_id
    WHERE r.essential_location_id = ${lit(placeId)}::uuid AND l.name LIKE 'E2E %'`)
  return JSON.parse(out) as string[]
}
