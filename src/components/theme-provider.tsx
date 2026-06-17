"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * next-themes wrapper (Plan 07-01). Mounted in the root layout around
 * {children} + <Toaster/>. Pure passthrough of props to NextThemesProvider so
 * the root layout owns the configuration (attribute="class", defaultTheme,
 * enableSystem, disableTransitionOnChange). Mirrors the ui/sonner.tsx
 * "use client" + next-themes import convention.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
