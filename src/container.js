// UNIT_TYPE=Hook

/**
 * TwinPod container helpers — attaches ur.ensureContainer.
 *
 * Why this exists (BareFileSave 2026-05-23 catalogue):
 *   Four inline near-duplicate copies of ensureContainer existed across
 *   tomgilb-chat / twinpod-ui composables (useSessionIndex, useUserFactStore,
 *   useCreditLedger, dead-path usePodWorkbook). Each copy did the same
 *   HEAD-probe → PUT BasicContainer dance; each took a slightly different
 *   `authenticatedFetch` parameter and had its own console.warn flavour.
 *
 *   This module promotes them into a single canonical primitive on `ur`.
 *   Idempotent: HEAD returns 200 → no-op; 404 → PUT a BasicContainer with
 *   an optional Slug + rdfs:label so SystemTwin™ shows a human-readable
 *   name in its tree view (per Reference_Code_TwinPod-DefaultContainers.md
 *   § Companion quirk). 409 (already exists, race condition) is treated as
 *   success — never throws.
 *
 *   Routes through window.solid.session.fetch (NOT ur.hyperFetch). The
 *   hyperFetch wrapper attaches RDF Accept headers + the hypergraph header,
 *   both of which can confuse content-negotiation on container resources.
 *   HEAD/PUT on a container needs neither, and matches the historical
 *   pattern that worked in production.
 */
import { ur } from './util-rdf.js'

/**
 * Idempotently ensure an LDP BasicContainer exists at `url`.
 *
 * @param {string} url     - Container URL, MUST end with '/'.
 * @param {object} [opts]
 * @param {string} [opts.slug]  - Slug header (display-name hint for the
 *                                SystemTwin™ pod tree). Optional.
 * @param {string} [opts.label] - rdfs:label literal written into the
 *                                container's Turtle body. Optional.
 * @returns {Promise<void>} resolves whether the container existed or was
 *                          freshly created. Logs and swallows network
 *                          failures so callers do not need a try/catch.
 */
ur.ensureContainer = async function (url, opts = {}) {
  if (!url) return
  if (!url.endsWith('/')) {
    console.warn('[ensureContainer] url must end with /:', url)
    return
  }
  // Bypass ur.hyperFetch — the RDF Accept + hypergraph headers it attaches
  // can confuse the pod's container handling. session.fetch directly is
  // the historical pattern that works.
  const sess = typeof window !== 'undefined' ? window?.solid?.session : null
  const sessFetch = sess?.fetch?.bind(sess)
  if (!sessFetch) {
    console.warn('[ensureContainer] no authenticated session — skipping', url)
    return
  }
  try {
    const check = await sessFetch(url, { method: 'HEAD' })
    if (check.ok || check.status === 200) return        // already exists
    if (check.status !== 404) return                    // unexpected → don't try to create
    const headers = {
      'Content-Type': 'text/turtle',
      Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"'
    }
    if (opts.slug) headers.Slug = opts.slug
    const body = opts.label
      ? `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<> rdfs:label "${String(opts.label).replace(/"/g, '\\"')}" .`
      : ''
    const res = await sessFetch(url, { method: 'PUT', headers, body })
    // 409 = race-condition "already exists" — acceptable; treat as success.
    if (res.ok || res.status === 409) return
    console.warn('[ensureContainer] unexpected PUT status', res.status, 'for', url)
  } catch (e) {
    console.warn('[ensureContainer] failed for', url, e?.message || e)
  }
}

export {}
