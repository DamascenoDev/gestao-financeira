// 6-W0-07 (SEC-01 / SEC-02 re-audit / threat T-1-01) — the secret-leak gate over
// the BUILT client bundle. This stays meaningful now that admin.ts actually USES
// SUPABASE_SECRET_KEY server-side: the gate proves the secret never reaches
// `.next/static` even though the delete path references it. The "clean/absent =>
// pass" contract is preserved; the new, stronger assertion (the markers are ALSO
// absent after a real `next build`) is the phase-gate step run in Wave 4 — kept as
// a named `it.todo` here so the unit run stays fast and offline.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scriptPath = resolve(__dirname, '..', 'scripts', 'check-bundle-secrets.sh')
const staticDir = resolve(__dirname, '..', '.next', 'static')

describe('check-bundle-secrets.sh (SEC-02 / 6-W0-07 / T-1-01)', () => {
  it('exits 0 when no secret marker is present in the client bundle', () => {
    // Throws (non-zero exit) if the script finds a secret marker.
    expect(() =>
      execFileSync('bash', [scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] }),
    ).not.toThrow()
  })

  it('exits 0 when the bundle directory is absent (nothing built yet)', () => {
    expect(() =>
      execFileSync('bash', [scriptPath, '.next/__definitely_missing__'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).not.toThrow()
  })

  it('the script greps the right secret markers (service_role / sb_secret_ / SUPABASE_SECRET_KEY)', () => {
    const src = execFileSync('cat', [scriptPath], { encoding: 'utf8' })
    expect(src).toContain('sb_secret_')
    expect(src).toContain('service_role')
    expect(src).toContain('SUPABASE_SECRET_KEY')
  })

  it('if a real .next/static build exists, it is free of secret markers', () => {
    if (!existsSync(staticDir)) {
      // No build present in this run — the offline contract (absent => pass) holds;
      // the real-build assertion is the Wave 4 phase gate (it.todo below).
      return
    }
    expect(() =>
      execFileSync('bash', [scriptPath, staticDir], { stdio: ['ignore', 'pipe', 'pipe'] }),
    ).not.toThrow()
  })

  // Wave 4 phase gate: `npm run build` then re-run this script against the fresh
  // `.next/static` and require exit 0 (now that the secret is actually used).
  it.todo('Wave 4: after a real `next build`, `.next/static` has no secret markers')
})
