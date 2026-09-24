import { AxiosError } from 'axios'
import type { ApiErrorBody } from '@/api/types'

/** The backend's own `{error}` message when there is one, otherwise a generic fallback — what
 *  every screen shows in its error banner. (Several older screens still carry a private copy of
 *  this; new code uses this one.) */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined
    if (body?.error) return body.error
  }
  return 'Something went wrong. Please try again.'
}
