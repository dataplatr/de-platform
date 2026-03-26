import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { useAuthStore } from './store/authStore'
import { useTransformationStore } from './store/transformationStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

// Session is restored synchronously in authStore — no useEffect flash needed.
function AppRouter() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const editorOpen      = useTransformationStore((s) => s.editorOpen)

  if (!isAuthenticated) return <LoginPage />
  if (!editorOpen)      return <HomePage />
  return <AppShell />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  )
}

export default App
