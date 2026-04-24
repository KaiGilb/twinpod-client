// UNIT_TYPE=Hook

// Spec: hyperFetch pagination fix — rdfStore.js hyperFetch only adds start/rows
// query params when they are already present in the resource URL or explicitly
// passed as init.start / init.rows. Prevents 404s on resource GETs/PUTs.
// Rule_Code_twinpod-client-package.md — ur.hyperFetch must not pollute resource
// URLs with pagination params unless the caller or the URL already carries them.

import { describe, test, expect, vi, beforeEach } from 'vitest'

// ----- Set up window BEFORE rdfStore.js is imported -----
// rdfStore.js executes `window.solid = {}` at the top level. vi.hoisted runs
// before module evaluation, so we establish a minimal window mock here.
const { mockSessionFetch } = vi.hoisted(() => {
  const mockSessionFetch = vi.fn()

  // Minimal window with just what rdfStore.js needs at module level.
  const mockSession = {
    info: { isLoggedIn: false },
    fetch: mockSessionFetch,
    handleIncomingRedirect: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }

  globalThis.window = {
    location: { origin: 'http://localhost:5199' },
    solid: null,
    solidFetcher: null,
  }

  return { mockSessionFetch }
})

// ---- Mock the inrupt auth library so new Session() returns our mock ----
vi.mock('@inrupt/solid-client-authn-browser', () => {
  const mockSessionFetch = vi.fn()
  mockSessionFetch.mockResolvedValue({ ok: true, status: 200, headers: new Map() })
  return {
    Session: vi.fn(function () {
      this.info = { isLoggedIn: false }
      this.fetch = mockSessionFetch
    }),
    InMemoryStorage: class InMemoryStorage {},
  }
})

// ---- Mock rdflib — only needs graph/Fetcher/UpdateManager stubs ----
vi.mock('rdflib', () => ({
  graph: vi.fn(() => ({})),
  Fetcher: vi.fn(function () { this.load = vi.fn() }),
  UpdateManager: vi.fn(function () {}),
}))

// ---- Mock vue's ref ----
vi.mock('vue', () => ({
  ref: vi.fn((v) => ({ value: v })),
}))

// Import hyperFetch after mocks are in place.
import { hyperFetch } from './rdfStore.js'

// ---------------------------------------------------------------------------
// beforeEach: reset session.fetch mock and re-wire window.solid.session.fetch
// so hyperFetch's final call goes to our spy.
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockSessionFetch.mockReset()
  mockSessionFetch.mockResolvedValue({ ok: true, status: 200, headers: new Map() })
  // Ensure window.solid.session.fetch = mockSessionFetch so hyperFetch delegates to it.
  if (globalThis.window && globalThis.window.solid) {
    globalThis.window.solid.session = { fetch: mockSessionFetch, info: { isLoggedIn: false } }
  }
})

// ---------------------------------------------------------------------------
// Helper: return the URL that session.fetch was actually called with.
// ---------------------------------------------------------------------------
function capturedUrl() {
  if (mockSessionFetch.mock.calls.length === 0) throw new Error('session.fetch was not called')
  return mockSessionFetch.mock.calls[mockSessionFetch.mock.calls.length - 1][0]
}

