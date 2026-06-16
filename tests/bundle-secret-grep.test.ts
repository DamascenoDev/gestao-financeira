// RED until Wave 3: this asserts the SEC-02 secret-leak gate over the BUILT
// client bundle. Until Wave 3 wires a build into the test path, `.next/static`
// may be absent/stale, so the script's "clean/absent => pass" contract is what
// we assert here. The gate becomes a meaningful guard once Wave 3 builds the
// client. (threat T-1-01)

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scriptPath = resolve(__dirname, '..', 'scripts', 'check-bundle-secrets.sh')

describe('check-bundle-secrets.sh (SEC-02 / T-1-01)', () => {
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
})
