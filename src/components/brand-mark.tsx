import { cn } from '@/lib/utils'

/**
 * BrandMark — the inline-SVG monogram: a rounded navy tile carrying a gold
 * ascending bar-trio (three rising bars → "growth + ledger"). Token-driven and
 * auto-theming (no PNG per theme) — copies the `aria-hidden` / token-driven
 * convention of CategoryDot in category-badge.tsx, but reads brand CSS vars
 * instead of the fixed swatch palette so it re-themes on the `.dark` flip.
 *
 * Color roles per UI-SPEC §Brand: the tile is navy (`--primary-foreground`,
 * the navy ink paired with gold) and the bar-trio is gold (`--primary`). Both
 * tokens flip together in light/dark, so the navy-tile + gold-glyph identity
 * holds in either mode with no hardcoded hex.
 *
 * 24px in the sidebar header; 32px on auth (size prop).
 */
export function BrandMark({
  size = 24,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Gestão Financeira"
      className={cn('shrink-0', className)}
    >
      {/* Navy tile — rounded square (~--radius-lg proportion at 24px). */}
      <rect x="0" y="0" width="24" height="24" rx="6" fill="var(--primary-foreground)" />
      {/* Gold ascending bar-trio — three rising bars (growth + ledger). */}
      <rect x="5" y="13" width="3.5" height="6" rx="1" fill="var(--primary)" />
      <rect x="10.25" y="9" width="3.5" height="10" rx="1" fill="var(--primary)" />
      <rect x="15.5" y="5" width="3.5" height="14" rx="1" fill="var(--primary)" />
    </svg>
  )
}
