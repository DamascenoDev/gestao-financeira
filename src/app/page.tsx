import { redirect } from 'next/navigation'

export default function Home() {
  // Middleware sends unauthenticated users to /auth/login; an authenticated
  // user landing on / goes straight to their dashboard.
  redirect('/dashboard')
}
