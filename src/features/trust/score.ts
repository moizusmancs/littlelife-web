import type { TrustScore } from '@/api/trust'

/**
 * The top of the credibility scale. The API states none, but every stored score so far sits in 0–100 (the
 * ten seeded ones run 10–100) and the mockups draw it as a percentage, so the rings and bars use it. The
 * column has no range check, though, so a score outside it is still shown as the number it is — the drawing
 * just stops at the ends, and "out of 100" is only said when it's true.
 */
export const SCORE_MAX = 100

/**
 * Whether the account has a real, stored score. The backend reports an implicit `0` with no `updated_at` for an
 * account that has never been scored — that is "not scored yet", not a score of zero — so the presence of
 * `updated_at` is what tells them apart.
 */
export const isScored = (score: TrustScore | undefined): score is TrustScore & { updated_at: string } => score?.updated_at !== undefined

/** How much of the ring or bar to fill, 0–100, whatever the score is. */
export const scorePercent = (score: number) => Math.max(0, Math.min(SCORE_MAX, score))

export const isOnScale = (score: number) => score >= 0 && score <= SCORE_MAX
