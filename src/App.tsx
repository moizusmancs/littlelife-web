import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { bootstrapAuth } from '@/lib/bootstrapAuth'
import { AppRouter } from '@/routes/router'
import { useAuthStore } from '@/store/auth'
import '@/i18n'

function App() {
  useEffect(() => {
    void bootstrapAuth()
    // Dev-only debug hook so manual/E2E checks can set auth state directly without a real
    // backend round trip (e.g. reaching an onboarding-gated screen without a real OTP) —
    // stripped entirely from production builds, `import.meta.env.DEV` is compiled away.
    if (import.meta.env.DEV) {
      Object.assign(window, { __authStore: useAuthStore })
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  )
}

export default App
