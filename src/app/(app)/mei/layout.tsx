import { MeiDisclaimer } from '@/components/mei-disclaimer'
import { YearSelector } from '@/components/year-selector'

/**
 * MEI route-segment layout. Renders, above every MEI screen's {children}, the
 * YearSelector (the ?ano context for the whole module — MEI is a calendar-year
 * module, so the global MonthSelector in the shell header is ignored here) and the
 * persistent MeiDisclaimer banner directly below it (MEI-06: visible on every MEI
 * screen without scrolling). This segment does NOT re-render the sidebar/shell —
 * the parent (app)/layout owns that — and never renders the global MonthSelector.
 */
export default function MeiLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div data-print="hide" className="flex items-center justify-end">
        <YearSelector />
      </div>
      <MeiDisclaimer />
      {children}
    </div>
  )
}
