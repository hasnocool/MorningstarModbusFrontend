import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../app'

describe('Morningstar operations shell', () => {
  it('renders the system shell and empty device state', async () => {
    render(<App />)

    expect(screen.getByText('Morningstar')).toBeInTheDocument()
    expect(await screen.findByText('No active device selected')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
  })
})
