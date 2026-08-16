import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../app'

describe('Morningstar operations shell', () => {
  it('renders the site-first shell when no system exists yet', async () => {
    render(<App />)

    expect(screen.getByText('Morningstar')).toBeInTheDocument()
    expect(await screen.findByText('No site is configured')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Site overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Solar day planner' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Site digital twin' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Operations intelligence' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Controllers' })).toBeInTheDocument()
  })
})
