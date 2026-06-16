import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  // Resolve the destination directly instead of always bouncing to /dashboard
  // and letting middleware re-bounce an unauthenticated user to /auth/login
  // (LW-03: saves a redirect hop and decouples / from the middleware matcher).
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  redirect(data?.claims ? '/dashboard' : '/auth/login')
}
