// src/lib/csv/escape.ts
// Centralized CSV field escaper shared by EVERY CSV serializer in the app
// (transactions, MEI, LGPD bundle) so they cannot drift to inconsistent escaping.
//
// Two orthogonal threats are handled, in this order:
//   1. SPREADSHEET FORMULA INJECTION (CR-01 / OWASP): a cell whose first character is
//      one of `= + - @`, TAB (\t), or CR (\r) is interpreted as a FORMULA by Excel /
//      Google Sheets / LibreOffice when the .csv is opened. A user-controlled
//      `description`/`category_name` of `=HYPERLINK(...)`, `=cmd|'/c calc'!A1`, or
//      `@SUM(...)` would exfiltrate data or run a command. We neutralize it by
//      prefixing a single quote (`'`) so the cell is treated as inert text.
//   2. RFC-4180 LAYOUT: a value containing `;` `"` CR or LF is wrapped in double
//      quotes with inner quotes doubled, so it can never break the column layout.
//
// The formula guard runs BEFORE RFC-4180 quoting so the leading `'` is itself quoted
// when the value also contains a delimiter/quote/newline.

/** Leading characters that trigger formula evaluation in spreadsheet apps. */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/

/**
 * Escape a single field for `;`-delimited CSV: first defuse spreadsheet formula
 * injection (prefix a leading `= + - @ \t \r` with `'`), then RFC-4180-quote if the
 * value contains `;` `"` CR or LF (doubling inner quotes). Safe and idempotent for
 * benign values (a plain string passes through untouched).
 */
export function csvField(value: string): string {
  const safe = FORMULA_TRIGGERS.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
