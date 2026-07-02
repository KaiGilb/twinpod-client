import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Spec: ur namespace migration — util-rdf.js declares ur, attaches store singletons,
// and implements ur.fetchAndSaveTurtle, ur.aLoadURI, ur.getAclUri,
// ur.checkIfAppAuthorizationRequired (Rule_Code_twinpod-client-package.md)

// rdfStore.js is browser-only (window.solid, Session) — mock it completely so util-rdf.js
// can be tested in Node without a DOM environment.

const { mockLoad } = vi.hoisted(() => {
  const mockLoad = vi.fn()
  return { mockLoad }
})

vi.mock('./rdfStore.js', () => {
  const mockStore = {
    statementsMatching: vi.fn(() => []),
    match: vi.fn(() => []),
    removeStatement: vi.fn(),
    removeStatements: vi.fn(),
    sym: vi.fn((uri) => ({ value: uri, termType: 'NamedNode' })),
  }
  const mockFetcher = { load: mockLoad }
  const mockUpdater = {}
  const mockHyperFetch = vi.fn()
  return {
    rdfStore: mockStore,
    tempRdfStore: mockStore,
    $rdf: {
      graph: vi.fn(() => mockStore),
      sym: vi.fn((uri) => ({ value: uri, termType: 'NamedNode' })),
      parse: vi.fn(),
      serialize: vi.fn(),
      literal: vi.fn((val, lang) => ({ value: val, termType: 'Literal', language: lang })),
      st: vi.fn((s, p, o, g) => ({ subject: s, predicate: p, object: o, why: g })),
    },
    rdfFetcher: mockFetcher,
    rdfUpdater: mockUpdater,
    urisFetched: { value: [] },
    hyperFetch: mockHyperFetch,
    clearTempRdfStore: vi.fn(),
  }
})

import { ur } from './util-rdf.js'
import './auth.js'

