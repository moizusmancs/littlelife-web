import { describe, expect, it } from 'vitest'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from './utils'

describe('cn — the project’s own font-size tokens are sizes, not colours', () => {
  it('keeps a text colour and a token size together, in either order', () => {
    expect(cn('text-white', 'text-body-lg')).toBe('text-white text-body-lg')
    expect(cn('text-body-lg', 'text-white')).toBe('text-body-lg text-white')
    expect(cn('text-primary-700', 'text-body-sm')).toBe('text-primary-700 text-body-sm')
  })

  it('still lets a later size replace an earlier one, and a later colour an earlier one', () => {
    expect(cn('text-label', 'text-body-lg')).toBe('text-body-lg')
    expect(cn('text-body-md text-body-sm')).toBe('text-body-sm')
    expect(cn('text-ink-500', 'text-white')).toBe('text-white')
  })

  it('knows every size token in the theme', () => {
    for (const token of ['display', 'h1', 'h2', 'h3', 'body-lg', 'body-md', 'body-sm', 'label', 'overline']) {
      expect(cn('text-ink-900', `text-${token}`)).toBe(`text-ink-900 text-${token}`)
    }
  })

  it('leaves Tailwind’s own sizes and arbitrary sizes working as before', () => {
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
    expect(cn('text-[11px]', 'text-status-caution')).toBe('text-[11px] text-status-caution')
  })
})

describe('buttons keep both their label colour and their size once passed through cn', () => {
  const merged = (variant: 'primary' | 'secondary' | 'ghost', size: 'sm' | 'md' | 'lg') => cn(buttonVariants({ variant, size }), 'w-full')

  it('a large primary button is white text at body-lg (it rendered dark before)', () => {
    const classes = merged('primary', 'lg').split(' ')
    expect(classes).toContain('text-white')
    expect(classes).toContain('text-body-lg')
  })

  it('a small secondary or ghost button keeps its primary-700 text and body-sm size', () => {
    for (const variant of ['secondary', 'ghost'] as const) {
      const classes = merged(variant, 'sm').split(' ')
      expect(classes).toContain('text-primary-700')
      expect(classes).toContain('text-body-sm')
    }
  })

  it('a medium button keeps its 13px label size (it fell back to 16px before) and its colour', () => {
    const classes = merged('primary', 'md').split(' ')
    expect(classes).toContain('text-label')
    expect(classes).toContain('text-white')
  })
})
