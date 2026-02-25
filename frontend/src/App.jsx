import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import GamePage from './pages/GamePage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import { useGameStore } from './store/gameStore'
import { loadAuthSession } from './utils/authPersistence'

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
    <>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/profile/:address" element={<ProfilePage />} />
      </Routes>
    </>
  )
}
