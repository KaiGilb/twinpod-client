// UNIT_TYPE=Hook
//
// pod-write-circuit — stops a client from hammering TwinPod after an
// auth/permission failure.
//
// Named cause (2026-09-07, TomTwin / crowboxpartners.twinpod.us):
//   The app kept GET+PUT thebrain-credits.json and PUT manifest.json +
//   content.json in a tight loop after trinity returned 403 (service restart
//   invalidated the session). Save-queue has no retry of its own, but callers
//   re-enqueue on isDirty / stream-end / Restore, and decrementCredit still
//   PUTs after a 403 GET. Each attempt is a real HTTP request.
//
// Terminal statuses (will not recover without a new login):
//   401 Unauthorized, 403 Forbidden.
// HTTP 0 (no session / CORS / abort) is NOT a global trip — a save can race
// the session. The save-queue consecutive-failure pause covers 0-loops.
//
// Public API (on `ur`):
//   ur.isTerminalPodWriteStatus(status) → boolean
//   ur.tripPodWriteCircuit(status, reason?) → boolean (true if tripped)
//   ur.podWritesBlocked() → boolean
//   ur.podWriteCircuitStatus() → number | null
//   ur.resetPodWriteCircuit() → void
//   ur._resetPodWriteCircuitForTesting() → void

import { ur } from './util-rdf.js'

const TERMINAL_STATUSES = new Set([401, 403])

let _blocked = false
let _blockedStatus = null

/**
 * True when this HTTP status will not recover without a new login.
 * @param {number|string|null|undefined} status
 * @returns {boolean}
 */
ur.isTerminalPodWriteStatus = function (status) {
  return TERMINAL_STATUSES.has(Number(status))
}

/**
 * Open the circuit. Further pod writes should fail-fast (no network).
 * No-op for non-terminal statuses. Idempotent.
 *
 * @param {number|string} status
 * @param {string} [reason]  URL or label for the log line
 * @returns {boolean} true when the circuit is (now) open
 */
ur.tripPodWriteCircuit = function (status, reason) {
  const code = Number(status)
  if (!TERMINAL_STATUSES.has(code)) return _blocked
  if (!_blocked) {
    _blocked = true
    _blockedStatus = code
    console.warn(
      '[pod-write-circuit] OPEN — stopping further pod writes until re-login',
      { status: code, reason: reason || '' }
    )
  }
  return true
}

/**
 * @returns {boolean}
 */
ur.podWritesBlocked = function () {
  return _blocked
}

/**
 * Status that tripped the circuit, or null if closed.
 * @returns {number | null}
 */
ur.podWriteCircuitStatus = function () {
  return _blockedStatus
}

/**
 * Close the circuit. Call after a successful login / silent re-auth so
 * writes can resume. Save-queue wraps this to also unpause per-key pauses.
 */
ur.resetPodWriteCircuit = function () {
  _blocked = false
  _blockedStatus = null
}

/**
 * Test-only — same as reset. NEVER call from app code.
 */
ur._resetPodWriteCircuitForTesting = function () {
  ur.resetPodWriteCircuit()
}

export {}
