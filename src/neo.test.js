import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('./util-rdf.js', () => ({ ur: {} }))

import { ur } from './util-rdf.js'
import './neo.js'

const ns = (base) => (name) => ({ value: base + name, termType: 'NamedNode' })
const mockNS = {
  NEO:  ns('https://neo.graphmetrix.net/node/'),
  RDF:  ns('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  RDFS: ns('http://www.w3.org/2000/01/rdf-schema#'),
}

function makeStore() {
  const triples = []
  const sym = (uri) => ({ value: uri, termType: 'NamedNode' })
  const lit = (val, lang) => ({ value: val, termType: 'Literal', language: lang })

  const match = (s, p, o) =>
    triples.filter(t =>
      (!s || t.subject.value === s.value) &&
      (!p || t.predicate.value === p.value) &&
      (!o || t.object.value === o.value)
    )
  const holds = (s, p, o) => match(s, p, o).length > 0
  const any = (s, p, o) => { const m = match(s, p, o); return m.length > 0 ? m[0].object : null }
  const add = (s, p, o) => triples.push({ subject: s, predicate: p, object: o })

  const entity = sym('https://pod.example/node/a_pump_1')
  const state  = sym('https://pod.example/node/s_state_1')
  const attr   = sym('https://pod.example/node/a_attribute_1')

  add(entity, sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), sym('https://neo.graphmetrix.net/node/a_entity'))
  add(state,  sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), sym('https://neo.graphmetrix.net/node/s_state'))
  add(attr,   sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), sym('https://neo.graphmetrix.net/node/a_attribute'))
  add(entity, sym('https://neo.graphmetrix.net/node/i_entity'),   state)
  add(state,  sym('https://neo.graphmetrix.net/node/i_attribute'), attr)
  add(state,  sym('https://neo.graphmetrix.net/node/o_result'),    lit('42'))
  add(state,  sym('https://neo.graphmetrix.net/node/m_last-change'), lit('2026-01-01'))
  add(state,  sym('https://neo.graphmetrix.net/node/m_status'),    sym('https://pod.example/node/s_active'))
  add(entity, sym('http://www.w3.org/2000/01/rdf-schema#label'),   lit('Pump 1', 'en'))
  add(entity, sym('http://www.w3.org/2000/01/rdf-schema#label'),   lit('Pumpe 1', 'de'))

  return { match, holds, any, sym, entity, state, attr }
}

let store
beforeEach(() => {
  store = makeStore()
  ur.rdfStore = store
  ur.NS = mockNS
})

describe('type checks', () => {
  test('ur.isType returns true for matching type', () => {
    expect(ur.isType(store.entity, store.sym('https://neo.graphmetrix.net/node/a_entity'))).toBe(true)
  })

  test('ur.isType returns false for non-matching type', () => {
    expect(ur.isType(store.entity, store.sym('https://neo.graphmetrix.net/node/s_state'))).toBe(false)
  })

  test('ur.isEntity', () => {
    expect(ur.isEntity(store.entity)).toBe(true)
    expect(ur.isEntity(store.state)).toBe(false)
  })

  test('ur.isState', () => {
    expect(ur.isState(store.state)).toBe(true)
    expect(ur.isState(store.entity)).toBe(false)
  })

  test('ur.isAttribute', () => {
    expect(ur.isAttribute(store.attr)).toBe(true)
    expect(ur.isAttribute(store.entity)).toBe(false)
  })

  test('ur.isEvent returns false when no event type in store', () => {
    expect(ur.isEvent(store.entity)).toBe(false)
  })
})

describe('traversal helpers', () => {
  test('ur.getStatesOf returns states linked to entity', () => {
    const states = ur.getStatesOf(store.entity)
    expect(states).toHaveLength(1)
    expect(states[0].value).toBe(store.state.value)
  })

  test('ur.getAttributeOf returns the attribute linked to state', () => {
    expect(ur.getAttributeOf(store.state).value).toBe(store.attr.value)
  })

  test('ur.getLastChange returns the m_last-change value', () => {
    expect(ur.getLastChange(store.state).value).toBe('2026-01-01')
  })

  test('ur.getResult returns the o_result value', () => {
    expect(ur.getResult(store.state).value).toBe('42')
  })
})

describe('ur.getCurrentValue', () => {
  test('returns the result value for a matching entity+attribute pair', () => {
    expect(ur.getCurrentValue(store.entity, store.attr)).toBe('42')
  })

  test('returns undefined when attribute does not match', () => {
    expect(ur.getCurrentValue(store.entity, store.sym('https://pod.example/node/a_unknown'))).toBeUndefined()
  })
})

describe('ur.getLabel', () => {
  test('returns the English label by default', () => {
    expect(ur.getLabel(store.entity)).toBe('Pump 1')
  })

  test('returns the German label when lang=de', () => {
    expect(ur.getLabel(store.entity, { lang: 'de' })).toBe('Pumpe 1')
  })

  test('falls back to first label when requested lang is missing', () => {
    expect(ur.getLabel(store.entity, { lang: 'fr' })).toBeDefined()
  })

  test('returns undefined when no labels exist', () => {
    expect(ur.getLabel(store.sym('https://pod.example/node/orphan'))).toBeUndefined()
  })
})

describe('ur.isActive', () => {
  test('returns true when status ends with /s_active', () => {
    expect(ur.isActive(store.state)).toBe(true)
  })

  test('returns false when no status triple exists', () => {
    expect(ur.isActive(store.sym('https://pod.example/node/orphan_state'))).toBe(false)
  })
})
