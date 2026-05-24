// UNIT_TYPE=Hook

/**
 * TwinPod JSON read/write primitives — attaches ur.uploadJSON, ur.readJSON.
 *
 * Why this exists (Cycle-15 root cause + BareFileSave 2026-05-23):
 *   ur.hyperFetch attaches an RDF-leaning Accept header
 *     `text/turtle;q=1.0, application/ld+json;q=0.9, application/rdf+xml;q=0.8, * / *;q=0.1`
 *   and the `hypergraph` header. For .json / .jsonld resources this causes
 *   TwinPod to return Turtle (not JSON) on subsequent reads, breaking
 *   JSON.parse and leaving callers with no usable body. Five live JSON saves
 *   in the tomgilb-chat / twinpod-ui composables bypass ur.* and call
 *   authenticatedFetch directly because of this — a single-namespace
 *   violation per the VACoder rules in `.claude/commands/vacoder.md`.
 *
 *   These primitives restore single-namespace compliance: they route
 *   through window.solid.session.fetch directly (NOT via ur.hyperFetch) and
 *   force the JSON-friendly Content-Type / Accept headers. Callers stop
 *   importing session.fetch themselves and stop reaching into Inrupt API.
 *
 * What this does NOT do:
 *   - Does NOT enqueue saves. Combine with ur.enqueueSave at the call site
 *     when serialisation across concurrent writes is required (e.g. the
 *     four ledger paths in useCreditLedger). The brief documents this
 *     pattern; see Group 5 (Credit ledger) in the dispatch.
 *   - Does NOT do read-modify-write. The caller is responsible for that —
 *     the caller's payloadBuildFn (running inside the queued task) is
 *     where the GET / merge / PUT happens.
 */
import { ur } from './util-rdf.js'

function _getSessFetch() {
  const sess = typeof window !== 'undefined' ? window?.solid?.session : null
  return sess?.fetch?.bind(sess) || null
}

/**
 * PUT a JSON value to a pod resource with the correct Content-Type and
 * without the RDF Accept headers that confuse content negotiation.
 *
 * @param {string} url        - Absolute pod URL. NOT validated here.
 * @param {any}    value      - Value to serialise via JSON.stringify, OR
 *                              an already-serialised string (passed through
 *                              unchanged when typeof value === 'string').
 * @returns {Promise<Response | { ok: false, status: number, error: any }>}
 *          The fetch Response on success or failure path; the explicit
 *          fallback object only when fetch itself throws (no session, etc).
 */
ur.uploadJSON = async function (url, value) {
  const sessFetch = _getSessFetch()
  if (!sessFetch) {
    return { ok: false, status: 0, error: new Error('no authenticated session') }
  }
  const body = typeof value === 'string' ? value : JSON.stringify(value)
  try {
    const res = await sessFetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body
    })
    return res
  } catch (err) {
    return { ok: false, status: 0, error: err }
  }
}

/**
 * GET a JSON value from a pod resource without the RDF Accept headers.
 *
 * Returns `{ ok, status, value, raw }`:
 *   - `ok`     : the HTTP layer succeeded (2xx).
 *   - `status` : numeric HTTP status (0 on network failure).
 *   - `value`  : parsed JSON value, or null if parse failed / status not 2xx.
 *   - `raw`    : the raw response text (so callers can shape-check or fall
 *                back to alternate parsers).
 *
 * Never throws. The TwinPod 200-not-404 fabricated-metadata quirk is the
 * caller's responsibility — use isRealTwinPodResource (or similar) on the
 * parsed value at the call site.
 */
ur.readJSON = async function (url) {
  const sessFetch = _getSessFetch()
  if (!sessFetch) {
    return { ok: false, status: 0, value: null, raw: '' }
  }
  let res
  try {
    res = await sessFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    })
  } catch (err) {
    return { ok: false, status: 0, value: null, raw: '', error: err }
  }
  let raw = ''
  try { raw = await res.text() } catch { raw = '' }
  if (!res.ok) return { ok: false, status: res.status, value: null, raw }
  let value = null
  if (raw) {
    try { value = JSON.parse(raw) } catch { value = null }
  }
  return { ok: true, status: res.status, value, raw }
}

export {}
