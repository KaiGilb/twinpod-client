import { describe, test, expect, vi, beforeEach } from 'vitest'

const { ur } = vi.hoisted(() => {
  const ur = {
    hyperFetch: vi.fn(),
  }
  return { ur }
})

vi.mock('./util-rdf.js', () => ({ ur }))

import './sparql.js'

const ENDPOINT = 'https://tst-first.demo.systemtwin.com/sparql'
const QUERY = 'SELECT ?concept WHERE { ?concept <p_english_name> "Goal" }'

const SPARQL_RESULT_ONE = JSON.stringify({
  head: { vars: ['concept'] },
  results: {
    bindings: [
      { concept: { type: 'uri', value: 'https://example.org/concept/Goal' } }
    ]
  }
})

const SPARQL_RESULT_MULTI = JSON.stringify({
  head: { vars: ['concept'] },
  results: {
    bindings: [
      { concept: { type: 'uri', value: 'https://example.org/concept/Goal' } },
      { concept: { type: 'uri', value: 'https://example.org/concept/Target' } },
    ]
  }
})

const SPARQL_RESULT_EMPTY = JSON.stringify({
  head: { vars: ['concept'] },
  results: { bindings: [] }
})

function makeJsonFetch(body, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(body)),
  })
}

beforeEach(() => {
  ur.hyperFetch.mockReset()
})

// ---------------------------------------------------------------------------
// Request shape
// ---------------------------------------------------------------------------

describe('ur.sparqlSelect — request shape', () => {
  test('POSTs to the endpointUrl', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch(SPARQL_RESULT_ONE))
    await ur.sparqlSelect(ENDPOINT, QUERY)
    const [url, init] = ur.hyperFetch.mock.calls[0]
    expect(url).toBe(ENDPOINT)
    expect(init.method).toBe('POST')
  })

  test('sends Content-Type: application/sparql-query', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch(SPARQL_RESULT_ONE))
    await ur.sparqlSelect(ENDPOINT, QUERY)
    const init = ur.hyperFetch.mock.calls[0][1]
    expect(init.headers['Content-Type']).toBe('application/sparql-query')
  })

  test('sends Accept: application/sparql-results+json', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch(SPARQL_RESULT_ONE))
    await ur.sparqlSelect(ENDPOINT, QUERY)
    const init = ur.hyperFetch.mock.calls[0][1]
    expect(init.headers['Accept']).toBe('application/sparql-results+json')
  })

  test('sends the query string as the body', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch(SPARQL_RESULT_ONE))
    await ur.sparqlSelect(ENDPOINT, QUERY)
    const init = ur.hyperFetch.mock.calls[0][1]
    expect(init.body).toBe(QUERY)
  })

  test('includes credentials: include', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch(SPARQL_RESULT_ONE))
    await ur.sparqlSelect(ENDPOINT, QUERY)
    const init = ur.hyperFetch.mock.calls[0][1]
    expect(init.credentials).toBe('include')
  })
})

// ---------------------------------------------------------------------------
// Return value
// ---------------------------------------------------------------------------

describe('ur.sparqlSelect — return value', () => {
  test('returns array of URI strings from the first variable', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch(SPARQL_RESULT_ONE))
    const result = await ur.sparqlSelect(ENDPOINT, QUERY)
    expect(result).toEqual(['https://example.org/concept/Goal'])
  })

  test('returns multiple URIs when multiple bindings present', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch(SPARQL_RESULT_MULTI))
    const result = await ur.sparqlSelect(ENDPOINT, QUERY)
    expect(result).toEqual([
      'https://example.org/concept/Goal',
      'https://example.org/concept/Target',
    ])
  })

  test('returns empty array when bindings are empty', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch(SPARQL_RESULT_EMPTY))
    const result = await ur.sparqlSelect(ENDPOINT, QUERY)
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Guard clauses — missing arguments
// ---------------------------------------------------------------------------

describe('ur.sparqlSelect — guard clauses', () => {
  test('returns [] and warns when endpointUrl is missing', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await ur.sparqlSelect(undefined, QUERY)
    expect(result).toEqual([])
    expect(ur.hyperFetch).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test('returns [] and warns when queryString is missing', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await ur.sparqlSelect(ENDPOINT, undefined)
    expect(result).toEqual([])
    expect(ur.hyperFetch).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('ur.sparqlSelect — error handling', () => {
  test('throws when endpoint returns HTTP 500', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch('Internal Server Error', 500))
    await expect(ur.sparqlSelect(ENDPOINT, QUERY)).rejects.toThrow(/HTTP 500/)
  })

  test('throws when endpoint returns HTTP 401', async () => {
    ur.hyperFetch.mockImplementation(makeJsonFetch('Unauthorized', 401))
    await expect(ur.sparqlSelect(ENDPOINT, QUERY)).rejects.toThrow(/HTTP 401/)
  })

  test('rethrows network errors', async () => {
    ur.hyperFetch.mockImplementation(() => Promise.reject(new Error('fetch failed')))
    await expect(ur.sparqlSelect(ENDPOINT, QUERY)).rejects.toThrow('fetch failed')
  })

  test('returns [] when JSON is malformed (no head.vars)', async () => {
    ur.hyperFetch.mockImplementation(vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: { bindings: [] } }), // missing head.vars
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await ur.sparqlSelect(ENDPOINT, QUERY)
    expect(result).toEqual([])
    spy.mockRestore()
  })
})
