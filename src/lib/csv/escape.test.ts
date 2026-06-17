// Unit test for the shared CSV field escaper (CR-01). Proves both threat classes:
//   1. spreadsheet formula injection (=,+,-,@,leading TAB, leading CR) is neutralized
//      with a leading apostrophe;
//   2. RFC-4180 layout escaping (;, ", CR, LF) wraps + doubles inner quotes;
//   3. benign values pass through untouched (the guard is a no-op for safe text).

import { describe, it, expect } from 'vitest'

import { csvField } from './escape'

describe('csvField — shared CSV escaper', () => {
  it('prefixes a leading formula trigger with an apostrophe (=,+,-,@,TAB,CR)', () => {
    expect(csvField('=1+1')).toBe("'=1+1")
    expect(csvField('+x')).toBe("'+x")
    expect(csvField('-x')).toBe("'-x")
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvField('\tcmd')).toBe("'\tcmd")
    // A leading CR is BOTH a formula trigger AND an RFC-4180 special char: it is
    // guarded with `'` and then the whole cell is RFC-4180-quoted.
    expect(csvField('\rcmd')).toBe('"\'\rcmd"')
  })

  it('neutralizes the DDE command-exec vector even when the value also needs quoting', () => {
    // =cmd|'/c calc'!A1 starts with `=` (formula trigger) AND contains a `"`-free but
    // quote-bearing payload; the guard prefixes `'` BEFORE RFC-4180 quoting.
    expect(csvField("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1")
    // A trigger value that also contains a delimiter is guarded then RFC-4180-quoted.
    expect(csvField('=1;2')).toBe('"\'=1;2"')
  })

  it('RFC-4180-quotes and doubles inner quotes for ; " CR LF (no formula trigger)', () => {
    expect(csvField('a;b')).toBe('"a;b"')
    expect(csvField('a"b')).toBe('"a""b"')
    expect(csvField('a\nb')).toBe('"a\nb"')
    expect(csvField('a\r\nb')).toBe('"a\r\nb"')
  })

  it('passes benign values through untouched (no quote, no apostrophe)', () => {
    expect(csvField('Padaria São João')).toBe('Padaria São João')
    expect(csvField('R$ 1.234,56')).toBe('R$ 1.234,56')
    expect(csvField('2026')).toBe('2026')
    expect(csvField('')).toBe('')
  })
})
