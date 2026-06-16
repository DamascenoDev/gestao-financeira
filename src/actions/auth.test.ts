import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------

// redirect() in Next throws a special control-flow error; emulate that so we can
// assert "a redirect happened" without it being swallowed as a normal return.
const REDIRECT_SENTINEL = 'NEXT_REDIRECT'
const redirectMock = vi.fn((url: string) => {
  const err = new Error(`${REDIRECT_SENTINEL}:${url}`)
  throw err
})
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const signInWithPassword = vi.fn()
const signUp = vi.fn()
const signOut = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword,
      signUp,
      signOut,
    },
  })),
}))

// Import AFTER the mocks are registered.
import { signIn, signUp as signUpAction, signOut as signOutAction } from './auth'

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

async function expectRedirect(fn: () => Promise<unknown>, to: string) {
  await expect(fn()).rejects.toThrow(`${REDIRECT_SENTINEL}:${to}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  signInWithPassword.mockResolvedValue({ error: null })
  signUp.mockResolvedValue({ error: null })
  signOut.mockResolvedValue({ error: null })
})

// --- Tests -----------------------------------------------------------------

describe('signIn', () => {
  it('redirects to /dashboard with valid credentials', async () => {
    await expectRedirect(
      () => signIn(formData({ email: 'a@b.com', password: 'password123' })),
      '/dashboard'
    )
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password123',
    })
  })

  it('returns { error } on invalid credentials (no throw, no redirect)', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    const result = await signIn(formData({ email: 'a@b.com', password: 'password123' }))
    expect(result).toEqual({ error: 'Invalid login credentials' })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('rejects malformed email BEFORE calling Supabase', async () => {
    const result = await signIn(formData({ email: 'not-an-email', password: 'password123' }))
    expect(result).toHaveProperty('error')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects too-short password BEFORE calling Supabase', async () => {
    const result = await signIn(formData({ email: 'a@b.com', password: 'short' }))
    expect(result).toHaveProperty('error')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })
})

describe('signUp', () => {
  it('redirects to /dashboard on success (email confirmation off → active session)', async () => {
    await expectRedirect(
      () => signUpAction(formData({ email: 'a@b.com', password: 'password123' })),
      '/dashboard'
    )
    expect(signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password123',
    })
  })

  it('returns { error } on Supabase error', async () => {
    signUp.mockResolvedValue({ error: { message: 'User already registered' } })
    const result = await signUpAction(formData({ email: 'a@b.com', password: 'password123' }))
    expect(result).toEqual({ error: 'User already registered' })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('rejects invalid input BEFORE calling Supabase', async () => {
    const result = await signUpAction(formData({ email: 'bad', password: 'x' }))
    expect(result).toHaveProperty('error')
    expect(signUp).not.toHaveBeenCalled()
  })
})

describe('signOut', () => {
  it('clears the session and redirects to /auth/login', async () => {
    await expectRedirect(() => signOutAction(), '/auth/login')
    expect(signOut).toHaveBeenCalled()
  })
})
