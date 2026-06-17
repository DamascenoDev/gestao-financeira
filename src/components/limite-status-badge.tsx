import {
  AlertOctagon,
  CheckCircle2,
  OctagonX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { meiStatusTokens, type MeiGlyph } from '@/lib/mei/presentation'
import type { MeiStatus } from '@/lib/mei/status'

/**
 * LimiteStatusBadge — the single source of the MEI limit-status WORDING. Renders the
 * status label + its lucide glyph in the status token (per the UI-SPEC Semantic Color
 * table), on an `outline` badge so the chrome stays grayscale and only the text/glyph
 * carry the color (color is never the sole signal — the label survives grayscale).
 * The within-band vs over-band difference is textual + glyph, never a second red.
 */
const GLYPHS: Record<MeiGlyph, LucideIcon> = {
  'check-circle-2': CheckCircle2,
  'triangle-alert': TriangleAlert,
  'alert-octagon': AlertOctagon,
  'octagon-x': OctagonX,
}

export function LimiteStatusBadge({
  status,
  className,
}: {
  status: MeiStatus
  className?: string
}) {
  const { text, label, glyph } = meiStatusTokens(status)
  const Glyph = GLYPHS[glyph]

  return (
    <Badge variant="outline" className={cn(text, className)}>
      <Glyph aria-hidden />
      {label}
    </Badge>
  )
}
