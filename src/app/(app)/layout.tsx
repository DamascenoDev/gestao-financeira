import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from '@/components/logout-button'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Defense in depth: never trust only the middleware. Re-check the JWT claims
  // server-side and redirect if there is no authenticated user (getClaims()
  // validates the signature — not getSession()/getUser()).
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) {
    redirect('/auth/login')
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">Gestão Financeira</span>
        {/* Logout lives in the shared shell → available on every (app) page (AUTH-04). */}
        <LogoutButton />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
