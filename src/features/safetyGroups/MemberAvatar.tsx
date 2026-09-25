import { UserIcon } from '@phosphor-icons/react'
import { cn, getInitials } from '@/lib/utils'

/** The round avatar for a member: their initials when they have a name to take them from, otherwise a person glyph (an email or a bare id gives nothing to abbreviate). */
export function MemberAvatar({ name = '', className }: { name?: string; className?: string }) {
  const initials = getInitials(name)
  return (
    <span
      className={cn(
        'flex size-12 flex-none items-center justify-center rounded-full bg-primary-100 font-heading text-body-md font-bold text-primary-700',
        className,
      )}
      aria-hidden="true"
    >
      {initials || <UserIcon size={22} weight="fill" />}
    </span>
  )
}
