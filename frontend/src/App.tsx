import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { Toaster } from './components/Toaster'
import { NavSidebar } from './components/layout/NavSidebar'
import { useAuthStore } from './store/authStore'
import { useTransformationStore } from './store/transformationStore'
import { ThemeProvider } from './context/ThemeContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

// Authenticated layout: NavSidebar is always present on the left.
function AuthenticatedApp() {
  const editorOpen = useTransformationStore((s) => s.editorOpen)
  return (
    <div className="flex h-full overflow-hidden">
      <NavSidebar />
      <div className="flex-1 overflow-hidden min-w-0">
        {editorOpen ? <AppShell /> : <HomePage />}
      </div>
    </div>
  )
}

// Session is restored synchronously in authStore — no useEffect flash needed.
function AppRouter() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <LoginPage />
  return <AuthenticatedApp />
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
