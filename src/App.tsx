import { AppShell } from './components/AppShell'
import { AppProvider } from './state/AppProvider'

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
