import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit test for deleteMyAccount — the most dangerous operation in the
// app. The Wave-0 LOCAL integration tests (tests/lgpd-delete*.test.ts) prove the
// real erasure + isolation against the stack; THIS test asserts the action wrapper's
// contract in isolation (mocked clients):
//   - the type-to-confirm gate (confirm must equal the literal 'APAGAR');
//   - userId derives from getClaims (the session), never from input;
//   - the NON-NEGOTIABLE call order: Storage list+remove FIRST, auth.admin.deleteUser
//     LAST (a forged input userId cannot redirect the delete).

// The session userId the RLS server client reports via getClaims.
let claimsSub: string | null = 'session-user'

// Ordered log of admin-side operations so we can assert Storage-then-auth.
const opLog: string[] = []

// Configurable mock results.
let listResult: { data: unknown; error: unknown } = {
  data: [{ name: 'a.ofx' }, { name: 'b.ofx' }],
  error: null,
}
let removeResult: { error: unknown } = { error: null }
let deleteUserResult: { error: unknown } = { error: null }

const removeSpy = vi.fn((paths: string[]) => {
  opLog.push(`storage.remove:${paths.join(',')}`)
  return removeResult
})
const listSpy = vi.fn((prefix: string) => {
  opLog.push(`storage.list:${prefix}`)
  return listResult
})
const deleteUserSpy = vi.fn((id: string) => {
  opLog.push(`auth.deleteUser:${id}`)
  return deleteUserResult
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () => ({
        data: claimsSub ? { claims: { sub: claimsSub } } : null,
      })),
    },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        list: (prefix: string) => listSpy(prefix),
        remove: (paths: string[]) => removeSpy(paths),
      })),
    },
    auth: {
      admin: {
        deleteUser: (id: string) => deleteUserSpy(id),
      },
    },
  })),
}))

import { deleteMyAccount } from './delete-account'

beforeEach(() => {
  claimsSub = 'session-user'
  opLog.length = 0
  listResult = { data: [{ name: 'a.ofx' }, { name: 'b.ofx' }], error: null }
  removeResult = { error: null }
  deleteUserResult = { error: null }
  vi.clearAllMocks()
})

describe('deleteMyAccount — confirm gate', () => {
  it('rejects when confirm !== "APAGAR" and performs NO delete', async () => {
    const result = await deleteMyAccount({ confirm: 'apagar' })
    expect(result).toEqual({ ok: false, error: 'confirmacao_invalida' })
    expect(deleteUserSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
    expect(listSpy).not.toHaveBeenCalled()
  })

  it('rejects an empty confirm', async () => {
    const result = await deleteMyAccount({ confirm: '' })
    expect(result).toEqual({ ok: false, error: 'confirmacao_invalida' })
    expect(deleteUserSpy).not.toHaveBeenCalled()
  })

  it('accepts the exact literal "APAGAR"', async () => {
    const result = await deleteMyAccount({ confirm: 'APAGAR' })
    expect(result).toEqual({ ok: true })
  })
})

describe('deleteMyAccount — userId from session, never input', () => {
  it('deletes the SESSION user id (getClaims), ignoring any forged input', async () => {
    claimsSub = 'real-session-user'
    await deleteMyAccount({
      confirm: 'APAGAR',
      // a forged userId on the input must be ignored entirely
      ...({ userId: 'victim-user' } as object),
    })
    expect(deleteUserSpy).toHaveBeenCalledWith('real-session-user')
    expect(deleteUserSpy).not.toHaveBeenCalledWith('victim-user')
  })

  it('rejects when there is no session (getClaims returns no sub)', async () => {
    claimsSub = null
    const result = await deleteMyAccount({ confirm: 'APAGAR' })
    expect(result).toEqual({ ok: false, error: 'nao_autenticado' })
    expect(deleteUserSpy).not.toHaveBeenCalled()
  })
})

describe('deleteMyAccount — Storage first, auth last', () => {
  it('removes Storage objects BEFORE deleting the auth user', async () => {
    await deleteMyAccount({ confirm: 'APAGAR' })
    expect(opLog).toEqual([
      'storage.list:session-user',
      'storage.remove:session-user/a.ofx,session-user/b.ofx',
      'auth.deleteUser:session-user',
    ])
  })

  it('aborts BEFORE the auth delete if Storage remove fails (account intact + retryable)', async () => {
    removeResult = { error: { message: 'boom' } }
    const result = await deleteMyAccount({ confirm: 'APAGAR' })
    expect(result).toEqual({ ok: false, error: 'falha_storage' })
    expect(deleteUserSpy).not.toHaveBeenCalled()
  })

  it('skips remove when there are no Storage objects (idempotent no-op), still deletes auth', async () => {
    listResult = { data: [], error: null }
    const result = await deleteMyAccount({ confirm: 'APAGAR' })
    expect(result).toEqual({ ok: true })
    expect(removeSpy).not.toHaveBeenCalled()
    expect(deleteUserSpy).toHaveBeenCalledWith('session-user')
  })

  it('surfaces falha_delete when the auth delete fails', async () => {
    deleteUserResult = { error: { message: 'nope' } }
    const result = await deleteMyAccount({ confirm: 'APAGAR' })
    expect(result).toEqual({ ok: false, error: 'falha_delete' })
  })
})
