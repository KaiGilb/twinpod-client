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
