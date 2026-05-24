import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock rdfStore as in util-rdf.test.js so the module can load in Node.
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
import './container.js'

let sessFetch

beforeEach(() => {
  sessFetch = vi.fn()
  globalThis.window = {
    solid: { session: { fetch: sessFetch } }
  }
})

afterEach(() => {
  delete globalThis.window
})

describe('ur.ensureContainer', () => {
  test('is a function attached to ur', () => {
    expect(typeof ur.ensureContainer).toBe('function')
  })

  test('no-ops when url does not end with /', async () => {
    await ur.ensureContainer('https://pod.example.com/apps/TomTwin')
    expect(sessFetch).not.toHaveBeenCalled()
  })

  test('HEAD 200 → no PUT', async () => {
    sessFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await ur.ensureContainer('https://pod.example.com/apps/TomTwin/')
    expect(sessFetch).toHaveBeenCalledTimes(1)
    expect(sessFetch.mock.calls[0][1].method).toBe('HEAD')
  })

  test('HEAD 404 → PUT BasicContainer', async () => {
    sessFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 201 })
    await ur.ensureContainer('https://pod.example.com/apps/TomTwin/', {
      slug: 'TomTwin',
      label: 'The Brain'
    })
    expect(sessFetch).toHaveBeenCalledTimes(2)
    const [, init] = sessFetch.mock.calls[1]
    expect(init.method).toBe('PUT')
    expect(init.headers.Link).toContain('BasicContainer')
    expect(init.headers.Slug).toBe('TomTwin')
    expect(init.body).toContain('rdfs:label "The Brain"')
  })

  test('PUT 409 is treated as success (race)', async () => {
    sessFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 409 })
    // Should not throw.
    await expect(ur.ensureContainer('https://pod.example.com/x/')).resolves.toBeUndefined()
  })

  test('network failure on HEAD is swallowed', async () => {
    sessFetch.mockRejectedValueOnce(new Error('network'))
    await expect(ur.ensureContainer('https://pod.example.com/x/')).resolves.toBeUndefined()
  })

  test('no session → no-op', async () => {
    globalThis.window = {}
    await expect(ur.ensureContainer('https://pod.example.com/x/')).resolves.toBeUndefined()
  })
})
