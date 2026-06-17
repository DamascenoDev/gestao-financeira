// Carro resumo (v_carro_resumo) presentation helpers. PURE — no DB, no I/O.
// The single home for the "0/missing gasto → no-data" null rule so the list KPI
// strip (/carros) and the detail KPI card (/carros/[id]) can never drift.

/**
 * Coalesce a `v_carro_resumo.gasto_total_cents` value to the KPI's display shape:
 * a strictly-positive cents number, or `null` for "no data".
 *
 * The view coalesces gasto to 0 for a carro with NO tagged spend, but the UI must
 * render the '—' sentinel for no-data — NEVER "R$ 0,00" (D4 / UI-SPEC §Money null
 * rule). So 0, negative, or missing all map to null. Lives in exactly one place so
 * the list and detail pages always agree on whether a carro shows `R$ x` or `—`.
 */
export function gastoOrNull(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null
}
