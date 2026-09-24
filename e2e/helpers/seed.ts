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
  const [founderId, ngoId] = psql(`
    WITH founder AS (
      INSERT INTO accounts (email, role, status, email_verified)
      VALUES (${lit(founderEmail)}, 'ngo_admin', 'active', true)
      RETURNING id
    ), ngo AS (
      INSERT INTO ngos (name, status, created_by, approved_by, approved_at)
      SELECT ${lit(ngoName)}, 'active', id, id, now() FROM founder
      RETURNING id
    )
    SELECT (SELECT id FROM founder) || ',' || (SELECT id FROM ngo)`).split(',')

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
