import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('rep journey', () => {
  it('gates contact behind approval and creates a follow-up', () => {
    render(<App />)
    expect(screen.queryByRole('button', { name: 'Simulate contact' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare action' }))
    expect(screen.queryByRole('button', { name: 'Simulate contact' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Approve script' }))
    fireEvent.click(screen.getByRole('button', { name: 'Simulate contact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delivery issue unresolved' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }))
    fireEvent.click(screen.getByRole('button', { name: /Follow-ups/ }))
    expect(screen.getByText('Escalate delivery issue')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(screen.getByText('No follow-ups yet')).toBeTruthy()
  })
})
