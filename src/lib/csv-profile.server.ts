// WR-04: server-only CSV-profile lookup. This is an INTERNAL helper for
// ingestStatement, NOT a network-callable Server Action. It previously lived in the
// 'use server' actions/import.ts module, where Next.js registered every exported
// async function as a callable Server Action — needlessly widening the action
// surface (any client could POST arbitrary headerSignature strings to probe whether
// a profile exists). Relocating it to a `import 'server-only'` module keeps the
// DB-touching lookup off the action boundary while still letting ingestStatement
// import it. The RLS-active client scopes the read to the caller's own profiles.

import 'server-only'

import { type CsvMapping, csvMappingSchema } from '@/lib/schemas/import'
import { createClient } from '@/lib/supabase/server'

/**
 * Point-read a saved CSV profile by header signature for silent reuse. Returns the
 * mapping on a hit (the mapper dialog is skipped) or null on a miss. RLS scopes the
 * read to the caller's own rows.
 */
export async function lookupCsvProfile(
  headerSignature: string,
): Promise<CsvMapping | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('csv_import_profiles')
    .select('mapping')
    .eq('header_signature', headerSignature)
    .maybeSingle()
  if (!data?.mapping) return null
  const parsed = csvMappingSchema.safeParse(data.mapping)
  return parsed.success ? parsed.data : null
}
