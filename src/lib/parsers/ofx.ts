// In-house OFX SGML parser (IMP-03). Per the supply-chain directive NO third-party
// OFX npm library is used (the flagged low-trust extractor is intentionally absent);
// the OFX surface we need is small and isolated, so we walk the SGML for the
// STMTTRN subset ourselves.
//
// OFX 1.x is SGML: tags are often UNCLOSED (`<TRNAMT>-1234.56` with the value
// running to the next `<` or EOL), which is why a generic XML parser is the wrong
// tool. We extract each <STMTTRN>...</STMTTRN> block and read its leaf fields by
// tag name. Callers pass already-decoded text (the latin1→UTF-8 decode lives in
// the ingest action, Plan 02) so this stays a pure string→rows function.

import { normalizeDescriptor } from '@/lib/normalize'
import type { RawTransaction } from './types'

/**
 * Convert an OFX DTPOSTED ('YYYYMMDD' optionally followed by 'HHMMSS[.xxx][TZ]')
 * to a civil 'YYYY-MM-DD' date string. Only the first 8 digits are significant for
 * the civil day (Pitfall 3: never slice as MM/DD or leave it as YYYYMMDD).
 */
export function ofxDateToCivil(dtposted: string): string {
  const digits = dtposted.trim().slice(0, 8)
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`DTPOSTED inválido: "${dtposted}"`)
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

/**
 * Convert an OFX TRNAMT (DOT-decimal, leading '-' for debits, e.g. "-1234.56") to
 * positive integer centavos. This is NOT parseBRLToCents (which expects pt-BR comma
 * format, Pitfall 2): OFX is dot-decimal. The sign is dropped — amount_cents is
 * always positive and the expense/effect derives from kind, mirroring the money
 * invariant. Rounds exactly once.
 */
export function ofxAmountToCents(trnamt: string): number {
  const raw = trnamt.trim()
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`TRNAMT inválido: "${trnamt}"`)
  }
  const value = Math.abs(Number(raw))
  return Math.round(value * 100)
}

/** Read a leaf tag's value from an SGML block (value runs to the next `<` or EOL). */
function readTag(block: string, tag: string): string | undefined {
  // Matches `<TAG>value` where value is everything up to the next tag or newline.
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')
  const m = block.match(re)
  return m ? m[1]?.trim() : undefined
}

/**
 * Parse OFX text into normalized RawTransaction[]. Walks every <STMTTRN> block and
 * extracts TRNTYPE/DTPOSTED/TRNAMT/FITID/NAME/MEMO. descriptor_raw prefers MEMO
 * then NAME (Pitfall 5: MEMO carries the richer merchant string); descriptor_norm
 * is normalizeDescriptor(descriptor_raw). Handles single-vs-many STMTTRN, latin1
 * (already decoded by the caller), and multi-line MEMO (the value is read up to the
 * line break, matching how BR exports lay out STMTTRN leaves one-per-line).
 */
export function parseOfx(text: string): RawTransaction[] {
  const rows: RawTransaction[] = []
  // Each transaction lives in a <STMTTRN>...</STMTTRN> block. The closing tag is
  // present in well-formed OFX; we split defensively on the opening tag too.
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let match: RegExpExecArray | null
  while ((match = blockRe.exec(text)) !== null) {
    const block = match[1] ?? ''
    const dtposted = readTag(block, 'DTPOSTED')
    const trnamt = readTag(block, 'TRNAMT')
    if (!dtposted || !trnamt) continue // not a real transaction block

    const memo = readTag(block, 'MEMO')
    const name = readTag(block, 'NAME')
    const descriptor_raw = (memo ?? name ?? '').trim()

    rows.push({
      occurred_on: ofxDateToCivil(dtposted),
      amount_cents: ofxAmountToCents(trnamt),
      descriptor_raw,
      descriptor_norm: normalizeDescriptor(descriptor_raw),
      fitid: readTag(block, 'FITID'),
    })
  }
  return rows
}
