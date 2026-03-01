import './polyfills'
import React from 'react'
import ReactDOM from 'react-dom/client'

// Suppress Privy analytics 422/CORS noise in local development.
// The App ID is not registered for localhost origins — swallow silently.
if (import.meta.env.DEV) {
  const _fetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? ''
    if (url.includes('auth.privy.io') && url.includes('analytics_events')) {
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    return _fetch(input, init)
  }
}
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import App from './App'
import './styles/global.css'

const privyConfig = {
  loginMethods: ['google', 'wallet'],
  appearance: {
    theme: 'dark',
    accentColor: '#00ffff',
  },
  embeddedWallets: {
    createOnLogin: 'all-users',
  },
  externalWallets: {
    solana: {
      isActive: false,
    },
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider appId="cmlh3u02l00fnl50cr0btgldc" config={privyConfig}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>
)
