import { UsersThreeIcon } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

/**
 * Shown when `/app/safety-groups/:id` names nothing in the account's own connections — a mistyped link,
 * one that belonged to someone else, or a connection that was just removed (by you in another tab, or by
 * them). There's no `GET /safety-connections/{id}`, so "not found" simply means "not in your list".
 */
export function SafetyGroupNotFound() {
  return (
    <div className="flex max-w-3xl flex-col items-center rounded-md border border-dashed border-surface-border px-6 py-12 text-center">
      <UsersThreeIcon size={32} className="text-ink-300" aria-hidden="true" />
      <h1 className="mt-3 font-heading text-h3 font-bold text-ink-900">This connection isn't in your list</h1>
      <p className="mt-1 max-w-sm font-body text-body-sm text-ink-500">
        It may have been removed, or the link may be wrong.
      </p>
      <Link
        to="/app/safety-groups"
        className="mt-4 rounded-sm font-body text-body-md font-semibold text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        Back to Safety Groups
      </Link>
    </div>
  )
}
