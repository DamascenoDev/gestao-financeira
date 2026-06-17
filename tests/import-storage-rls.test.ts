// IMP-01 (4-W0-10 storage half / threat T-04-03): the statements Storage bucket is
// scoped to {user_id}/. A path NOT prefixed by the caller's uid is denied; a
// {user_id}/ path is permitted. The per-verb policy split (0003) preserves this
// gate on every verb. The signed-upload UX lands in Plan 02.
//
// Runs against `supabase start` (local Docker stack only).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  userA = await createUser('storage-a')
  userB = await createUser('storage-b')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
  if (userB?.id) await admin.auth.admin.deleteUser(userB.id).catch(() => {})
})

describe('IMP-01 Storage RLS: statements bucket scoped to {user_id}/', () => {
  it('a user CAN upload to their own {user_id}/ path', async () => {
    const a = userClient(userA.jwt, config)
    const path = `${userA.id}/${crypto.randomUUID()}.ofx`
    const { error } = await a.storage
      .from('statements')
      .upload(path, new Blob(['OFXHEADER:100'], { type: 'text/plain' }))
    expect(error).toBeNull()
  })

  it('a user CANNOT upload to a path NOT prefixed by their uid (forged folder)', async () => {
    const a = userClient(userA.jwt, config)
    // Forge another user's folder — the insert policy must deny it.
    const forged = `${userB.id}/${crypto.randomUUID()}.ofx`
    const { error } = await a.storage
      .from('statements')
      .upload(forged, new Blob(['OFXHEADER:100'], { type: 'text/plain' }))
    expect(error).not.toBeNull() // denied by the {user_id}/ path scope
  })

  it("a user CANNOT read another user's object", async () => {
    const a = userClient(userA.jwt, config)
    const b = userClient(userB.jwt, config)
    const path = `${userB.id}/${crypto.randomUUID()}.ofx`
    await b.storage
      .from('statements')
      .upload(path, new Blob(['secret'], { type: 'text/plain' }))
    const { data, error } = await a.storage.from('statements').download(path)
    // RLS denies the cross-user read (no bytes returned).
    expect(error !== null || data === null).toBe(true)
  })

  // Plan 02 GREEN: the signed-URL mint + uploadToSignedUrl round-trip is the
  // mechanism createSignedStatementUpload + the client uploader use. We exercise it
  // directly (the Server Action wraps this exact call with getClaims + ext validation,
  // proven in src/actions/import.test.ts) to prove the {user_id}/ scoped signed
  // upload lands the bytes in the private bucket.
  it('a {user_id}/ scoped signed upload URL round-trips the bytes into the bucket', async () => {
    const a = userClient(userA.jwt, config)
    const path = `${userA.id}/${crypto.randomUUID()}.ofx`
    const signed = await a.storage.from('statements').createSignedUploadUrl(path)
    expect(signed.error).toBeNull()
    expect(signed.data?.path).toBe(path) // scoped to the caller's uid folder

    const up = await a.storage
      .from('statements')
      .uploadToSignedUrl(path, signed.data!.token, new Blob(['OFXHEADER:100']))
    expect(up.error).toBeNull()

    // The object is now readable by its owner (and only its owner — proven above).
    const down = await a.storage.from('statements').download(path)
    expect(down.error).toBeNull()
    expect(down.data).not.toBeNull()
  })
})
