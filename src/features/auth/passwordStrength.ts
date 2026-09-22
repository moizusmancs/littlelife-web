/**
 * A purely cosmetic, client-side strength gauge — the backend enforces nothing beyond "8+
 * characters" (api/00-identity.md, `POST /auth/register`), so this heuristic must never imply
 * the backend requires more than that; it's guidance, not a gate. Zod's `min(8)` is the only
 * real requirement (see schemas.ts).
 */
export interface PasswordStrength {
  /** 0 = below the 8-char minimum (not scored), 1-4 = weak..strong. */
  score: 0 | 1 | 2 | 3 | 4
  label: string
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return { score: 0, label: '' }

  const hasNumber = /\d/.test(password)
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password)
  const hasSymbol = /[^a-zA-Z0-9]/.test(password)
  const isLong = password.length >= 12

  const varietyCount = [hasNumber, hasMixedCase, hasSymbol].filter(Boolean).length

  if (isLong && varietyCount >= 2) return { score: 4, label: 'Strong — great length and variety' }
  if (password.length >= 10 && varietyCount >= 1) return { score: 3, label: 'Good — consider adding more variety' }
  if (hasNumber || password.length >= 10) return { score: 2, label: 'Fair — try a longer password' }
  return { score: 1, label: 'Weak — try adding numbers or a longer password' }
}
