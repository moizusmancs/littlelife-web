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

/** Sets an `E2E …` NGO's status, e.g. `deactivated` to see how a screen behaves once the
 *  organisation can no longer invite. Refuses any other NGO. */
export function setNgoStatus(ngoId: string, status: 'active' | 'suspended' | 'deactivated') {
  const updated = psql(`
    UPDATE ngos SET status = ${lit(status)}, updated_at = now()
    WHERE id = ${lit(ngoId)} AND name LIKE 'E2E %'
    RETURNING id`)
  if (!updated) throw new Error(`no E2E NGO ${ngoId} to set status on`)
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
