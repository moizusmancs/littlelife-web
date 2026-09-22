import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { bootstrapAuth } from '@/lib/bootstrapAuth'
import { AppRouter } from '@/routes/router'
import '@/i18n'

function App() {
  useEffect(() => {
    void bootstrapAuth()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  )
}

export default App
