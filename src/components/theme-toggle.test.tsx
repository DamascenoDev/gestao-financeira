import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Wave-0 contract test for ThemeToggle (Plan 07-01, Task 1 — RED).
 *
 * Authored BEFORE the production component exists (Nyquist Wave-0): `next-themes`
 * is mocked so collection never crashes on the missing provider, and the controlled
 * `setTheme` spy lets us assert the 3-way contract:
 *   1. mount-guard — nothing with the labels paints before the mount effect runs,
 *      then the three pt-BR rótulos "Claro" / "Escuro" / "Sistema" appear;
 *   2. selecting each option calls setTheme('light' | 'dark' | 'system');
 *   3. each control has an accessible name.
 *
 * RED until Task 2 creates `src/components/theme-toggle.tsx` (the import below
 * resolves once the component exists → GREEN).
 */

const setTheme = vi.fn()

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', setTheme }),
}))

// Imported after the mock is registered. Resolves once Task 2 ships the component.
import { ThemeToggle } from '@/components/theme-toggle'

beforeEach(() => {
  setTheme.mockClear()
})

describe('ThemeToggle', () => {
  it('is mount-guarded then renders the three pt-BR options', async () => {
    render(<ThemeToggle />)

    // After the mount effect, the three labels are present (mount-guard resolves).
    await waitFor(() => {
      expect(screen.getByText('Claro')).toBeInTheDocument()
    })
    expect(screen.getByText('Escuro')).toBeInTheDocument()
    expect(screen.getByText('Sistema')).toBeInTheDocument()
  })

  it('calls setTheme with light / dark / system on selection', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /claro/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /claro/i }))
    expect(setTheme).toHaveBeenCalledWith('light')

    await user.click(screen.getByRole('button', { name: /escuro/i }))
    expect(setTheme).toHaveBeenCalledWith('dark')

    await user.click(screen.getByRole('button', { name: /sistema/i }))
    expect(setTheme).toHaveBeenCalledWith('system')
  })

  it('gives every control an accessible name', async () => {
    render(<ThemeToggle />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /claro/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /escuro/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sistema/i })).toBeInTheDocument()
  })
})
