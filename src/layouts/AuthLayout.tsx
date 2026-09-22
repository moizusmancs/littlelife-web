import type { ReactNode } from 'react'
import { LifebuoyIcon } from '@phosphor-icons/react'

/**
 * Shared shell for every Pattern W-Auth screen (Login, Register, Verify Email, Forgot/Reset
 * Password). Structural chrome (logo, headline size/position, card treatment, decorative
 * circle, mobile collapse) matches the pixel mockups exactly (`Batch 1.dc.html` §1a for Login,
 * `Batch 3 Citizen.dc.html` §3a for Register) — each screen's own hero copy/content and card
 * width differ per mockup, so those are props, not hardcoded here.
 *
 * Below `md` there's no room for a real split (the mockups only specify 1440 desktop), so the
 * brand panel collapses to a compact header instead of being scaled down — a deliberate
 * extrapolation, not part of the pixel spec.
 */
export function AuthLayout({
  heroHeadline,
  heroContent,
  secondCircle = false,
  title,
  subtitle,
  cardWidth = 440,
  children,
}: {
  heroHeadline: ReactNode
  heroContent: ReactNode
  /** Login's mockup has two decorative circles, Register's has one — see each screen's own
   *  markup rather than assuming they match. */
  secondCircle?: boolean
  title: string
  subtitle?: string
  cardWidth?: number
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-surface-base">
      <div className="relative hidden w-155 flex-none flex-col overflow-hidden bg-linear-to-br from-primary-500 to-peach-400 px-14 py-12 text-white md:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-white/22">
            <LifebuoyIcon weight="fill" size={24} />
          </div>
          <span className="font-heading text-[22px] font-extrabold">LittleLife</span>
        </div>

        <div className="flex-1" />

        <p className="max-w-115 font-heading text-[44px] leading-13 font-bold text-balance">
          {heroHeadline}
        </p>
        {heroContent}

        <div className="pointer-events-none absolute -right-30 -bottom-35 size-105 rounded-full bg-white/10" />
        {secondCircle && (
          <div className="pointer-events-none absolute -bottom-55 right-15 size-80 rounded-full bg-white/8" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center gap-2.5 md:hidden">
          <div className="flex size-9 items-center justify-center rounded-md bg-linear-to-br from-primary-500 to-peach-400">
            <LifebuoyIcon weight="fill" className="text-white" size={20} />
          </div>
          <span className="font-heading text-h3 font-bold text-ink-900">LittleLife</span>
        </div>

        <div
          className="w-full rounded-md border border-surface-border bg-surface-raised p-9 shadow-md"
          style={{ maxWidth: cardWidth }}
        >
          <h1 className="font-heading text-h1 font-bold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1.5 font-body text-body-md text-ink-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  )
}
