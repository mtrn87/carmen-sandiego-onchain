import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import { useGameStore } from './store/gameStore'
import { loadAuthSession } from './utils/authPersistence'

const GamePage = lazy(() => import('./pages/GamePage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0a0a0a',
      color: '#00f0ff',
      fontFamily: 'monospace',
      fontSize: '1.1rem',
    }}>
      &gt; LOADING MODULE...
    </div>
  )
}

export default function App() {
  const { initializeWeb3AuthSession } = useGameStore()

  useEffect(() => {
    const restoreSession = () => {
      try {
        const savedSession = loadAuthSession()
        if (savedSession) {
          initializeWeb3AuthSession(
            savedSession.address,
            savedSession.userInfo,
            savedSession.addresses,
            savedSession.nickname
          )
        }
      } catch (error) {
        console.error('Error restoring session:', error)
      }
    }

    // Restore session only if saved data exists
    restoreSession()
  }, [initializeWeb3AuthSession])

  return (
    <ErrorBoundary name="App">
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/game" element={
            <ErrorBoundary name="GamePage">
              <GamePage />
            </ErrorBoundary>
          } />
          <Route path="/profile/:address" element={<ProfilePage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
