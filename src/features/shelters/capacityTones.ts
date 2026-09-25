import type { Tone } from '@/features/map/mapModel'

/** The occupancy bar's gradient and the percentage's colour for each tone — shared by the shelter meters (the map card, the pages, the NGO's rows). */
export const CAPACITY_BAR: Record<Tone, string> = { safe: 'from-status-safe to-[#7cc57f]', caution: 'from-status-caution to-[#f0c24a]', critical: 'from-status-critical to-[#ef7b7b]', neutral: 'from-ink-500 to-ink-300' }
export const CAPACITY_PERCENT_TEXT: Record<Tone, string> = { safe: 'text-status-safe', caution: 'text-status-caution', critical: 'text-status-critical', neutral: 'text-ink-500' }
