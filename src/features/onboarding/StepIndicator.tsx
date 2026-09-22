import { CheckIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * The 3-step "Details / Verify / Profile" indicator from the OTP mockup (Batch 3 Citizen
 * §3b) — the mockup's own third step ("Location") isn't real (see AuthLayout callers), but the
 * step *pattern* itself (completed = checkmark, active = solid white circle, upcoming =
 * outlined) is reused as-is for the onboarding/profile screen one step later, since no
 * separate mockup exists for that screen and this is the established idiom to extend.
 */
export function StepIndicator({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  return (
    <div className="flex items-center gap-2.5 font-body text-overline text-white/90">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-2.5">
          {index > 0 && <div className={cn('h-0.5 w-10', index <= currentIndex ? 'bg-white/50' : 'bg-white/30')} />}
          <div
            className={cn(
              'flex size-7 flex-none items-center justify-center rounded-full',
              index < currentIndex && 'bg-white/30',
              index === currentIndex && 'bg-white text-primary-500',
              index > currentIndex && 'border-2 border-white/50',
            )}
          >
            {index < currentIndex ? <CheckIcon weight="bold" size={13} /> : index + 1}
          </div>
          {step}
        </div>
      ))}
    </div>
  )
}
