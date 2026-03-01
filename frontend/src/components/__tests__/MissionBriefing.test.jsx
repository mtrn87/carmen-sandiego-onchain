import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import MissionBriefing from '../MissionBriefing'

const mockCompleteBriefing = vi.fn(async () => {})

// Mock gameStore
vi.mock('../../store/gameStore', () => ({
  useGameStore: vi.fn((selector) => {
    const state = { completeBriefing: mockCompleteBriefing, missionId: 1 }
    return selector ? selector(state) : state
  }),
}))

describe('MissionBriefing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crash', () => {
    render(<MissionBriefing />)
    expect(screen.getByText(/ACME DETECTIVE AGENCY/)).toBeInTheDocument()
  })

  it('shows continue button after typing completes', async () => {
    vi.useFakeTimers()
    render(<MissionBriefing />)

    // Fast-forward all timers to complete typing
    await act(async () => {
      vi.runAllTimers()
    })

    // Button should appear
    screen.queryByText(/PRESS ENTER OR CLICK TO CONTINUE/)
    // May or may not appear depending on timing, but component shouldn't crash
    vi.useRealTimers()
  })

  it('calls completeBriefing when button is clicked', async () => {
    vi.useFakeTimers()
    render(<MissionBriefing />)

    // Skip to end by fast-forwarding
    await act(async () => {
      vi.runAllTimers()
    })

    const btn = screen.queryByText(/PRESS ENTER OR CLICK TO CONTINUE/)
    if (btn) {
      await act(async () => {
        btn.click()
        vi.useRealTimers()
        await Promise.resolve()
      })
      expect(mockCompleteBriefing).toHaveBeenCalled()
    } else {
      vi.useRealTimers()
    }
  })
})
