import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/auth'

/**
 * All backend routes are mounted under /api/v1 (api/README.md conventions). In dev this is
 * proxied by Vite (see vite.config.ts) or overridden via VITE_API_BASE_URL; in prod it's set
 * to the real API origin at build time.
 */
const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export const apiClient = axios.create({
  baseURL,
  // Web client: the refresh token rides an httpOnly cookie, never touched by JS. We send no
  // X-Client header, which is what makes the backend treat this as a web client at all
  // (api/README.md — "not sent, or any value other than mobile" -> web).
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

/** Dedupes concurrent 401s during the same tab's lifetime into a single /auth/refresh call —
 *  several requests firing at once (e.g. a dashboard's parallel widget fetches) should not
 *  each trigger their own refresh. */
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ access_token: string }>(
        `${baseURL}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .then((res) => res.data.access_token)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined
    const isRefreshCall = config?.url?.includes('/auth/refresh')
    const isAuthEntryCall =
      config?.url?.includes('/auth/login') || config?.url?.includes('/auth/register')

    if (error.response?.status !== 401 || !config || config._retried || isRefreshCall || isAuthEntryCall) {
      throw error
    }

    config._retried = true
    try {
      const accessToken = await refreshAccessToken()
      const user = useAuthStore.getState().user
      // We only have a fresh token here, not a fresh user payload — refresh's response is
      // {access_token} only (api/00-identity.md). Keep the existing user object; GET /auth/me
      // is the source of truth for role/status changes and is re-fetched on next app bootstrap.
      if (user) {
        useAuthStore.getState().setAuth(accessToken, user)
      }
      config.headers.Authorization = `Bearer ${accessToken}`
      return apiClient.request(config)
    } catch (refreshError) {
      // "refresh token invalid or expired", or no cookie at all — treat as fully logged out
      // (api/00-identity.md's own guidance: don't retry, don't alarm on a plain missing-cookie
      // case, just clear state and let route guards send the user to /login).
      useAuthStore.getState().clearAuth()
      throw refreshError
    }
  },
)

export { refreshAccessToken }
