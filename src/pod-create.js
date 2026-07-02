// UNIT_TYPE=Hook

/**
 * TwinPod pod-creation helpers — attaches ur.createTrinpod, ur.checkTrinpodID, ur.verifyPodReachable.
 *
 * Ported 2026-05-30 from working code at twin/src/app/twin/src/app/libs/util-c.js:270-367
 * (c.checkTrinpodID, c.createTrinpod).
 *
 * Standard reference: Reference_Code_TwinPod-PodCreation.md
 * Wire format: Stack A2 substrate PATCH (`application/sparql-update` `INSERT DATA { ... }`)
 * to <parentPodBaseURI>/node/Substance (resolved gap SPARQL-1 / Reference_Code_TwinPod-Writes.md §2).
 * The INSERT DATA body is an EVENT-wrapped capability invocation (event-create.js), NOT a bare
 * metadata triple set — the event is what makes the server PROVISION the pod (root cause fix,
 * 2026-06-18; the bare INSERT DATA recorded metadata but never provisioned a writable pod).
 *
 * Scope: this module handles the AUTHENTICATED sub-pod / project-pod / business-pod
 * creation case (2B / 2C in PodCreation.md). The anonymous personal-pod registration
 * case (2A — POST /api/accounts/new) is gated on open question 2A-AUTH-1 and will
 * land as ur.registerNewPod when answered.
 */
import { ur } from './util-rdf.js'
// NS reached via ur.NS (set in namespaces.js) — see acl.js note.

/**
 * Check whether a trinpodID (subdomain label) is already taken on the server.
 *
 * @param {string} trinpodID  lowercase ASCII subdomain label (e.g. "gilb-business")
 * @param {string} [serverUrl]  optional override; defaults to <server> from window.solid.session or VITE_TWINPOD_SERVER env
 * @returns {Promise<{ ok: boolean, exists: boolean, status: number, body: string }>}
 */
ur.checkTrinpodID = async function(trinpodID, serverUrl) {
  if (!trinpodID) return { ok: false, exists: false, status: 0, body: 'no trinpodID' }
  const server = serverUrl
    || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TWINPOD_SERVER)
    || (typeof globalThis.location !== 'undefined' ? globalThis.location.origin : '')
  if (!server) return { ok: false, exists: false, status: 0, body: 'no server url' }
  try {
    const url = `${server.replace(/\/$/, '')}/trinpodIDExists?trinpodID=${encodeURIComponent(trinpodID)}`
    const resp = await globalThis.solid?.session?.fetch?.(url, { credentials: 'include' })
      ?? await fetch(url, { credentials: 'include' })
    const body = await resp.text()
    return { ok: resp.ok, exists: body.trim() === 'Exists', status: resp.status, body }
  } catch (err) {
    return { ok: false, exists: false, status: 0, body: String(err) }
  }
}

/**
 * Verify a newly-created pod is reachable / provisioned.
 *
 * Standard: Reference_Code_TwinPod-PodCreation.md §7.
 *
 * PRIMARY SIGNAL = the new pod's SUBSTRATE (`<podRoot>/node/Substance`), not `/i`. The live
 * run (2026-06-18) showed the `/i` identity doc LAGS behind storage during async provisioning —
 * `/i → 404` while the pod was actually coming up. The substrate (`/node/Substance`) is where
 * writes land, so we probe it with an authenticated GET as the readiness signal, and report the
 * `/i` status alongside as a secondary hint. `ok` is true when EITHER responds 2xx (substrate
 * preferred). The definitive success signal remains a real write to Substance (saveFamilyInfo).
 *
 * @param {string} trinpodUri  the new pod's WebID URI (e.g. https://gilb-business.<server-host>/i)
 * @returns {Promise<{ ok: boolean, status: number, substanceStatus: number, iStatus: number }>}
 */
