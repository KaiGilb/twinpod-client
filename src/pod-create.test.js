import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// pod-create.js attaches ur.createTrinpod / ur.checkTrinpodID / ur.verifyPodReachable onto
// the `ur` namespace exported by util-rdf.js. We mock util-rdf so we control NS + rdfStore,
// then import the REAL event-create.js (the ported N3 event builder) + pod-create.js for their
// side-effect (method attachment). The HTTP layer is driven through globalThis.solid.session.fetch
// so checkTrinpodID + the create PATCH are exercised against a controllable transport.
//
// IMPORTANT (2026-06-18 root-cause fix): the create payload is now an EVENT-wrapped capability
// invocation, NOT a bare `INSERT DATA { 4 plain triples }`. The bare form recorded metadata but
// never PROVISIONED the pod. So the mocked ur.NS must supply every namespace the event builder
// touches (NEO/FOAF/RDF/RDFS/SIO/OBO/TL/XSD), and we import event-create.js to attach
// ur.capability / ur.addStateForInput / ur.event / ur.quadsToTurtle.
const { ur } = vi.hoisted(() => {
  const ns = (base) => (term) => ({ value: base + term })
  const ur = {
    NS: {
      NEO: ns('https://neo.graphmetrix.net/node/'),
      FOAF: ns('http://xmlns.com/foaf/0.1/'),
      RDF: ns('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
      RDFS: ns('http://www.w3.org/2000/01/rdf-schema#'),
      SIO: ns('http://semanticscience.org/resource/'),
      OBO: ns('http://purl.obolibrary.org/obo/'),
      TL: ns('http://purl.org/NET/c4dm/timeline.owl#'),
      XSD: ns('http://www.w3.org/2001/XMLSchema#'),
    },
  }
  return { ur }
})

vi.mock('./util-rdf.js', () => ({ ur }))

import './event-create.js' // attaches ur.capability/addStateForInput/event/quadsToTurtle (the payload builder)
import './pod-create.js'

// A nested-subdomain parent — the live-run shape that triggered FRED-GAP-URI-DERIVE-1.
const PARENT_POD = 'https://tst-shopper.demo.systemtwin.com/i'
const APEX = 'https://demo.systemtwin.com'
// The REAL group-creation function URI (FRED-GAP-TYPE-1 resolved 2026-06-18 — the accelerator's
// trinpodType "group" function). The event's t_execute → a capability whose o_result is THIS fn;
// the server only provisions when it's the real group function, so it's load-bearing.
const FUNCTION_URI = 'https://trinity.graphmetrix.net/node/t_2na'
const CALLER_WEBID = 'https://tst-shopper.demo.systemtwin.com/i'

// Programmable fetch: matches trinpodIDExists (uniqueness pre-checks) and the create PATCH.
// `taken` is the set of subdomain labels reported as already-registered.
function makeFetch({ taken = new Set(), patchStatus = 201 } = {}) {
  return vi.fn(async (url, opts = {}) => {
    if (String(url).includes('/trinpodIDExists')) {
      const id = new URL(url).searchParams.get('trinpodID')
      const exists = taken.has(id)
      return { ok: true, status: 200, text: async () => (exists ? 'Exists' : 'Available') }
    }
    if (opts.method === 'PATCH') {
      return { ok: patchStatus < 300, status: patchStatus, text: async () => '' }
    }
    return { ok: false, status: 404, text: async () => 'not found' }
  })
}

let fetchSpy

function installFetch(cfg) {
  fetchSpy = makeFetch(cfg)
  globalThis.solid = { session: { fetch: fetchSpy, info: { webId: CALLER_WEBID } } }
}

beforeEach(() => {
  // Parent subdomain is registered so the parent-exists pre-check passes by default.
  installFetch({ taken: new Set(['tst-shopper']) })
})

afterEach(() => {
  delete globalThis.solid
})

/** Pull the PATCH body of the last create call. */
function lastPatchBody() {
  const patchCall = fetchSpy.mock.calls.find((c) => c[1]?.method === 'PATCH')
  return patchCall ? patchCall[1].body : ''
}

describe('ur.createTrinpod — sibling URI derivation (FRED-GAP-URI-DERIVE-1)', () => {
  test('a nested-subdomain parent yields a SIBLING trinpodUri on the server origin, NOT a nested host', async () => {
    const res = await ur.createTrinpod({
      trinpodID: 'tst-shopper-choice',
      trinpodName: 'Choice Group',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
    })
    expect(res.ok).toBe(true)
    // SIBLING on the apex — the wildcard-covered host that actually has a valid TLS cert.
    expect(res.uri).toBe('https://tst-shopper-choice.demo.systemtwin.com/i')
    // It must NOT nest under the parent's subdomain (the broken, cert-invalid form).
    expect(res.uri).not.toContain('tst-shopper-choice.tst-shopper.')
  })

  test('the trinpodIDExists pre-checks target the apex server origin (not the parent host)', async () => {
    await ur.createTrinpod({
      trinpodID: 'tst-shopper-choice',
      trinpodName: 'Choice Group',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
    })
    const checkUrls = fetchSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/trinpodIDExists'))
    expect(checkUrls.length).toBeGreaterThanOrEqual(1)
    // Every uniqueness check hits the apex origin, never the nested parent host.
    for (const u of checkUrls) {
      expect(new URL(u).origin).toBe(APEX)
    }
  })

  test('the create PATCH still targets the PARENT pod /node/Substance (proven write mechanism)', async () => {
    await ur.createTrinpod({
      trinpodID: 'tst-shopper-choice',
      trinpodName: 'Choice Group',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
    })
    const patchCall = fetchSpy.mock.calls.find((c) => c[1]?.method === 'PATCH')
    expect(patchCall).toBeTruthy()
    expect(patchCall[0]).toBe('https://tst-shopper.demo.systemtwin.com/node/Substance')
    expect(patchCall[1].headers['Content-Type']).toBe('application/sparql-update')
  })

  test('an explicit serverUrl arg overrides the strip-first-label derivation', async () => {
    const res = await ur.createTrinpod({
      trinpodID: 'tst-shopper-choice',
      trinpodName: 'Choice Group',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
      serverUrl: 'https://demo.systemtwin.com',
    })
    expect(res.ok).toBe(true)
    expect(res.uri).toBe('https://tst-shopper-choice.demo.systemtwin.com/i')
  })

  test('a single-label (already-apex) parent host is left unchanged (no over-stripping)', async () => {
    installFetch({ taken: new Set(['acme']) })
    const res = await ur.createTrinpod({
      trinpodID: 'acme-choice',
      trinpodName: 'Choice Group',
      parentPod: 'https://acme.example.com/i',
      trinpodFunctionUri: FUNCTION_URI,
    })
    expect(res.ok).toBe(true)
    // example.com is a 2-label apex; sibling sits directly on it.
    expect(res.uri).toBe('https://acme-choice.example.com/i')
  })

  test('refuses when the derived sibling trinpodID is already taken on the server', async () => {
    installFetch({ taken: new Set(['tst-shopper', 'tst-shopper-choice']) })
    const res = await ur.createTrinpod({
      trinpodID: 'tst-shopper-choice',
      trinpodName: 'Choice Group',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/already exists/)
  })
})

describe('ur.createTrinpod — EVENT-wrapped capability invocation (root-cause fix 2026-06-18)', () => {
  // These assertions DISCRIMINATE the event payload from the old bare INSERT DATA. The bare
  // form passed `body.toContain(siblingUri)` + `toContain(parentPod)` too — it shipped and
  // failed to provision. The event shape is the only payload the server provisions off.

  test('the PATCH body is an INSERT DATA wrapping the EVENT turtle (not a bare triple set)', async () => {
    await ur.createTrinpod({
      trinpodID: 'tst-smith-family',
      trinpodName: 'Smith Family',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
    })
    const body = lastPatchBody()
    expect(body).toMatch(/INSERT DATA \{/)
    // Event marker: t_execute = obo:OBI_0000308 links the event to the capability.
    expect(body).toContain('OBI_0000308')
  })

  test('the capability invokes the REAL group function URI (t_2na) as its o_result', async () => {
    await ur.createTrinpod({
      trinpodID: 'tst-smith-family',
      trinpodName: 'Smith Family',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
    })
    const body = lastPatchBody()
    // The capability attribute's o_result is the group-creation function — the server keys
    // provisioning off this. A byte-perfect event with the wrong function would NOT provision.
    expect(body).toContain('https://trinity.graphmetrix.net/node/t_2na')
    // b_capable (sio:SIO_000586) marks the capability attribute.
    expect(body).toContain('SIO_000586')
  })

  test('label / maker / type are REIFIED as attribute states, not direct triples', async () => {
    await ur.createTrinpod({
      trinpodID: 'tst-smith-family',
      trinpodName: 'Smith Family',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
    })
    const body = lastPatchBody()
    // Reification predicates present (i_entity / i_attribute / i_function / o_result).
    expect(body).toContain('i_entity')
    expect(body).toContain('i_attribute')
    expect(body).toContain('i_function')
    expect(body).toContain('o_result')
    // i_input (sio:SIO_000230) links each input state to the event.
    expect(body).toContain('SIO_000230')
    // The label maps to rdfs:label (accelerator-authoritative; NOT neo:m_label), value present.
    expect(body).toContain('rdfs:label')
    expect(body).toContain('Smith Family')
    // The new pod URI and parent URI both appear (as entities of reified states).
    expect(body).toContain('https://tst-smith-family.demo.systemtwin.com/i')
    expect(body).toContain('https://tst-shopper.demo.systemtwin.com/i')
  })

  test('is NOT the old bare direct-triple form (regression guard)', async () => {
    await ur.createTrinpod({
      trinpodID: 'tst-smith-family',
      trinpodName: 'Smith Family',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
    })
    const body = lastPatchBody()
    // The bare form emitted `<pod> <foaf/maker> <parent>` and `<pod> <rdf-type> <a_pod-solid>`
    // as DIRECT triples with the new pod as subject. The event form has NO such direct triple —
    // facts are reified through blank-node attribute states. Assert the direct forms are absent.
    expect(body).not.toMatch(/<https:\/\/tst-smith-family[^>]*>\s+foaf:maker/)
    expect(body).not.toMatch(/<https:\/\/tst-smith-family[^>]*>\s+rdf:type\s+neo:a_pod-solid/)
    // And the old literal `neo:m_label` predicate must be gone (replaced by rdfs:label).
    expect(body).not.toContain('m_label')
  })

  test('construction vertical reifies a_pod-construction instead of a_pod-solid', async () => {
    await ur.createTrinpod({
      trinpodID: 'tst-smith-family',
      trinpodName: 'Smith Family',
      parentPod: PARENT_POD,
      trinpodFunctionUri: FUNCTION_URI,
      vertical: 'construction',
    })
    const body = lastPatchBody()
    expect(body).toContain('a_pod-construction')
    expect(body).not.toContain('a_pod-solid')
  })
})

describe('ur.verifyPodReachable — substrate-first readiness probe', () => {
  test('reports ok when Substance responds 2xx even if /i lags (404)', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/node/Substance')) return { ok: true, status: 200 }
      return { ok: false, status: 404 } // /i lags during async provisioning
    })
    globalThis.solid = { session: { fetch: fetchMock, info: { webId: CALLER_WEBID } } }
    const res = await ur.verifyPodReachable('https://tst-smith-family.demo.systemtwin.com/i')
    expect(res.ok).toBe(true)
    expect(res.substanceStatus).toBe(200)
    expect(res.iStatus).toBe(404)
  })

  test('reports not-ok when both Substance and /i 404', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }))
    globalThis.solid = { session: { fetch: fetchMock, info: { webId: CALLER_WEBID } } }
    const res = await ur.verifyPodReachable('https://tst-smith-family.demo.systemtwin.com/i')
    expect(res.ok).toBe(false)
    expect(res.substanceStatus).toBe(404)
    expect(res.iStatus).toBe(404)
  })
})
