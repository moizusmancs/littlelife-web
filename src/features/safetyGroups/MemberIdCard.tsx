import { IdentificationCardIcon } from '@phosphor-icons/react'
import { CopyButton } from '@/components/ui/copy-button'

export interface MemberIdCardProps {
  /** The signed-in account's own id. */
  memberId: string
  /** The signed-in account's email — the main way someone finds you. */
  email?: string
}

/**
 * How to be invited. Someone can invite you by the email you signed up with; your Member ID (your account
 * id) is the other way, for a person who doesn't have your email — this is where you read out or copy it.
 */
export function MemberIdCard({ memberId, email }: MemberIdCardProps) {
  return (
    <section
      aria-labelledby="member-id-heading"
      className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-4 shadow-sm lg:flex-row lg:items-center lg:gap-4"
    >
      <span className="flex size-10 flex-none items-center justify-center rounded-full bg-surface-sunken text-ink-700" aria-hidden="true">
        <IdentificationCardIcon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="member-id-heading" className="font-body text-body-md font-semibold text-ink-900">
          How people invite you
        </h2>
        <p className="mt-0.5 font-body text-body-sm text-ink-500">
          {email ? (
            <>
              With your email, <span className="font-semibold break-all text-ink-700">{email}</span>, or with your Member ID:
            </>
          ) : (
            'With your Member ID:'
          )}
        </p>
        <p className="mt-1.5 font-mono text-body-sm break-all text-ink-900 select-all" data-testid="own-member-id">
          {memberId}
        </p>
      </div>
      <div className="flex flex-none flex-wrap items-center gap-2">
        <CopyButton text={memberId} label="Member ID" />
      </div>
    </section>
  )
}
