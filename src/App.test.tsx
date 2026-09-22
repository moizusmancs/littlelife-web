import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('bootstraps and lands an unauthenticated visitor on the Login screen', async () => {
    render(<App />)

    expect(await screen.findByText('Login')).toBeInTheDocument()
  })
})
