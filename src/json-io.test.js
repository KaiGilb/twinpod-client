import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./rdfStore.js', () => {
  const mockStore = { statementsMatching: vi.fn(() => []), sym: vi.fn((u) => ({ value: u })) }
  return {
    rdfStore: mockStore,
    tempRdfStore: mockStore,
    $rdf: { graph: vi.fn(() => mockStore), sym: vi.fn(), parse: vi.fn() },
    rdfFetcher: { load: vi.fn() },
    rdfUpdater: {},
    urisFetched: { value: [] },
    hyperFetch: vi.fn(),
    clearTempRdfStore: vi.fn()
  }
})

import { ur } from './util-rdf.js'
import './json-io.js'

let sessFetch

beforeEach(() => {
  sessFetch = vi.fn()
  globalThis.window = { solid: { session: { fetch: sessFetch } } }
})

afterEach(() => {
  delete globalThis.window
})

describe('ur.uploadJSON', () => {
  test('serialises a value and PUTs with Content-Type: application/json', async () => {
    sessFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    const res = await ur.uploadJSON('https://pod.example.com/x.json', { a: 1 })
    expect(res.ok).toBe(true)
    const [url, init] = sessFetch.mock.calls[0]
    expect(url).toBe('https://pod.example.com/x.json')
    expect(init.method).toBe('PUT')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Accept).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ a: 1 }))
  })

  test('passes a pre-serialised string through unchanged', async () => {
    sessFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await ur.uploadJSON('https://pod.example.com/x.json', '{"raw":true}')
    expect(sessFetch.mock.calls[0][1].body).toBe('{"raw":true}')
  })

  test('returns { ok:false, status:0 } when fetch throws', async () => {
    sessFetch.mockRejectedValueOnce(new Error('boom'))
    const r = await ur.uploadJSON('https://pod.example.com/x.json', {})
    expect(r.ok).toBe(false)
    expect(r.status).toBe(0)
  })

  test('returns { ok:false } when no session', async () => {
    globalThis.window = {}
    const r = await ur.uploadJSON('https://pod.example.com/x.json', {})
    expect(r.ok).toBe(false)
  })

  test('does not send the RDF Accept header from hyperFetch', async () => {
    sessFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await ur.uploadJSON('https://pod.example.com/x.json', {})
    const accept = sessFetch.mock.calls[0][1].headers.Accept
    expect(accept).not.toContain('text/turtle')
    expect(accept).not.toContain('ld+json')
  })
})

describe('ur.readJSON', () => {
  test('parses a JSON body', async () => {
    sessFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"a":1}'
    })
    const r = await ur.readJSON('https://pod.example.com/x.json')
    expect(r.ok).toBe(true)
    expect(r.value).toEqual({ a: 1 })
    expect(r.raw).toBe('{"a":1}')
  })

  test('non-2xx returns ok:false with raw body', async () => {
    sessFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => ''
    })
    const r = await ur.readJSON('https://pod.example.com/x.json')
    expect(r.ok).toBe(false)
    expect(r.status).toBe(404)
    expect(r.value).toBeNull()
  })

  test('non-JSON body returns value:null + raw', async () => {
    sessFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'not json'
    })
    const r = await ur.readJSON('https://pod.example.com/x.json')
    expect(r.ok).toBe(true)
    expect(r.value).toBeNull()
    expect(r.raw).toBe('not json')
  })

  test('network failure returns ok:false status:0', async () => {
    sessFetch.mockRejectedValueOnce(new Error('net'))
    const r = await ur.readJSON('https://pod.example.com/x.json')
    expect(r.ok).toBe(false)
    expect(r.status).toBe(0)
  })

  test('Accept header is application/json (not RDF)', async () => {
    sessFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{}' })
    await ur.readJSON('https://pod.example.com/x.json')
    expect(sessFetch.mock.calls[0][1].headers.Accept).toBe('application/json')
  })
})
