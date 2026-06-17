'use client'

import { ArrowDownCircle, FileText, LayoutDashboard, PiggyBank, ReceiptText, Shield, Tags, Upload } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/receitas', label: 'Receitas', icon: ArrowDownCircle },
  { href: '/categorias', label: 'Categorias', icon: Tags },
  { href: '/extrato', label: 'Extrato', icon: ReceiptText },
  { href: '/importar', label: 'Importar', icon: Upload },
  { href: '/reservas', label: 'Reservas', icon: PiggyBank },
  { href: '/mei', label: 'MEI', icon: FileText },
  { href: '/conta', label: 'Conta', icon: Shield },
] as const

/**
 * Persistent left nav for the (app) shell. Active item uses --primary text +
 * --muted background (base-nova menuAccent: subtle). Collapsible to icons.
 * (UI-SPEC §0)
 */
export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Gestão Financeira
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      className="data-active:bg-muted data-active:text-primary"
                      render={
                        <Link href={item.href}>
                          <item.icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
