import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('./util-rdf.js', () => ({ ur: {} }))

import { ur } from './util-rdf.js'
import './discovery.js'

const WEB_ID = 'https://example.com/profile/card#me'
const POD_ROOT = 'https://example.com/'
const CONTAINER_URL = 'https://example.com/t/'

function makeStore() {
  const triples = []
  const sym = (uri) => ({ value: uri, termType: 'NamedNode' })

  const match = (s, p, o) =>
    triples.filter(t =>
      (!s || t.subject.value === s.value) &&
      (!p || t.predicate.value === p.value) &&
      (!o || t.object.value === o.value)
    )
  const any = (s, p, o) => { const m = match(s, p, o); return m.length > 0 ? m[0].object : null }
  const add = (s, p, o) => triples.push({ subject: s, predicate: p, object: o })

  return { sym, match, any, add }
}

let store
let mockFetcher

beforeEach(() => {
  store = makeStore()
  mockFetcher = { load: vi.fn() }
  ur.rdfStore = store
  ur.rdfFetcher = mockFetcher
})

describe('ur.findPodRoots', () => {
  test('returns pod roots from pim:storage and foaf:member', async () => {
    mockFetcher.load.mockImplementation(async () => {
      store.add(store.sym(WEB_ID), store.sym('http://www.w3.org/ns/pim/space#storage'), store.sym(POD_ROOT))
      store.add(store.sym(WEB_ID), store.sym('http://xmlns.com/foaf/0.1/member'), store.sym('https://other.example.com/'))
    })
    const roots = await ur.findPodRoots(WEB_ID)
    expect(roots).toContain(POD_ROOT)
    expect(roots).toContain('https://other.example.com/')
    expect(roots).toHaveLength(2)
  })

  test('loads the WebID document via ur.rdfFetcher', async () => {
    await ur.findPodRoots(WEB_ID)
    expect(mockFetcher.load).toHaveBeenCalledWith(WEB_ID)
  })

  test('returns empty array when no membership triples exist', async () => {
    expect(await ur.findPodRoots(WEB_ID)).toEqual([])
  })

  test('deduplicates roots from multiple predicates', async () => {
    mockFetcher.load.mockImplementation(async () => {
      store.add(store.sym(WEB_ID), store.sym('http://www.w3.org/ns/pim/space#storage'), store.sym(POD_ROOT))
      store.add(store.sym(WEB_ID), store.sym('http://www.w3.org/ns/solid/terms#hasMember'), store.sym(POD_ROOT))
    })
    const roots = await ur.findPodRoots(WEB_ID)
    expect(roots).toEqual([POD_ROOT])
  })
})

describe('ur.findProfileDoc', () => {
  test('returns the profile document URI', async () => {
    mockFetcher.load.mockImplementation(async () => {
      store.add(
        store.sym('https://example.com/profile/card'),
        store.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        store.sym('http://xmlns.com/foaf/0.1/PersonalProfileDocument')
      )
    })
    const doc = await ur.findProfileDoc(WEB_ID)
    expect(doc).toBe('https://example.com/profile/card')
  })

  test('falls back to WebID when no profile doc type is found', async () => {
    expect(await ur.findProfileDoc(WEB_ID)).toBe(WEB_ID)
  })
})

describe('ur.getOwnerWebId', () => {
  test('returns the foaf:maker of a resource', async () => {
    mockFetcher.load.mockImplementation(async () => {
      store.add(store.sym('https://example.com/resource/1'), store.sym('http://xmlns.com/foaf/0.1/maker'), store.sym(WEB_ID))
    })
    expect(await ur.getOwnerWebId('https://example.com/resource/1')).toBe(WEB_ID)
  })

  test('returns undefined when no maker triple exists', async () => {
    expect(await ur.getOwnerWebId('https://example.com/resource/unknown')).toBeUndefined()
  })
})

describe('ur.listContainer', () => {
  test('returns contained resource URIs', async () => {
    mockFetcher.load.mockImplementation(async () => {
      store.add(store.sym(CONTAINER_URL), store.sym('http://www.w3.org/ns/ldp#contains'), store.sym(CONTAINER_URL + 'item1'))
      store.add(store.sym(CONTAINER_URL), store.sym('http://www.w3.org/ns/ldp#contains'), store.sym(CONTAINER_URL + 'item2'))
    })
    const items = await ur.listContainer(CONTAINER_URL)
    expect(items).toContain(CONTAINER_URL + 'item1')
    expect(items).toContain(CONTAINER_URL + 'item2')
    expect(items).toHaveLength(2)
  })

  test('returns empty array for empty container', async () => {
    expect(await ur.listContainer(CONTAINER_URL)).toEqual([])
  })
})