// ---------------------------------------------------------------------------
// Tests — pagination behaviour
// ---------------------------------------------------------------------------
describe('hyperFetch — pagination (start/rows) behaviour', () => {

  // Spec: hyperFetch pagination fix — plain resource GET with no params in URL or init
  // must NOT have start/rows appended (prevents 404 on plain resource reads).
  test('does NOT add start/rows to a plain resource GET with no params in URL or init', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    await hyperFetch(url, { method: 'GET' })
    expect(capturedUrl()).toBe(url)
  })

  // Spec: hyperFetch pagination fix — resource PUT with no params in URL or init
  // must NOT have start/rows appended (uploadTurtleToResource uses PUT).
  test('does NOT add start/rows to a PUT request with no params in URL or init', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    await hyperFetch(url, {
      method: 'PUT',
      credentials: 'include',
      body: '@prefix neo: <https://neo.graphmetrix.net/node/> . <#note> a neo:a_paragraph .',
      headers: { 'Content-Type': 'text/turtle' },
    })
    expect(capturedUrl()).toBe(url)
  })

  // Spec: hyperFetch pagination fix — start/rows SHOULD be preserved and normalised
  // when they are already present in the URL (search endpoint always bakes them in).
  test('preserves start/rows when they are already in the URL', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/search/note?language=en&start=0&rows=30'
    await hyperFetch(url, { method: 'GET' })
    const sent = new URL(capturedUrl())
    expect(sent.searchParams.get('start')).toBe('0')
    expect(sent.searchParams.get('rows')).toBe('30')
  })

  // Spec: hyperFetch pagination fix — start/rows SHOULD be set when explicitly
  // passed in init (e.g. legacy callers or programmatic pagination).
  test('adds start/rows when init.start and init.rows are explicitly provided', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    await hyperFetch(url, { method: 'GET', start: 10, rows: 5 })
    const sent = new URL(capturedUrl())
    expect(sent.searchParams.get('start')).toBe('10')
    expect(sent.searchParams.get('rows')).toBe('5')
  })

  // Spec: hyperFetch pagination fix — init.start = 0 is not null/undefined so
  // params ARE added (even though 0 is falsy, != null is true).
  test('adds start/rows when init.start is 0 (falsy but not null/undefined)', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/node/Entity'
    await hyperFetch(url, { method: 'GET', start: 0, rows: 20 })
    const sent = new URL(capturedUrl())
    expect(sent.searchParams.get('start')).toBe('0')
    expect(sent.searchParams.get('rows')).toBe('20')
  })

  // Spec: hyperFetch — PATCH is always excluded from pagination (used for write operations).
  test('does NOT add start/rows to a PATCH request', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    await hyperFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/turtle' },
      body: 'INSERT DATA { }',
    })
    expect(capturedUrl()).toBe(url)
  })

  // Spec: hyperFetch — ACL requests excluded from pagination regardless of params.
  test('does NOT add start/rows to ACL requests (acl= in URL)', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd.acl?acl='
    await hyperFetch(url, { method: 'GET' })
    const sent = new URL(capturedUrl())
    expect(sent.searchParams.has('start')).toBe(false)
    expect(sent.searchParams.has('rows')).toBe(false)
  })

  // Spec: hyperFetch pagination fix — documents known rdflib behaviour: rdfFetcher.load
  // passes its full options object (including start/rows set by aLoadURI) as the fetch
  // init argument. Because init.start = 0 != null, params ARE still added to the GET URL
  // when routed through rdflib. This is the residual case after the fix; the fix only
  // resolves direct calls (uploadTurtleToResource PUT, standalone GETs with no opts).
  test('adds start/rows when rdflib passes opts with start/rows as the init object', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    // Simulate the options object rdflib passes to hyperFetch via rdfFetcher.load
    await hyperFetch(url, { start: 0, rows: 20, fetch: vi.fn(), timeout: 30000, headers: {} })
    const sent = new URL(capturedUrl())
    expect(sent.searchParams.get('start')).toBe('0')
    expect(sent.searchParams.get('rows')).toBe('20')
  })

})

// ---------------------------------------------------------------------------
// Tests — headers
// ---------------------------------------------------------------------------
describe('hyperFetch — headers', () => {

  // Spec: hyperFetch sets default Accept header when not provided.
  test('sets default Accept: text/turtle header when not provided', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    await hyperFetch(url, {})
    const init = mockSessionFetch.mock.calls[0][1]
    expect(init.headers.accept).toContain('text/turtle')
  })

  // Spec: hyperFetch does not override a caller-provided Accept header.
  test('does not override a caller-provided accept header', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    await hyperFetch(url, { headers: { accept: 'text/turtle' } })
    const init = mockSessionFetch.mock.calls[0][1]
    expect(init.headers.accept).toBe('text/turtle')
  })

  // Spec: hyperFetch always sets Cache-Control: max-age=0 by default.
  test('sets Cache-Control: max-age=0 when not already set', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    await hyperFetch(url, {})
    const init = mockSessionFetch.mock.calls[0][1]
    expect(init.headers['Cache-Control']).toBe('max-age=0')
  })

})

// ---------------------------------------------------------------------------
// Tests — delegation
// ---------------------------------------------------------------------------
describe('hyperFetch — delegation', () => {

  // Spec: hyperFetch delegates to window.solid.session.fetch.
  test('delegates to window.solid.session.fetch', async () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1234_abcd'
    await hyperFetch(url, { method: 'GET' })
    expect(mockSessionFetch).toHaveBeenCalledTimes(1)
  })

})
