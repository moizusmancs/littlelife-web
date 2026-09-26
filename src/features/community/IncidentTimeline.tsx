import { format, parseISO } from 'date-fns'
import { CheckIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { TimelineStep } from './feedModel'

const STATE_TEXT = { done: 'done', current: 'current step', upcoming: 'not yet', unrecorded: 'no record' } as const

/**
 * The report's progress — Reported → Verified → Being handled → Resolved — as a vertical list: finished steps ticked in green, the current
 * one ringed in the brand colour, the rest hollow; a step the report went past without a record (see `reportTimeline`) has a dashed ring
 * and says "No record kept" rather than a tick. Each has its date where the API records one, and a note where it matters (verified
 * automatically, resolved then reopened). The state is also said in words, not only by colour or shape. Purely presentational.
 */
export function IncidentTimeline({ steps }: { steps: readonly TimelineStep[] }) {
  return (
    <section aria-labelledby="incident-progress" className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm">
      <h2 id="incident-progress" className="font-heading text-h3 font-bold text-ink-900">
        Progress
      </h2>
      <ol aria-labelledby="incident-progress" className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.label} aria-current={step.state === 'current' ? 'step' : undefined} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-6 flex-none items-center justify-center rounded-full border-2',
                  step.state === 'done' && 'border-status-safe bg-status-safe text-white',
                  step.state === 'current' && 'border-primary-500 bg-primary-50',
                  step.state === 'upcoming' && 'border-ink-300 bg-surface-raised',
                  step.state === 'unrecorded' && 'border-dashed border-ink-300 bg-surface-raised',
                )}
                aria-hidden="true"
              >
                {step.state === 'done' && <CheckIcon size={12} weight="bold" />}
                {step.state === 'current' && <span className="size-2 rounded-full bg-primary-500" />}
              </span>
              {index < steps.length - 1 && <span className={cn('w-0.5 flex-1', step.state === 'done' ? 'bg-status-safe' : 'bg-ink-100')} aria-hidden="true" />}
            </div>
            <div className="flex min-w-0 flex-col pb-4">
              <span className={cn('font-body text-body-md font-semibold', step.state === 'upcoming' || step.state === 'unrecorded' ? 'text-ink-500' : 'text-ink-900')}>
                {step.label}
                <span className="sr-only"> — {STATE_TEXT[step.state]}</span>
              </span>
              {step.at && (
                <time dateTime={step.at} className="font-body text-body-sm text-ink-500">
                  {format(parseISO(step.at), 'd MMMM yyyy, HH:mm')}
                </time>
              )}
              {step.state === 'unrecorded' && !step.note && (
                <span className="font-body text-body-sm text-ink-500" aria-hidden="true">
                  No record kept
                </span>
              )}
              {step.note && <span className="font-body text-body-sm text-ink-700">{step.note}</span>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
