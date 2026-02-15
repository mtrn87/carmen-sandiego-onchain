import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InteractiveMap from '../InteractiveMap'

// Mock gameStore
const mockScanLocation = vi.fn()
const mockCloseClueModal = vi.fn()

vi.mock('../../store/gameStore', () => ({
  useGameStore: vi.fn(() => ({
    locations: [
      { id: 421614, name: 'Tokyo', coords: { x: 78, y: 55 }, connections: [84532], investigated: false },
      { id: 84532, name: 'Paris', coords: { x: 40, y: 30 }, connections: [51], investigated: false },
      { id: 51, name: 'Sydney', coords: { x: 87, y: 78 }, connections: [421614], investigated: false },
    ],
    showClueModal: false,
    activeClue: null,
    closeClueModal: mockCloseClueModal,
    isInvestigating: false,
    scannedLocations: [],
    isScanning: false,
    scanLocation: mockScanLocation,
    scanAndInspect: vi.fn(),
    investigate: vi.fn(),
    gas: 100,
    missionId: 1,
    blocksElapsed: 0,
    carmenMovedAlert: false,
    discoveredCityIds: [],
    visitedCityIds: [],
  })),
}))

// Mock CSS modules
vi.mock('../InteractiveMap.module.css', () => ({
  default: new Proxy({}, { get: (_, prop) => prop }),
}))

// Mock getBoundingClientRect for canvas resize
Element.prototype.getBoundingClientRect = vi.fn(() => ({
  width: 800,
  height: 600,
  top: 0,
  left: 0,
  bottom: 600,
  right: 800,
  x: 0,
  y: 0,
}))

describe('InteractiveMap', () => {
  it('renders key city markers', () => {
    render(<InteractiveMap />)
    expect(screen.getByText(/Tokyo/)).toBeInTheDocument()
    expect(screen.getByText(/Paris/)).toBeInTheDocument()
    expect(screen.getByText(/New York/)).toBeInTheDocument()
    expect(screen.getByText(/Sydney/)).toBeInTheDocument()
    expect(screen.getByText(/New York City/)).toBeInTheDocument()
  })

  it('opens location panel on marker click', async () => {
    const user = userEvent.setup()
    render(<InteractiveMap />)

    const tokyoMarker = screen.getByText(/Tokyo/).closest('[class]')
    await user.click(tokyoMarker)

    // After click, should show chain name in panel
    expect(screen.getByText('Arbitrum Sepolia')).toBeInTheDocument()
  })

  it('shows UNCHARTED NETWORK for unscanned locations', async () => {
    const user = userEvent.setup()
    render(<InteractiveMap />)

    const tokyoMarker = screen.getByText(/Tokyo/).closest('[class]')
    await user.click(tokyoMarker)

    expect(screen.getByText('UNCHARTED NETWORK')).toBeInTheDocument()
  })
})
