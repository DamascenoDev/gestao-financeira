// CLS-01: memory-first classification. A point-read on merchant_patterns by the
// caller's normalized descriptor — RLS scopes the read to the caller's own rows
// and the unique(user_id, descriptor_norm) constraint guarantees 0 or 1 row. A HIT
// auto-classifies with ZERO external calls; a MISS (null) leaves the review row
// unclassified for a manual pick (no AI in v1).

import type { SupabaseClient } from '@supabase/supabase-js'

/** The learned mapping for a known merchant (category + optional reserva). */
export interface MemoryHit {
  category_id: string
  reserva_id: string | null
}

/**
 * Look up the learned category (and optional reserva, RSV-06) for a normalized
 * descriptor. Returns the mapping on a hit, or null on a miss. The query runs
 * under the RLS-active client so it only ever sees the caller's own patterns.
 */
export async function lookupMemory(
  supabase: SupabaseClient,
  descriptorNorm: string,
): Promise<MemoryHit | null> {
  const { data } = await supabase
    .from('merchant_patterns')
    .select('category_id, reserva_id')
    .eq('descriptor_norm', descriptorNorm)
    .maybeSingle()
  return data ?? null
}
