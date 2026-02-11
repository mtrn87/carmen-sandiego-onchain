import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NicknameModal from '../NicknameModal'

// Mock gameStore
vi.mock('../../store/gameStore', () => ({
  useGameStore: vi.fn((selector) => {
    const state = { setPlayerNickname: vi.fn() }
    return selector ? selector(state) : state
  }),
}))

// Mock NeonButton to a simple button
vi.mock('../NeonButton', () => ({
  default: ({ children, onClick, disabled, loading }) => (
    <button onClick={onClick} disabled={disabled || loading} data-testid="neon-btn">
      {children}
    </button>
  ),
}))

describe('NicknameModal', () => {
  it('renders without crash', () => {
    render(<NicknameModal onConfirm={vi.fn()} />)
    expect(screen.getByText('[ AGENT REGISTRATION ]')).toBeInTheDocument()
  })

  it('shows error for nickname shorter than 3 chars', async () => {
    const user = userEvent.setup()
    render(<NicknameModal onConfirm={vi.fn()} />)

    const input = screen.getByPlaceholderText('Your nickname...')
    await user.type(input, 'ab')

    expect(screen.getByText('Nickname must be at least 3 characters')).toBeInTheDocument()
  })

  it('shows error for invalid characters', async () => {
    const user = userEvent.setup()
    render(<NicknameModal onConfirm={vi.fn()} />)

    const input = screen.getByPlaceholderText('Your nickname...')
    await user.type(input, 'test@user')

    expect(screen.getByText(/can only contain/)).toBeInTheDocument()
  })

  it('accepts valid nickname and enables button', async () => {
    const user = userEvent.setup()
    render(<NicknameModal onConfirm={vi.fn()} />)

    const input = screen.getByPlaceholderText('Your nickname...')
    await user.type(input, 'detective_42')

    const btn = screen.getByTestId('neon-btn')
    expect(btn).not.toBeDisabled()
  })
})