// Stub ur.NS instead of importing namespaces.js (which loads rdflib at module
// init and fails in Node test env — see the existing rdfStore.js mock pattern).
// The state-lifecycle primitives only need NEO(name) and RDF(name) factories
// that return objects with a `.value` URI string for predicate identity.
ur.NS = {
  NEO: (n) => ({ value: 'https://neo.graphmetrix.net/node/' + n, termType: 'NamedNode' }),
  RDF: (n) => ({ value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' + n, termType: 'NamedNode' }),
  FOAF: (n) => ({ value: 'http://xmlns.com/foaf/0.1/' + n, termType: 'NamedNode' }),
  VCARD: (n) => ({ value: 'http://www.w3.org/2006/vcard/ns#' + n, termType: 'NamedNode' }),
}

beforeEach(() => {
  mockLoad.mockReset()
  // Clear the array in place — do NOT replace the reference because fetchAndSaveTurtle
  // closes over the original urisFetched binding from rdfStore.js, not ur.urisFetched.
  ur.urisFetched.value.length = 0
})

describe('ur — core object', () => {
  test('ur is exported and is an object', () => {
    // Spec: index.js exports only { ur } (ur namespace migration)
    expect(ur).toBeDefined()
    expect(typeof ur).toBe('object')
  })

  test('ur.rdfStore is defined', () => {
    expect(ur.rdfStore).toBeDefined()
  })

  test('ur.rdfFetcher is defined', () => {
    expect(ur.rdfFetcher).toBeDefined()
  })

  test('ur.$rdf is defined', () => {
    expect(ur.$rdf).toBeDefined()
  })

  test('ur.hyperFetch is a function', () => {
    expect(typeof ur.hyperFetch).toBe('function')
  })

  test('ur.clearTempRdfStore is a function', () => {
    expect(typeof ur.clearTempRdfStore).toBe('function')
  })
})

describe('ur.fetchAndSaveTurtle', () => {
  test('calls aLoadURI and resolves { success: true, response, acluri: "" }', async () => {
    // Spec: ur.fetchAndSaveTurtle — canonical reader; returns { success, response, acluri }
    const fakeResponse = { headers: { forEach: vi.fn() } }
    mockLoad.mockResolvedValue(fakeResponse)

    const result = await ur.fetchAndSaveTurtle('https://pod.example.com/t/note1')
    expect(result.success).toBe(true)
    expect(result.acluri).toBe('')
  })

  test('adds the URI to urisFetched after a successful load', async () => {
    // Spec: urisFetched cache is written on each successful fetch
    // ur.urisFetched is the same object reference imported by util-rdf.js — clear the array
    // in place rather than replacing the reference, so the closure inside fetchAndSaveTurtle
    // pushes to the same array we are inspecting.
    const fakeResponse = { headers: { forEach: vi.fn() } }
    mockLoad.mockResolvedValue(fakeResponse)

    await ur.fetchAndSaveTurtle('https://pod.example.com/t/note2')
    expect(ur.urisFetched.value).toContain('https://pod.example.com/t/note2')
  })

  test('includes acluri when getacluri option is true', async () => {
    // Spec: options.getacluri — when true, getAclUri is called and result included
    const linkHeader = '<https://pod.example.com/t/note3.acl>; rel="acl"'
    const fakeResponse = {
      headers: {
        forEach: (cb) => cb(linkHeader, 'link'),
      }
    }
    mockLoad.mockResolvedValue(fakeResponse)

    const result = await ur.fetchAndSaveTurtle('https://pod.example.com/t/note3', false, { getacluri: true })
    expect(result.success).toBe(true)
    expect(result.acluri).toContain('note3.acl')
  })

  test('sets default rows=20 when not provided in options', async () => {
    // Spec: fetchAndSaveTurtle passes start=0, rows=20 defaults to aLoadURI
    const fakeResponse = { headers: { forEach: vi.fn() } }
    mockLoad.mockResolvedValue(fakeResponse)

    await ur.fetchAndSaveTurtle('https://pod.example.com/t/note4')
    const opts = mockLoad.mock.calls[0][1]
    expect(opts.rows).toBe(20)
    expect(opts.start).toBe(0)
  })
})

describe('ur.getAclUri', () => {
  test('returns the ACL URI parsed from a Link header', async () => {
    // Spec: ur.getAclUri — parse ACL URI from a response Link header
    const linkHeader = '<https://pod.example.com/t/note5.acl>; rel="acl", <https://pod.example.com/>; rel="describedBy"'
    const fakeUriRequest = {
      response: {
        headers: {
          forEach: (cb) => {
            cb(linkHeader, 'link')
          }
        }
      }
    }
    const aclUri = await ur.getAclUri('https://pod.example.com/t/note5', fakeUriRequest)
    expect(aclUri).toContain('note5.acl')
  })

  test('returns undefined when no ACL link is present', async () => {
    // Spec: ur.getAclUri — resolves undefined when no rel="acl" link exists
    const fakeUriRequest = {
      response: {
        headers: {
          forEach: (cb) => cb('</other>; rel="type"', 'link')
        }
      }
    }
    const aclUri = await ur.getAclUri('https://pod.example.com/t/note6', fakeUriRequest)
    expect(aclUri).toBeUndefined()
  })

  test('returns undefined when response has no headers', async () => {
    // Spec: ur.getAclUri — handles responses without headers gracefully
    const fakeUriRequest = { response: {} }
    const aclUri = await ur.getAclUri('https://pod.example.com/t/note7', fakeUriRequest)
    expect(aclUri).toBeUndefined()
  })
})

describe('ur.fetchResourceTurtle', () => {
  // ur.fetchResourceTurtle fetches a TwinPod resource as Turtle WITHOUT the
  // hypergraph header — so TwinPod returns the actual resource bytes rather than
  // the pod knowledge graph. It resolves to { ok, status, turtle }.

  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    if (!globalThis.window) globalThis.window = {}
    globalThis.window.solid = { session: { fetch: mockFetch } }
  })

  afterEach(() => {
    if (globalThis.window) delete globalThis.window.solid
  })

  test('calls window.solid.session.fetch with Accept: text/turtle and Cache-Control: max-age=0', async () => {
    // Spec: ur.fetchResourceTurtle — must NOT send the hypergraph header
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'turtle data' })
    await ur.fetchResourceTurtle('https://pod.example.com/t/note1')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('https://pod.example.com/t/note1', {
      method: 'GET',
      headers: { Accept: 'text/turtle', 'Cache-Control': 'max-age=0' }
    })
    const init = mockFetch.mock.calls[0][1]
    expect(init.headers.hypergraph).toBeUndefined()
  })

  test('returns { ok: true, status: 200, turtle } on a successful response', async () => {
    // Spec: ur.fetchResourceTurtle — resolves to { ok, status, turtle }
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '<> a <Thing> .' })
    const result = await ur.fetchResourceTurtle('https://pod.example.com/t/note2')
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.turtle).toBe('<> a <Thing> .')
  })

  test('returns { ok: false, status: 404 } on a not-found response', async () => {
    // Spec: ur.fetchResourceTurtle — passes through error status without throwing
    mockFetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' })
    const result = await ur.fetchResourceTurtle('https://pod.example.com/t/note3')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })

  test('propagates rejection when the underlying fetch throws', async () => {
    // Spec: ur.fetchResourceTurtle — network errors bubble up to the caller
    mockFetch.mockRejectedValue(new Error('network error'))
    await expect(ur.fetchResourceTurtle('https://pod.example.com/t/note4')).rejects.toThrow('network error')
  })
})

