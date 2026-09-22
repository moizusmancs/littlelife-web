import type { ReactNode } from 'react'
import { Buildings, Lifebuoy, MapPin, UsersThree } from '@phosphor-icons/react'

/**
 * Shared shell for every Pattern W-Auth screen (Login, Register, Verify Email, Forgot/Reset
 * Password). Rebuilt to match the actual pixel mockup exactly — `Batch 1.dc.html` §1a — not
 * just the written button-table spec: fixed 620px brand panel (not a percentage), the
 * headline/stats/decorative-circle content, and the form sitting inside its own bordered
 * elevation-2 card, all pulled from the mockup's real inline styles.
 *
 * Below `md` there's no room for a real split (the mockup only specifies 1440 desktop), so the
 * brand panel collapses to a compact header instead of being scaled down — a deliberate
 * extrapolation, not part of the pixel spec.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-surface-base">
      <div className="relative hidden w-[620px] flex-none flex-col overflow-hidden bg-gradient-to-br from-primary-500 to-peach-400 px-14 py-12 text-white md:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-white/22">
            <Lifebuoy weight="fill" size={24} />
          </div>
          <span className="font-heading text-[22px] font-extrabold">LittleLife</span>
        </div>

        <div className="flex-1" />

        <p className="max-w-[460px] font-heading text-[44px] leading-[52px] font-bold text-balance">
          Flood safety, from your neighbours and the people who respond.
        </p>
        <p className="mt-4.5 max-w-[440px] font-body text-body-lg text-white/92">
          Community reports, verified alerts and safe routes for Pakistan — one account for
          citizens, NGOs and NDMA staff.
        </p>
        <div className="mt-11 flex gap-7 font-body text-label font-medium text-white/90">
          <span className="flex items-center gap-1.5">
            <UsersThree size={16} /> 212k citizens
          </span>
          <span className="flex items-center gap-1.5">
            <Buildings size={16} /> 48 NGOs
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={16} /> 134 districts
          </span>
        </div>

        <div className="pointer-events-none absolute -right-30 -bottom-35 size-105 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-55 right-15 size-80 rounded-full bg-white/8" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center gap-2.5 md:hidden">
          <div className="flex size-9 items-center justify-center rounded-md bg-gradient-to-br from-primary-500 to-peach-400">
            <Lifebuoy weight="fill" className="text-white" size={20} />
          </div>
          <span className="font-heading text-h3 font-bold text-ink-900">LittleLife</span>
        </div>

        <div className="w-full max-w-[440px] rounded-md border border-surface-border bg-surface-raised p-9 shadow-md">
          <h1 className="font-heading text-h1 font-bold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1.5 font-body text-body-md text-ink-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  )
}