ur.verifyPodReachable = async function(trinpodUri) {
  if (!trinpodUri) return { ok: false, status: 0, substanceStatus: 0, iStatus: 0 }
  const podBase = getPodBaseUri(trinpodUri)
  const substanceUrl = podBase ? `${podBase}/node/Substance` : ''
  const doGet = async (url) => {
    if (!url) return 0
    try {
      const r = await (globalThis.solid?.session?.fetch?.(url, { method: 'GET', credentials: 'include' })
        ?? fetch(url))
      return r?.status ?? 0
    } catch { return 0 }
  }
  try {
    // Probe the substrate first (the real provisioning signal), then /i as a secondary hint.
    const substanceStatus = await doGet(substanceUrl)
    const iStatus = await doGet(trinpodUri)
    const ok = (substanceStatus >= 200 && substanceStatus < 300) || (iStatus >= 200 && iStatus < 300)
    return { ok, status: substanceStatus || iStatus, substanceStatus, iStatus }
  } catch (err) {
    return { ok: false, status: 0, substanceStatus: 0, iStatus: 0 }
  }
}

const TRINPOD_ID_RE = /^[a-z][a-z0-9-]+$/

/**
 * Helper — extract a subdomain label from a parent pod URI for the trinpodIDExists pre-check.
 * "https://kai.example.com/i" → "kai"
 */
function getSubdomain(podUri) {
  try {
    const u = new URL(podUri)
    return u.hostname.split('.')[0]
  } catch {
    return ''
  }
}

/**
 * Get the pod root base URI for a given pod URI.
 * "https://kai.example.com/i" → "https://kai.example.com"
 */
