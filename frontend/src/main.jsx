import './polyfills'
import React from 'react'
import ReactDOM from 'react-dom/client'
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
}

// Detect base path for IPFS compatibility
// When deployed on IPFS, pathname will be like /ipfs/QmHash/
// When deployed locally, pathname will be /
const basename = window.location.pathname.includes('/ipfs/') 
  ? window.location.pathname 
  : '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider appId="cmlh3u02l00fnl50cr0btgldc" config={privyConfig}>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>
)
