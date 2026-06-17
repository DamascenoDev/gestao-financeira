import { Info } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * MeiDisclaimer (MEI-06) — the persistent, visible, NON-dismissible MEI notice. A
 * full-width --muted rounded banner (NOT a thin footer) with a calm `info` glyph
 * (never an alarm/destructive icon — this is informational, not an error) and never
 * teal (reserved for actions). Rendered ONCE in the /mei segment layout so it is on
 * every MEI screen above the content, and included in the report print header.
 * `role="note"` keeps it a standing region in the a11y tree. (UI-SPEC §Disclaimer)
 */
export function MeiDisclaimer({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        'bg-muted text-muted-foreground flex items-start gap-2 rounded-lg p-4 text-sm',
        className,
      )}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        <span className="text-foreground font-semibold">
          Este módulo é informativo e não constitui consultoria fiscal.
        </span>{' '}
        Os valores e o status são uma estimativa baseada nos seus registros.
        Confirme suas obrigações com um contador ou no Portal do Empreendedor.
      </p>
    </div>
  )
}
