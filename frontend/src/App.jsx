import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import GamePage from './pages/GamePage'
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

    // Restaurar sessão apenas se houver dados salvos
    restoreSession()
  }, [initializeWeb3AuthSession])

  return (
    <>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/game" element={<GamePage />} />
      </Routes>
    </>
  )
}
