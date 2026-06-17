// 6-W0-06 (SEC-01) — Storage isolation + signed-URL-only posture. Extends the
// import-storage-rls.test.ts proofs: user B cannot read/list/delete user A's
// `{userA.id}/` objects. Plus two static/audit assertions that lock the
// "no public exposure" invariant:
//   (b) `getPublicUrl` appears nowhere under src/ (faturas only via signed URL).
//   (c) the `statements` bucket is private (public === false).
// GREEN now: the bucket is already private (Phase 4) and src/ already avoids
// getPublicUrl — this test pins those invariants against regression.
//
// Runs against `supabase start` (local Docker stack only).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(__dirname, '..', 'src')

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let userB: { id: string; jwt: string }

async function createUser(prefix: string): Promise<{ id: string; jwt: string }> {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`
  const password = 'test-password-123!'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  const signIn = userClient('', config)
  const { data: session, error: signInErr } = await signIn.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr || !session.session) throw new Error(`signIn failed: ${signInErr?.message}`)
  return { id: data.user.id, jwt: session.session.access_token }
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('storiso-a')
  userB = await createUser('storiso-b')
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('Storage isolation: B cannot touch A objects (6-W0-06)', () => {
  it("B cannot download A's {userA.id}/ object", async () => {
    const a = userClient(userA.jwt, config)
    const b = userClient(userB.jwt, config)
    const path = `${userA.id}/${crypto.randomUUID()}.ofx`
    const up = await a.storage
      .from('statements')
      .upload(path, new Blob(['OFXHEADER:100'], { type: 'text/plain' }))
    expect(up.error).toBeNull()

    const { data, error } = await b.storage.from('statements').download(path)
    expect(error !== null || data === null).toBe(true) // cross-user read denied
  })

  it("B cannot list A's {userA.id}/ folder", async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.storage.from('statements').list(userA.id)
    expect(data ?? []).toHaveLength(0) // RLS hides A's objects from B
  })

  it("B cannot delete A's {userA.id}/ object", async () => {
    const a = userClient(userA.jwt, config)
    const b = userClient(userB.jwt, config)
    const path = `${userA.id}/${crypto.randomUUID()}.ofx`
    await a.storage.from('statements').upload(path, new Blob(['x'], { type: 'text/plain' }))

    await b.storage.from('statements').remove([path]) // denied/no-op for B
    // The object is still there for its owner A.
    const { data, error } = await a.storage.from('statements').download(path)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })
})

describe('Storage public-exposure audit (6-W0-06 / Pitfall 5)', () => {
  it('no getPublicUrl appears anywhere under src/ (signed URLs only)', () => {
    let hits = ''
    try {
      // grep exits 0 (with matches) only if getPublicUrl is present.
      hits = execFileSync('grep', ['-rn', 'getPublicUrl', srcDir], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      // grep exits non-zero when there are NO matches → clean (the desired state).
      hits = ''
    }
    expect(hits.trim()).toBe('')
  })

  it('the statements bucket is private (public === false)', async () => {
    const { data, error } = await admin.storage.getBucket('statements')
    expect(error).toBeNull()
    expect(data?.public).toBe(false)
  })
})
