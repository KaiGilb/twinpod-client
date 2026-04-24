import { describe, test, expect, vi } from 'vitest'

// Spec: namespaces.js attaches ur.NS namespace factories to ur (ur namespace migration)

vi.mock('rdflib', () => ({
  Namespace: vi.fn((base) => (suffix) => ({ value: base + suffix, termType: 'NamedNode' })),
}))

vi.mock('./util-rdf.js', () => ({ ur: {} }))

import { ur } from './util-rdf.js'
import './namespaces.js'

describe('ur.NS — namespace factories', () => {
  test('ur.NS is defined after namespaces.js loads', () => {
    // Spec: namespaces.js attaches ur.NS to ur
    expect(ur.NS).toBeDefined()
    expect(typeof ur.NS).toBe('object')
  })

  test('ur.NS.NEO produces URIs under https://neo.graphmetrix.net/node/', () => {
    // Spec: ur.NS.NEO — Neo ontology namespace
    expect(ur.NS.NEO('a_note').value).toBe('https://neo.graphmetrix.net/node/a_note')
  })

  test('ur.NS.RDF produces URIs under http://www.w3.org/1999/02/22-rdf-syntax-ns#', () => {
    // Spec: ur.NS.RDF — standard RDF namespace
    expect(ur.NS.RDF('type').value).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
  })

  test('ur.NS.RDFS produces URIs under http://www.w3.org/2000/01/rdf-schema#', () => {
    expect(ur.NS.RDFS('label').value).toBe('http://www.w3.org/2000/01/rdf-schema#label')
  })

  test('ur.NS.SCHEMA produces URIs under http://schema.org/', () => {
    expect(ur.NS.SCHEMA('text').value).toBe('http://schema.org/text')
  })

  test('ur.NS.FOAF produces URIs under http://xmlns.com/foaf/0.1/', () => {
    expect(ur.NS.FOAF('maker').value).toBe('http://xmlns.com/foaf/0.1/maker')
  })

  test('ur.NS.LDP produces URIs under http://www.w3.org/ns/ldp#', () => {
    expect(ur.NS.LDP('contains').value).toBe('http://www.w3.org/ns/ldp#contains')
  })
})
