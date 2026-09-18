import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppProvider } from './state/AppProvider'

export default function App() {
  return (
    <AppProvider>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </AppProvider>
  )
}
