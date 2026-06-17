"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Three-way theme control — Claro / Escuro / Sistema (Plan 07-01, UI-02).
 *
 * Mount-guarded (returns null until the mount effect runs) so the server-rendered
 * markup and the first client paint match — next-themes only knows the resolved
 * theme after hydration, and reading it before mount causes a hydration mismatch
 * (RESEARCH Pitfall 2). Each option is a real <button> with an accessible name
 * (the visible pt-BR label) and selecting it calls setTheme with the matching
 * next-themes value. Colors come from CSS vars only (no hardcoded hex/oklch) so
 * the control re-themes on the .dark flip.
 *
 * Drops into the UserMenu dropdown and is mirrored in the mobile drawer footer
 * (wiring lands in a later plan); the component itself is self-contained.
 */
const OPTIONS = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "system", label: "Sistema", Icon: Monitor },
] as const

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  // Avoid hydration mismatch: render nothing until the client has mounted.
  if (!mounted) return null

  return (
    <div role="group" aria-label="Tema" className="flex items-center gap-1">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