function getPodBaseUri(podUri) {
  try {
    const u = new URL(podUri)
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

/**
 * Derive the SERVER ORIGIN (apex) for a pod — the host every pod's subdomain hangs off.
 *
 * FRED-GAP-URI-DERIVE-1 (resolved 2026-06-17, cert-proven): pods do NOT URL-nest
 * (PodCreation.md §1 "every pod is a root pod with its own subdomain"). A new pod must be
 * a SIBLING on the server origin, NOT nested under the parent's subdomain. The legacy §3.3
 * built `trinpodUri` from `store.state.server` (the configured server origin), never from
 * the parent host. A live `choose` run (2026-06-17, user tst-shopper.demo.systemtwin.com)
 * PROVED the nested form is broken: the server's wildcard TLS cert covers only ONE
 * subdomain level (`*.demo.systemtwin.com`), so a two-level nested host
 * (`tst-shopper-choice.tst-shopper.demo.systemtwin.com`) has an INVALID cert and every
 * HTTPS request to it fails (net::ERR_CERT_COMMON_NAME_INVALID → HTTP 0). The sibling form
 * (`tst-shopper-choice.demo.systemtwin.com`) is wildcard-covered and writes fine, exactly
 * like the user's own pod.
 *
 * Resolution order:
 *   1. an explicit configured server origin (caller arg, then VITE_TWINPOD_SERVER env) — §3.3;
 *   2. else strip the parent host's leftmost subdomain label (`tst-shopper.demo.systemtwin.com`
 *      → `demo.systemtwin.com`). This converges with the configured origin on the demo server.
 * A bare apex (already ≤2 labels, e.g. `demo.systemtwin.com`) is returned unchanged.
 *
 * @param {string} parentPod  parent pod URI (its host carries the subdomain to strip)
 * @param {string} [configuredServer]  optional explicit server origin (preferred)
 * @returns {string} apex origin, e.g. "https://demo.systemtwin.com" — '' if unparseable
 */
function getApexOrigin(parentPod, configuredServer) {
  const configured = configuredServer
    || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TWINPOD_SERVER)
  if (configured) {
    try {
      const c = new URL(configured)
      return `${c.protocol}//${c.host}`
    } catch { /* fall through to strip-first-label */ }
  }
  try {
    const u = new URL(parentPod)
    const labels = u.hostname.split('.')
    // Keep at least two labels (apex.tld). Strip the leftmost (the parent's subdomain)
    // only when doing so still leaves a valid apex.tld.
    const apexHost = labels.length > 2 ? labels.slice(1).join('.') : u.hostname
    const port = u.port ? `:${u.port}` : ''
    return `${u.protocol}//${apexHost}${port}`
  } catch {
    return ''
  }
}

/**
 * Create a sub-pod / business-pod / project-pod under an existing parent pod.
 *
 * Ported from twin/src/app/twin/src/app/libs/util-c.js:309-367 (c.createTrinpod).
 * Pre-flight validates trinpodID format + uniqueness + parent existence, builds
 * the Stack A2 turtle payload (foaf:maker + neo:m_label + rdf:type a_pod-solid /
 * a_pod-construction + capability triple for the logged-in user), and PATCHes
 * application/sparql-update INSERT DATA to <parentPodBase>/node/Substance.
 *
 * Standard: Reference_Code_TwinPod-PodCreation.md §3.
 *
 * Open gaps (per Questions-Batch-2026-05-30.md):
 *   - OWN-1 / OWN-2: foaf:maker vs m_owner — this port writes foaf:maker only,
 *     matching the existing util-c.js. If the answer is "write m_owner too" we
 *     update without API-breaking changes.
 *   - CTRL-1: multi-controller creation — this port grants capability only to
 *     store.state.webId. Multiple-controller variant deferred.
 *   - TYPE-1: full trinpodType enumeration — caller passes a NEO function-type URI
 *     directly via the trinpodFunctionUri option (we don't ship a getTrinpodFunction
 *     table here; the calling app provides the URI).
 *
 * @param {Object} args
 * @param {string} args.trinpodID  subdomain label, validated against /^[a-z][a-z0-9-]+$/
 * @param {string} args.trinpodName  display name (becomes neo:m_label)
 * @param {string} args.parentPod  parent pod URI (becomes foaf:maker; target of the PATCH)
 * @param {string} args.trinpodFunctionUri  NEO function-type URI for the new pod's capability
 * @param {string} [args.controllerWebId]  WebID granted the capability; defaults to the logged-in user
 * @param {'operational'|'construction'} [args.vertical='operational']  pod-status type
 * @param {string} [args.serverUrl]  optional explicit server origin (apex). When omitted, the
 *   apex is derived by stripping the parent host's leftmost subdomain label (FRED-GAP-URI-DERIVE-1).
 * @returns {Promise<{ ok: boolean, uri?: string, trinpodID?: string, durationSeconds?: number, error?: string }>}
 */
ur.createTrinpod = async function({ trinpodID, trinpodName, parentPod, trinpodFunctionUri, controllerWebId, vertical = 'operational', serverUrl } = {}) {
  // Validation
  if (!trinpodID || !trinpodName || !parentPod || !trinpodFunctionUri) {
    return { ok: false, error: 'missing required argument (need trinpodID, trinpodName, parentPod, trinpodFunctionUri)' }
  }
  if (!TRINPOD_ID_RE.test(trinpodID)) {
    return { ok: false, error: `trinpodID "${trinpodID}" fails /^[a-z][a-z0-9-]+$/ — must start with lowercase letter, then lowercase letters/digits/hyphens only` }
  }

  const parentBase = getPodBaseUri(parentPod)
  if (!parentBase) {
    return { ok: false, error: `parentPod "${parentPod}" is not a parseable URL` }
  }
  // Derive the SERVER ORIGIN (apex), NOT the parent's full host — pods are SIBLINGS, not
  // nested (FRED-GAP-URI-DERIVE-1, cert-proven; see getApexOrigin). The new pod's URI and the
  // trinpodIDExists checks both target the apex; only the create-PATCH target below stays the
  // parent's <parentBase>/node/Substance (the proven write mechanism — only the URI was wrong).
  const apexOrigin = getApexOrigin(parentPod, serverUrl)
  const url = new URL(apexOrigin)
  const trinpodUri = `${url.protocol}//${trinpodID}.${url.host}/i`

  // Pre-flight 1: trinpodID uniqueness (checked against the apex server origin)
  const idCheck = await ur.checkTrinpodID(trinpodID, apexOrigin)
  if (idCheck.exists) {
    return { ok: false, error: `trinpodID "${trinpodID}" already exists on server` }
  }
  // Pre-flight 2: parent pod exists (its own subdomain label is registered on the apex)
  const parentId = getSubdomain(parentPod)
  if (parentId) {
    const parentCheck = await ur.checkTrinpodID(parentId, apexOrigin)
    if (!parentCheck.exists) {
      return { ok: false, error: `parent pod "${parentPod}" not found on server (parent subdomain "${parentId}")` }
    }
  }

  // Resolve controller WebID
  const callerWebId = controllerWebId
    || globalThis.solid?.session?.info?.webId
  if (!callerWebId) {
    return { ok: false, error: 'no controllerWebId provided and no logged-in session WebID available' }
  }

  // Build the EVENT-WRAPPED capability-invocation payload — NOT a bare INSERT DATA.
  //
  // ROOT CAUSE (2026-06-18): the previous bare `INSERT DATA { 4 plain triples }` RECORDED
  // metadata but never PROVISIONED the pod (a live tst-shopper→tst-smith-family run got an
  // authenticated `PATCH <newPod>/node/Substance → 404`). The ORIGINAL working create
  // (util-c.js c.createTrinpod + the live accelerator) wraps the create in a Neo EVENT —
  // a capability invocation whose t_execute is the group-creation function. The server
  // provisions the pod off that event, not off bare metadata triples. We restore it via the
  // ur.* event builder (event-create.js, ported verbatim from util-c.js / the accelerator).
  //
  // The four logical facts (capability, label, maker, type) are EXACTLY the accelerator's
  // create call (app.10e879f5.js At.createTrinpod), in the same order:
  //   obj = ur.capability(callerWebId, trinpodFunctionUri)        // creator HAS the group fn
  //   obj = ur.addStateForInput(trinpodUri, rdfs:label, name)     // m_label → rdfs:label
  //   obj = ur.addStateForInput(trinpodUri, foaf:maker, parentPod)
  //   obj = ur.addStateForInput(trinpodUri, rdf:type, a_pod-solid|a_pod-construction)
  //   event  = ur.event(obj)
  //   turtle = ur.quadsToTurtle(event.quads)
  //
  // NOTE: the event reifies these as attribute STATES (i_entity / i_attribute / i_function /
  // o_result), so there are NO direct `<pod> foaf:maker <parent>` triples on the wire — the
  // server materializes final pod state on provisioning. The turtle is wrapped in
  // `INSERT DATA { … }` and PATCHed as application/sparql-update — and is NOT run through
  // ur.modifyTurtle (that's rdflib-serializer cleanup for Stack B; the proven create path
  // PATCHes quadsToTurtle output directly, verbatim from the source).
  const verticalType = vertical === 'construction'
    ? ur.NS.NEO('a_pod-construction').value
    : ur.NS.NEO('a_pod-solid').value
  const rdfsLabelPredicate = ur.NS.RDFS('label').value // accelerator maps m_label → rdfs:label
  const foafMakerPredicate = ur.NS.FOAF('maker').value
  const rdfTypePredicate = ur.NS.RDF('type').value

  if (typeof ur._resetEventBlankNodeCounter === 'function') ur._resetEventBlankNodeCounter()
  let evtObj = ur.capability(callerWebId, trinpodFunctionUri)
  evtObj = ur.addStateForInput(trinpodUri, rdfsLabelPredicate, trinpodName, evtObj)
  evtObj = ur.addStateForInput(trinpodUri, foafMakerPredicate, parentPod, evtObj)
  evtObj = ur.addStateForInput(trinpodUri, rdfTypePredicate, verticalType, evtObj)
  const event = ur.event(evtObj)
  if (!event || !event.quads || event.quads.length === 0) {
    return { ok: false, error: 'failed to build pod-creation event payload', uri: trinpodUri }
  }
  const turtle = ur.quadsToTurtle(event.quads)

  const body = `INSERT DATA {${turtle}}`

  // Stack A2 PATCH to <parentPodBase>/node/Substance
  const substanceUrl = `${parentBase}/node/Substance`
  const start = performance.now()
  let resp
  try {
    resp = await globalThis.solid?.session?.fetch(substanceUrl, {
      credentials: 'include',
      method: 'PATCH',
      body,
      headers: { 'Content-Type': 'application/sparql-update' },
    })
  } catch (err) {
    return { ok: false, error: `PATCH failed: ${err?.message || String(err)}` }
  }
  const durationSeconds = (performance.now() - start) / 1000

  if (!resp.ok) {
    let bodyText = ''
    try { bodyText = await resp.text() } catch {}
    return {
      ok: false,
      status: resp.status,
      error: `substrate PATCH returned ${resp.status}`,
      body: bodyText,
      uri: trinpodUri,
    }
  }

  return {
    ok: true,
    uri: trinpodUri,
    trinpodID,
    durationSeconds,
    status: resp.status,
  }
}