describe('ur.checkIfAppAuthorizationRequired', () => {
  // DEFECT: util-rdf.js uses `window.solid` but should use `globalThis.solid` (consistent with
  // auth.js). In Node test environment `window` is undefined — the try/catch swallows the
  // ReferenceError so the function silently no-ops instead of triggering solidLogin.
  // Tests below reflect current (broken) behaviour and will FAIL until the defect is fixed.

  test('calls ur.solidLogin when session is not logged in', () => {
    // Spec: ur.checkIfAppAuthorizationRequired — triggers login when not authenticated
    // BUG: uses window.solid — throws ReferenceError in Node, swallowed by catch
    ur.solidLogin = vi.fn()
    globalThis.solid = { session: { info: { isLoggedIn: false } } }
    ur.checkIfAppAuthorizationRequired('https://pod.example.com/t/note8')
    expect(ur.solidLogin).toHaveBeenCalledTimes(1)
  })

  test('does not call ur.solidLogin when session is logged in', () => {
    // Spec: ur.checkIfAppAuthorizationRequired — no-op when already authenticated
    ur.solidLogin = vi.fn()
    globalThis.solid = { session: { info: { isLoggedIn: true } } }
    ur.checkIfAppAuthorizationRequired('https://pod.example.com/t/note9')
    expect(ur.solidLogin).not.toHaveBeenCalled()
  })

  test('does not throw when solid is not initialized', () => {
    // Spec: ur.checkIfAppAuthorizationRequired — graceful no-op in non-browser env
    delete globalThis.solid
    expect(() => ur.checkIfAppAuthorizationRequired('https://pod.example.com/t/note10')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// State-lifecycle primitives — canonical 5-step entity-update lifecycle.
// Spec: STATE_LIFECYCLE_01 / 02. Bodies ported verbatim from
//   Reference_Code_TwinPod-getStateFromTriple.md
//   Reference_Code_TwinPod-deleteURI.md
//   Reference_Code_TwinPod-deleteStateByTriple.md
//   Reference_Code_TwinPod-deleteStateByTripleAndLocal.md
// ---------------------------------------------------------------------------

describe('ur — state-lifecycle primitives presence', () => {
  test('ur.getStateFromTriple is a function', () => {
    expect(typeof ur.getStateFromTriple).toBe('function')
  })
  test('ur.deleteURI is a function', () => {
    expect(typeof ur.deleteURI).toBe('function')
  })
  test('ur.deleteStateByTriple is a function', () => {
    expect(typeof ur.deleteStateByTriple).toBe('function')
  })
  test('ur.deleteStateByTripleAndLocal is a function', () => {
    expect(typeof ur.deleteStateByTripleAndLocal).toBe('function')
  })
})

describe('ur.getStateFromTriple', () => {
  // Helper: build a fixture rdfStore.match implementation that simulates the
  // Neo State graph shape. See Reference_Code_TwinPod-getStateFromTriple.md
  // for the multi-hop walk:
  //   (s, NEO('i_entity'), entityObj)
  //   (*, NEO('i_attribute'), entityObj)        → attribute statement
  //                                                 attribute.subject.value = entityURI
  //                                                 attribute.object.value  = stateURI
  //   (entityURI, NEO('o_result'), valueObj)    → must match `o`
  //   (entityURI, NEO('i_function'), p)         → must include the predicate
  //   (stateURI, RDF('type'), NEO('s_state'))   → must mark URI as state
  function installMockGraph({ subjectUri, predUri, valueLiteral, stateUri, entityUri }) {
    ur.rdfStore.match.mockImplementation((s, p, o) => {
      const pv = p && p.value
      const NEO = (n) => 'https://neo.graphmetrix.net/node/' + n
      const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

      // (s, NEO('i_entity'), null) — return one entityObj
      if (s && s.value === subjectUri && pv === NEO('i_entity')) {
        return [{ subject: s, predicate: p, object: { value: entityUri, termType: 'NamedNode' } }]
      }
      // (null, NEO('i_attribute'), entityObj) — return one attribute statement
      if (s == null && pv === NEO('i_attribute') && o && o.value === entityUri) {
        return [{
          subject: { value: entityUri, termType: 'NamedNode' },
          predicate: p,
          object:  { value: stateUri,  termType: 'NamedNode' }
        }]
      }
      // (entityURI, NEO('o_result'), null) — one matching value
      if (s && s.value === entityUri && pv === NEO('o_result')) {
        return [{ subject: s, predicate: p, object: valueLiteral }]
      }
      // (entityURI, NEO('i_function'), predicate) — predicate match
      if (s && s.value === entityUri && pv === NEO('i_function')) {
        return [{ subject: s, predicate: p, object: { value: predUri, termType: 'NamedNode' } }]
      }
      // (stateURI, RDF type, NEO('s_state')) — confirm state typing
      if (s && s.value === stateUri && pv === RDF) {
        return [{ subject: s, predicate: p, object: { value: NEO('s_state'), termType: 'NamedNode' } }]
      }
      return []
    })
  }

  beforeEach(() => {
    ur.rdfStore.match.mockReset()
  })

  test('returns the state URI when the full Neo graph walk succeeds', () => {
    const subjectUri = 'https://pod.example.com/i#me'
    const predUri    = 'http://xmlns.com/foaf/0.1/familyName'
    const stateUri   = 'https://pod.example.com/state/abc'
    const entityUri  = 'https://pod.example.com/entity/xyz'
    const valueLit   = { value: 'Smith', termType: 'Literal' }

    installMockGraph({ subjectUri, predUri, valueLiteral: valueLit, stateUri, entityUri })

    const s = ur.$rdf.sym(subjectUri)
    const p = ur.$rdf.sym(predUri)
    const result = ur.getStateFromTriple(s, p, valueLit)
    expect(result).toBe(stateUri)
  })

  test('returns undefined when no entity is attached to the subject', () => {
    ur.rdfStore.match.mockReturnValue([])
    const s = ur.$rdf.sym('https://pod.example.com/i#me')
    const p = ur.$rdf.sym('http://xmlns.com/foaf/0.1/familyName')
    expect(ur.getStateFromTriple(s, p, { value: 'Smith' })).toBeUndefined()
  })

  test('matches via .value equality when objects are different instances', () => {
    const subjectUri = 'https://pod.example.com/i#me'
    const predUri    = 'http://xmlns.com/foaf/0.1/familyName'
    const stateUri   = 'https://pod.example.com/state/abc'
    const entityUri  = 'https://pod.example.com/entity/xyz'
    const storedLit  = { value: 'Smith', termType: 'Literal' }

    installMockGraph({ subjectUri, predUri, valueLiteral: storedLit, stateUri, entityUri })

    // Pass a string instead of the same literal instance — should still match
    // via the obj.value === o branch in the canonical body.
    const s = ur.$rdf.sym(subjectUri)
    const p = ur.$rdf.sym(predUri)
    expect(ur.getStateFromTriple(s, p, 'Smith')).toBe(stateUri)
  })
})

describe('ur.deleteURI', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    if (!globalThis.window) globalThis.window = {}
    globalThis.window.solid = { session: { fetch: mockFetch } }
    ur.rdfStore.statementsMatching.mockReturnValue([])
    ur.rdfStore.removeStatement.mockReset()
  })

  afterEach(() => {
    if (globalThis.window) delete globalThis.window.solid
  })

  test('returns true on DELETE 200', async () => {
    mockFetch.mockResolvedValue({ status: 200 })
    const ok = await ur.deleteURI('https://pod.example.com/state/abc')
    expect(ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('https://pod.example.com/state/abc', {
      method: 'DELETE',
      credentials: 'include',
    })
  })

  test('returns false on 404', async () => {
    mockFetch.mockResolvedValue({ status: 404 })
    const ok = await ur.deleteURI('https://pod.example.com/state/missing')
    expect(ok).toBe(false)
  })

  test('returns false on fetch rejection', async () => {
    mockFetch.mockRejectedValue(new Error('network'))
    const ok = await ur.deleteURI('https://pod.example.com/state/explode')
    expect(ok).toBe(false)
  })

  test('prunes both directions of rdfStore before DELETE', async () => {
    const incoming = [{ id: 'in' }]
    const outgoing = [{ id: 'out' }]
    ur.rdfStore.statementsMatching
      .mockReturnValueOnce(incoming)  // (null, null, sym)
      .mockReturnValueOnce(outgoing)  // (sym, null, null)
    mockFetch.mockResolvedValue({ status: 200 })
    await ur.deleteURI('https://pod.example.com/state/abc')
    expect(ur.rdfStore.removeStatement).toHaveBeenCalledWith(incoming[0])
    expect(ur.rdfStore.removeStatement).toHaveBeenCalledWith(outgoing[0])
  })
})

describe('ur.deleteStateByTriple', () => {
  beforeEach(() => {
    ur.rdfStore.match.mockReturnValue([])
  })

  test('returns false when no state URI is found', async () => {
    const result = await ur.deleteStateByTriple(
      ur.$rdf.sym('https://pod.example.com/i#me'),
      ur.$rdf.sym('http://xmlns.com/foaf/0.1/familyName'),
      'Smith'
    )
    expect(result).toBe(false)
  })

  test('returns true when state URI is found and DELETE succeeds', async () => {
    // Stub getStateFromTriple directly to isolate from the multi-hop graph walk
    const origGetState = ur.getStateFromTriple
    ur.getStateFromTriple = vi.fn(() => 'https://pod.example.com/state/abc')
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 })
    if (!globalThis.window) globalThis.window = {}
    globalThis.window.solid = { session: { fetch: mockFetch } }

    try {
      const result = await ur.deleteStateByTriple(
        ur.$rdf.sym('https://pod.example.com/i#me'),
        ur.$rdf.sym('http://xmlns.com/foaf/0.1/familyName'),
        'Smith'
      )
      expect(result).toBe(true)
    } finally {
      ur.getStateFromTriple = origGetState
      delete globalThis.window.solid
    }
  })
})

describe('ur.deleteStateByTripleAndLocal', () => {
  beforeEach(() => {
    ur.rdfStore.match.mockReturnValue([])
    ur.rdfStore.removeStatements.mockReset()
  })

  test('returns false when no state URI is found (first-write case)', async () => {
    const result = await ur.deleteStateByTripleAndLocal(
      ur.$rdf.sym('https://pod.example.com/i#me'),
      ur.$rdf.sym('http://xmlns.com/foaf/0.1/familyName'),
      'Smith'
    )
    expect(result).toBe(false)
  })

  test('returns true and prunes (s, p, *) statements on successful delete', async () => {
    const origGetState = ur.getStateFromTriple
    ur.getStateFromTriple = vi.fn(() => 'https://pod.example.com/state/abc')
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 })
    if (!globalThis.window) globalThis.window = {}
    globalThis.window.solid = { session: { fetch: mockFetch } }

    const staleStmt = { object: { value: 'Smith' } }
    // First (and only) ur.rdfStore.match call within this function is
    // (s, p, null) for the local-prune phase.
    ur.rdfStore.match.mockReturnValue([staleStmt])

    try {
      const result = await ur.deleteStateByTripleAndLocal(
        ur.$rdf.sym('https://pod.example.com/i#me'),
        ur.$rdf.sym('http://xmlns.com/foaf/0.1/familyName'),
        'Smith'
      )
      expect(result).toBe(true)
      expect(ur.rdfStore.removeStatements).toHaveBeenCalledWith(staleStmt)
    } finally {
      ur.getStateFromTriple = origGetState
      delete globalThis.window.solid
    }
  })
})
