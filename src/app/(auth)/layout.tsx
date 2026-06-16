import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Inverse guard (MD-02): an already-authenticated user should never see the
  // login/signup forms (where re-submitting signUp errors as "User already
  // registered"). getClaims() validates the JWT signature server-side — mirror
  // of the (app) shell's defense-in-depth check, in the opposite direction.
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (data?.claims) {
    redirect('/dashboard')
  }

  return children
}
