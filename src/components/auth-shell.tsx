import { BrandMark } from '@/components/brand-mark'

/**
 * AuthShell — the identity-carrying two-panel layout that wraps the existing
 * auth form (UI-03 / UI-SPEC §Screen Contracts login-landing).
 *
 * Layout:
 *  - `md` and up: two columns side-by-side — left navy brand panel, right the
 *    existing form on `--card`.
 *  - below `md`: stacked — the navy panel collapses to a compact header band
 *    over the form.
 *
 * The left/top panel sits on the navy chrome surface (`--sidebar` /
 * `--sidebar-foreground`) and carries `<BrandMark size={32} />`, the wordmark
 * "Gestão Financeira" in `font-heading` 600 with "Financeira" in gold
 * (`text-primary` — gold is allowed here per UI-SPEC §Brand, the auth/landing
 * hero is the ONLY place gold touches the wordmark), the exact value prop, and
 * the private/MEI framing. The right panel renders `{children}` (the existing
 * `AuthForm`, intact) on `--card`. No illustration (deferred).
 *
 * Pure presentation chrome — no auth logic. The inverse auth guard stays in
 * `(auth)/layout.tsx`; the login/signup behavior stays in the form/actions.
 */
export function AuthShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/* Brand panel — left column on md+, compact header band below md. */}
      <aside className="flex flex-col justify-between gap-8 bg-sidebar px-6 py-8 text-sidebar-foreground md:w-2/5 md:max-w-md md:px-10 md:py-12 lg:px-12">
        <div className="flex items-center gap-3">
          <BrandMark size={32} />
          <span className="font-heading text-xl font-semibold">
            Gestão <span className="text-primary">Financeira</span>
          </span>
        </div>

        <div className="flex flex-col gap-3 md:gap-4">
          <p className="font-heading text-base font-semibold leading-snug md:text-2xl">
            Sua gestão financeira pessoal — privada, precisa e sob seu controle.
          </p>
          <p className="hidden text-sm text-sidebar-foreground/70 md:block">
            Suba sua fatura, veja os gastos classificados automaticamente e
            acompanhe a aderência às suas metas — com um módulo dedicado ao seu
            MEI. Privado por padrão, só seu.
          </p>
        </div>
      </aside>

      {/* Form panel — the existing AuthForm, intact, on the card surface. */}
      <div className="flex flex-1 items-stretch bg-card">{children}</div>
    </div>
  )
}
