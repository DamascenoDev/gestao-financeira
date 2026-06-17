import { redirect } from 'next/navigation'

import { AppSidebar } from '@/components/app-sidebar'
import { BottomNav } from '@/components/bottom-nav'
import { MonthSelector } from '@/components/month-selector'
import { UserMenu } from '@/components/user-menu'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/server'

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

  const email = (data.claims.email as string | undefined) ?? ''

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header
          data-print="hide"
          className="flex h-14 items-center justify-between gap-2 border-b px-4"
        >
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <MonthSelector />
          </div>
          {/* Logout lives in the shared shell → available on every (app) page (AUTH-04). */}
          <UserMenu email={email} />
        </header>
        {/* pb-20 on mobile keeps content clear of the persistent BottomNav. */}
        <main className="flex-1 p-6 pb-20 md:pb-6">{children}</main>
        <BottomNav />
      </SidebarInset>
    </SidebarProvider>
  )
}
