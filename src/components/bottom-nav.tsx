'use client'

import { Car, FileText, LayoutDashboard, PiggyBank, ReceiptText, Upload } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/**
 * BottomNav — persistent mobile (<md) bottom navigation for the primary
 * destinations. Copies the app-sidebar grammar verbatim: the same
 * `{ href, label, icon }` shape (a SUBSET of the primary destinations per
 * UI-SPEC §Responsive) and the same `usePathname` active-detection
 * (`pathname === href || pathname.startsWith(href + '/')`). The active item is
 * gold (`text-primary`); touch targets are ≥48px (`min-h-12`). Gated by
 * `useIsMobile` (768px) so it renders only on mobile and returns null on desktop
 * — navigation behavior is frozen, this only adds mobile chrome.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/extrato', label: 'Extrato', icon: ReceiptText },
  { href: '/importar', label: 'Importar', icon: Upload },
  { href: '/mei', label: 'MEI', icon: FileText },
  { href: '/reservas', label: 'Reservas', icon: PiggyBank },
  { href: '/carros', label: 'Carros', icon: Car },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const isMobile = useIsMobile()

  if (!isMobile) return null

  return (
    <nav
      data-print="hide"
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 py-3 text-xs transition-colors',
              isActive
                ? 'font-medium text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <item.icon className="size-5" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
