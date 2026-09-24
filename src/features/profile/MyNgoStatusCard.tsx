import type { ComponentType } from 'react'
import { BuildingsIcon, CheckCircleIcon, XCircleIcon, type IconProps } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { NgoStatus } from '@/api/identity'

type Tone = 'caution' | 'safe' | 'critical' | 'info'

const STATUS: Record<
  NgoStatus,
  { label: string; tone: Tone; icon: ComponentType<IconProps>; tint: string; iconColor: string; message: string }
> = {
  pending_approval: {
    label: 'Pending approval',
    tone: 'caution',
    icon: BuildingsIcon,
    tint: 'bg-status-caution-tint',
    iconColor: 'text-status-caution',
    message:
      "Your registration has been submitted for admin review. If it's approved, this account becomes the organisation's admin and you'll move from the citizen app into the NGO console the next time you log in.",
  },
  rejected: {
    label: 'Not approved',
    tone: 'critical',
    icon: XCircleIcon,
    tint: 'bg-status-critical-tint',
    iconColor: 'text-status-critical',
    message: "An admin didn't approve this registration. You can submit a new one below.",
  },
  active: {
    label: 'Approved',
    tone: 'safe',
    icon: CheckCircleIcon,
    tint: 'bg-status-safe-tint',
    iconColor: 'text-status-safe',
    message:
      'Your organisation has been approved. Log in again to continue as its admin in the NGO console — this session still has your citizen permissions until you do.',
  },
  suspended: {
    label: 'Suspended',
    tone: 'critical',
    icon: XCircleIcon,
    tint: 'bg-status-critical-tint',
    iconColor: 'text-status-critical',
    message: 'This organisation is currently suspended.',
  },
  deactivated: {
    label: 'Deactivated',
    tone: 'info',
    icon: BuildingsIcon,
    tint: 'bg-status-info-tint',
    iconColor: 'text-status-info',
    message: 'This organisation has been deactivated.',
  },
}

export interface MyNgoStatusCardProps {
  name: string
  status: NgoStatus
  /** Shown only for `active` — approval promotes the account to `ngo_admin` and revokes its
   *  refresh tokens, but this session's access token still carries the old role, so the only
   *  way into the NGO console is a fresh login. */
  onLogInAgain: () => void
  isLoggingOut: boolean
}

/**
 * The status card WEB_DESIGN_PLAN.md §9 calls for. Renders whatever `GET /ngos/mine` says
 * (`pending_approval` / `rejected` / `active`, plus the two post-approval statuses so an
 * unexpected value can't crash the screen). There is no rejection *reason* to show — the
 * backend schema doesn't store one — so `rejected` says only that it wasn't approved.
 * Purely presentational; MyNgoPage owns the query and the log-in-again action.
 */
export function MyNgoStatusCard({ name, status, onLogInAgain, isLoggingOut }: MyNgoStatusCardProps) {
  const config = STATUS[status] ?? STATUS.deactivated
  const Icon = config.icon

  return (
    <div className="max-w-140 rounded-md border border-surface-border bg-surface-raised p-6 md:p-8">
      <div className="flex items-start gap-4">
        <div className={`flex size-11 flex-none items-center justify-center rounded-full ${config.tint}`}>
          <Icon weight="fill" size={22} className={config.iconColor} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-h3 font-bold break-words text-ink-900">{name}</h1>
            <Badge tone={config.tone}>{config.label}</Badge>
          </div>
          <p className="mt-1.5 font-body text-body-md text-ink-500">{config.message}</p>
          {status === 'active' && (
            <Button type="button" className="mt-4" isLoading={isLoggingOut} onClick={onLogInAgain}>
              Log in again
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
