import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * `twMerge` decides which of two classes wins by working out what each one *is*. It knows Tailwind's
 * own font sizes (`text-sm`), but not this project's `@theme` tokens (`text-body-lg`, `text-label`, …),
 * so it took them for text *colours* and, given `text-white` and `text-body-lg` together, kept only the
 * later one. Every button lost either its label colour (any `sm`/`lg` size: dark text on a pink primary
 * button, `text-primary-700` gone from secondary and ghost) or its size (`md`: the 13px `text-label`
 * became 16px). Declaring the tokens as font sizes makes `cn('text-white', 'text-body-lg')` keep both.
 * Keep this list in step with the `--text-*` sizes in `index.css`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'h1', 'h2', 'h3', 'body-lg', 'body-md', 'body-sm', 'label', 'overline'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Up to two uppercase initials from the first two words of a name ("Hina Khan" → "HK",
 *  "Al-Khidmat Foundation Karachi" → "AF"). Empty string for a blank name. */
export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
