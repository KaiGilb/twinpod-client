import { describe, test, expect, vi, beforeEach } from 'vitest'

const { ur } = vi.hoisted(() => {
  const ur = {
    hyperFetch: vi.fn(),
    rdfStore: {},
    $rdf: { parse: vi.fn() },
  }
  return { ur }
})

vi.mock('./util-rdf.js', () => ({ ur }))

import './search.js'

const POD = 'https://tst-first.demo.systemtwin.com'
const TURTLE_BODY = '<https://tst-first.demo.systemtwin.com/node/t_note_1> a <https://neo.graphmetrix.net/node/a_note> .'

function makeFetch(body = TURTLE_BODY, status = 200) {
  const headers = new Map([['content-type', 'text/turtle']])
  return vi.fn().mockResolvedValue({
    status,
    text: () => Promise.resolve(body),
    headers: { forEach: (cb) => headers.forEach((v, k) => cb(v, k)) }
  })
}

beforeEach(() => {
  ur.$rdf.parse.mockReset()
  ur.hyperFetch.mockReset()
})

describe('ur.searchAndGetURIs — URI construction', () => {
  test('builds correct search URI with defaults', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', force: true })
    const url = ur.hyperFetch.mock.calls[0][0]
    expect(url).toBe(`${POD}/search/note?language=en&start=0&rows=30`)
  })

  test('encodes the concept name', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'text note', { lang: 'en', force: true })
    expect(ur.hyperFetch.mock.calls[0][0]).toContain('/search/text%20note')
  })

  test('appends start and rows', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', start: 10, rows: 5, force: true })
    expect(ur.hyperFetch.mock.calls[0][0]).toContain('start=10&rows=5')
  })

  test('appends single pod param', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', pods: 'https://other.pod', force: true })
    expect(ur.hyperFetch.mock.calls[0][0]).toContain('&pod=https://other.pod')
  })

  test('appends multiple pod params', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', pods: ['https://a.pod', 'https://b.pod'], force: true })
    const url = ur.hyperFetch.mock.calls[0][0]
    expect(url).toContain('&pod=https://a.pod')
    expect(url).toContain('&pod=https://b.pod')
  })

  test('appends single predicate param (encoded)', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', predicates: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', force: true })
    expect(ur.hyperFetch.mock.calls[0][0]).toContain('&predicate=' + encodeURIComponent('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'))
  })

  test('appends multiple predicate params', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', predicates: ['http://a', 'http://b'], force: true })
    const url = ur.hyperFetch.mock.calls[0][0]
    expect(url).toContain('&predicate=' + encodeURIComponent('http://a'))
    expect(url).toContain('&predicate=' + encodeURIComponent('http://b'))
  })

  test('appends hierarchy param', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', hierarchy: 'true', force: true })
    expect(ur.hyperFetch.mock.calls[0][0]).toContain('&hierarchy=true')
  })

  test('normalises podRoot with trailing slash', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD + '/', 'note', { lang: 'en', force: true })
    const url = ur.hyperFetch.mock.calls[0][0]
    expect(url).toContain(POD + '/search/')
    expect(url).not.toContain('//search/')
  })

  test('defaults lang to en when not provided', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { force: true })
    expect(ur.hyperFetch.mock.calls[0][0]).toContain('language=en')
  })
})

describe('ur.searchAndGetURIs — response', () => {
  test('returns response and headers', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    const result = await ur.searchAndGetURIs(POD, 'note', { lang: 'en', force: true })
    expect(result.response).toBe(TURTLE_BODY)
    expect(result.headers).toEqual([{ key: 'content-type', val: 'text/turtle' }])
  })

  test('parses response into rdfStore via ur.$rdf.parse', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', force: true })
    expect(ur.$rdf.parse).toHaveBeenCalledTimes(1)
    expect(ur.$rdf.parse.mock.calls[0][0]).toBe(TURTLE_BODY)
    expect(ur.$rdf.parse.mock.calls[0][1]).toBe(ur.rdfStore)
    expect(ur.$rdf.parse.mock.calls[0][2]).toContain('/search/note')
    expect(ur.$rdf.parse.mock.calls[0][3]).toBe('text/turtle')
  })

  test('sends Accept: text/turtle and credentials: include', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', force: true })
    const init = ur.hyperFetch.mock.calls[0][1]
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('include')
    expect(init.headers.Accept).toBe('text/turtle')
  })

  test('includes HTTP status in the returned object', async () => {
    ur.hyperFetch.mockImplementation(makeFetch('Internal Server Error', 500))
    const result = await ur.searchAndGetURIs(POD, 'note', { lang: 'en', force: true })
    expect(result.status).toBe(500)
  })
})

describe('ur.searchAndGetURIs — caching', () => {
  test('returns cached result on repeat call with force=false', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'cached2', { lang: 'en', force: true })
    expect(ur.hyperFetch).toHaveBeenCalledTimes(1)
    const result2 = await ur.searchAndGetURIs(POD, 'cached2', { lang: 'en', force: false })
    expect(ur.hyperFetch).toHaveBeenCalledTimes(1)
    expect(result2.uri).toContain('/search/cached2')
  })

  test('bypasses cache when force=true', async () => {
    ur.hyperFetch.mockImplementation(makeFetch())
    await ur.searchAndGetURIs(POD, 'forced2', { lang: 'en', force: true })
    await ur.searchAndGetURIs(POD, 'forced2', { lang: 'en', force: true })
    expect(ur.hyperFetch).toHaveBeenCalledTimes(2)
  })
})

describe('ur.searchAndGetURIs — error handling', () => {
  test('logs 507 to console.error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ur.hyperFetch.mockImplementation(makeFetch('507'))
    await ur.searchAndGetURIs(POD, 'note', { lang: 'en', force: true })
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('507'))
    spy.mockRestore()
  })

  test('catches ur.$rdf.parse errors and logs them', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    ur.$rdf.parse.mockImplementation(() => { throw new Error('parse fail') })
    ur.hyperFetch.mockImplementation(makeFetch())
    const result = await ur.searchAndGetURIs(POD, 'note', { lang: 'en', force: true })
    expect(result.response).toBe(TURTLE_BODY)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
