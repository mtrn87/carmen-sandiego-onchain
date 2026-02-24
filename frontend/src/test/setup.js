import '@testing-library/jest-dom'

// Provide default env vars for CI (no .env file present)
import.meta.env.VITE_GAME_MASTER_ADDRESS ??= '0x0000000000000000000000000000000000000001'
import.meta.env.VITE_ALCHEMY_RPC_URL_SEPOLIA ??= 'https://mock-rpc-url'

// Mock canvas getContext for InteractiveMap/CyberGrid
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  setLineDash: vi.fn(),
  strokeStyle: '',
  fillStyle: '',
  lineWidth: 1,
  lineDashOffset: 0,
  font: '',
}))

// Mock audio
window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
window.HTMLMediaElement.prototype.pause = vi.fn()

// Mock window.ethereum base
globalThis.window.ethereum = {
  request: vi.fn(async ({ method }) => {
    if (method === 'eth_chainId') return '0xaa36a7' // Sepolia
    if (method === 'eth_accounts') return ['0x1234567890abcdef1234567890abcdef12345678']
    return null
  }),
  on: vi.fn(),
  removeListener: vi.fn(),
}

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))
