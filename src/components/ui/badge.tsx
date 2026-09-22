import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TONES = {
  caution: 'bg-status-caution-tint text-status-caution',
  safe: 'bg-status-safe-tint text-status-safe',
  critical: 'bg-status-critical-tint text-status-critical',
  trust: 'bg-status-trust-tint text-status-trust',
  info: 'bg-status-info-tint text-status-info',
} as const

export function Badge({ tone = 'caution', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 font-body text-[11px] font-medium', TONES[tone])}>
      {children}
    </span>
  )
}
