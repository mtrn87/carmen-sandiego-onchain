import { Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import GamePage from './pages/GamePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/game" element={<GamePage />} />
    </Routes>
  )
}
