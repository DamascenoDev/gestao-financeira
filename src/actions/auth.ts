'use server'

import { redirect } from 'next/navigation'

import { authSchema } from '@/lib/auth-schema'
import { createClient } from '@/lib/supabase/server'

export type AuthActionResult = { error: string }

/**
 * Validate raw FormData against the shared Zod schema at the action boundary
 * (V5 Input Validation). Returns { error } on failure — never throws, never
 * leaks the raw input. The first issue message is surfaced to the form toast.
 */
function parseCredentials(formData: FormData):
  | { ok: true; email: string; password: string }
  | { ok: false; error: string } {
  const parsed = authSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'Dados inválidos'
    return { ok: false, error: first }
  }
  return { ok: true, email: parsed.data.email, password: parsed.data.password }
}

export async function signIn(formData: FormData): Promise<AuthActionResult> {
  const creds = parseCredentials(formData)
  if (!creds.ok) return { error: creds.error }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  })
  if (error) return { error: error.message }

  redirect('/dashboard')
}

export async function signUp(formData: FormData): Promise<AuthActionResult> {
  const creds = parseCredentials(formData)
  if (!creds.ok) return { error: creds.error }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: creds.email,
    password: creds.password,
  })
  if (error) return { error: error.message }

  // Email confirmation is OFF in v1 → the session is active immediately.
  redirect('/dashboard')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}
