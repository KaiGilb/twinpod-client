import { describe, test, expect, beforeEach, vi } from 'vitest'
import N3 from 'n3'

// event-create.js attaches the Neo EVENT / capability-invocation builder onto the `ur`
// namespace: ur.evtAttribute / evtState / evtStart / evtTime, ur.capability,
// ur.addStateForInput, ur.event, ur.quadsToTurtle. We mock util-rdf so we control ur.NS,
// then import the REAL event-create.js for its side-effect (method attachment).
//
// WHY THESE TESTS EXIST (2026-06-18 QA, VATester): pod-create.test.js exercises this module
// only through createTrinpod's happy path with `toContain` string assertions. Token presence
// cannot distinguish a CORRECTLY-WIRED event from a scrambled one that happens to carry the
// right tokens. These tests PARSE the emitted turtle and assert the graph TOPOLOGY:
//   capability attribute's o_result == the function URI; event's t_execute → that capability;
//   each input entity linked i_entity → state → i_input → event; blank nodes all distinct.
// They also cover the load-bearing PORT CHANGES flagged in the module header:
//   - PORT CHANGE 2: the module blank-node counter MUST keep incrementing across one payload.
//   - PORT CHANGE 3: getURI literal-vs-URI discrimination (what makes "Smith Family" a literal
//     but a WebID a node).
const NS_BASES = {
  NEO: 'https://neo.graphmetrix.net/node/',
  FOAF: 'http://xmlns.com/foaf/0.1/',
  RDF: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  RDFS: 'http://www.w3.org/2000/01/rdf-schema#',
  SIO: 'http://semanticscience.org/resource/',
  OBO: 'http://purl.obolibrary.org/obo/',
  TL: 'http://purl.org/NET/c4dm/timeline.owl#',
  XSD: 'http://www.w3.org/2001/XMLSchema#',
}

const { ur } = vi.hoisted(() => {
  const ns = (base) => (term) => ({ value: base + term })
  const bases = {
    NEO: 'https://neo.graphmetrix.net/node/',
    FOAF: 'http://xmlns.com/foaf/0.1/',
    RDF: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    RDFS: 'http://www.w3.org/2000/01/rdf-schema#',
    SIO: 'http://semanticscience.org/resource/',
    OBO: 'http://purl.obolibrary.org/obo/',
    TL: 'http://purl.org/NET/c4dm/timeline.owl#',
    XSD: 'http://www.w3.org/2001/XMLSchema#',
  }
  const NS = {}
  for (const [k, v] of Object.entries(bases)) NS[k] = ns(v)
  return { ur: { NS } }
})

vi.mock('./util-rdf.js', () => ({ ur }))

import './event-create.js'

// Fully-qualified IRIs the wire emits (resolved through ur.NS in the module).
const IRI = {
  i_function: NS_BASES.NEO + 'i_function',
  o_result: NS_BASES.NEO + 'o_result',
  i_entity: NS_BASES.NEO + 'i_entity',
  i_attribute: NS_BASES.NEO + 'i_attribute',
  t_start: NS_BASES.NEO + 't_start',
  b_capable: NS_BASES.SIO + 'SIO_000586',
  i_input: NS_BASES.SIO + 'SIO_000230',
  t_execute: NS_BASES.OBO + 'OBI_0000308',
  tl_at: NS_BASES.TL + 'at',
  rdfs_label: NS_BASES.RDFS + 'label',
  foaf_maker: NS_BASES.FOAF + 'maker',
  rdf_type: NS_BASES.RDF + 'type',
}

const FN = 'https://trinity.graphmetrix.net/node/t_2na'
const WEBID = 'https://tst-shopper.demo.systemtwin.com/i'
const POD = 'https://tst-smith-family.demo.systemtwin.com/i'
const PARENT = 'https://tst-shopper.demo.systemtwin.com/i'

/** Build the full createTrinpod payload (the exact call order pod-create.js uses) and return
 *  both the rich event object and the parsed N3 quads of its emitted turtle. */
function buildCreatePayload({ label = 'Smith Family', type = NS_BASES.NEO + 'a_pod-solid' } = {}) {
  ur._resetEventBlankNodeCounter()
  let obj = ur.capability(WEBID, FN)
  obj = ur.addStateForInput(POD, IRI.rdfs_label, label, obj)
  obj = ur.addStateForInput(POD, IRI.foaf_maker, PARENT, obj)
  obj = ur.addStateForInput(POD, IRI.rdf_type, type, obj)
  const event = ur.event(obj)
  const turtle = ur.quadsToTurtle(event.quads)
  const quads = new N3.Parser().parse(turtle)
  return { event, turtle, quads }
}

/** All objects of (s, p, *) in a parsed quad list. */
function objects(quads, s, p) {
  return quads.filter((q) => q.subject.value === s && q.predicate.value === p).map((q) => q.object)
}
/** All subjects of (*, p, o) in a parsed quad list. */
function subjects(quads, p, o) {
  return quads.filter((q) => q.predicate.value === p && q.object.value === o).map((q) => q.subject)
}

beforeEach(() => {
  ur._resetEventBlankNodeCounter()
})

describe('event-create.js — Neo capability-invocation builder', () => {
  describe('getURI discrimination (PORT CHANGE 3) — drives literal-vs-node in addStateForInput', () => {
    // Spec: 5VDS.F.PodPersistenceAndControl — event payload must reify a label as a literal
    // and a WebID/maker/type as a node, exactly as the accelerator does.
    test('a WebID string is reified as a NODE (the i_entity of a state), a name as a LITERAL', () => {
      const { quads } = buildCreatePayload({ label: 'Smith Family' })
      // The new pod URI appears as the i_entity subject of label/maker/type states (a node).
      const podIsEntity = quads.some(
        (q) => q.subject.value === POD && q.predicate.value === IRI.i_entity,
      )
      expect(podIsEntity).toBe(true)
      // The label literal "Smith Family" appears as an o_result literal (a Literal term).
      const labelLits = quads.filter(
        (q) => q.predicate.value === IRI.o_result && q.object.termType === 'Literal' && q.object.value === 'Smith Family',
      )
      expect(labelLits.length).toBe(1)
      // The maker (a URL) is an o_result NamedNode, never a literal.
      const makerObjs = objects(quads, null, IRI.o_result)
        .concat(quads.filter((q) => q.predicate.value === IRI.o_result).map((q) => q.object))
      const parentAsNode = quads.some(
        (q) => q.predicate.value === IRI.o_result && q.object.termType === 'NamedNode' && q.object.value === PARENT,
      )
      expect(parentAsNode).toBe(true)
    })
  })

  describe('graph wiring — token presence cannot prove these', () => {
    // Spec: 5VDS.F.PodPersistenceAndControl — the EVENT is what makes the server PROVISION the
    // pod; a scrambled graph with the right tokens would NOT provision (2026-06-18 root cause).
    test('the capability attribute o_result is the REAL group function URI (t_2na)', () => {
      const { quads } = buildCreatePayload()
      // Find the capability attribute: an attribute whose i_function is b_capable.
      const capAttrs = subjects(quads, IRI.i_function, IRI.b_capable)
      expect(capAttrs.length).toBe(1)
      const capAttr = capAttrs[0]
      // Its o_result must be the function URI — the server keys provisioning off this.
      const results = objects(quads, capAttr.value, IRI.o_result).map((o) => o.value)
      expect(results).toContain(FN)
    })

    test("the event t_execute points at the capability STATE (entity=system, attribute=b_capable)", () => {
      const { quads } = buildCreatePayload()
      // The event is the subject of t_execute.
      const execTriples = quads.filter((q) => q.predicate.value === IRI.t_execute)
      expect(execTriples.length).toBe(1)
      const eventNode = execTriples[0].subject
      const capabilityState = execTriples[0].object
      // The capability state must be the i_entity-state of the system (WEBID).
      const webidStates = objects(quads, WEBID, IRI.i_entity).map((o) => o.value)
      expect(webidStates).toContain(capabilityState.value)
      // The event node is distinct from the capability state.
      expect(eventNode.value).not.toBe(capabilityState.value)
    })

    test('every input (label/maker/type) entity is the pod URI, and its state is an i_input of the event', () => {
      const { quads } = buildCreatePayload()
      const eventNode = quads.find((q) => q.predicate.value === IRI.t_execute).subject
      // Each input-state is the object of (pod, i_entity, state) AND the subject of (state, i_input, event).
      const podStates = objects(quads, POD, IRI.i_entity).map((o) => o.value)
      expect(podStates.length).toBe(3) // label + maker + type
      const inputStates = subjects(quads, IRI.i_input, eventNode.value).map((s) => s.value)
      // Every pod state is wired as an input of the event.
      for (const st of podStates) {
        expect(inputStates).toContain(st)
      }
    })

    test('each input attribute carries BOTH i_function (the predicate) and o_result (the value)', () => {
      const { quads } = buildCreatePayload()
      // The three input predicates: rdfs:label, foaf:maker, rdf:type.
      const predicateValues = new Set()
      // Walk pod → i_entity → state ; attribute → i_attribute → same state ; attribute carries i_function/o_result.
      const podStates = objects(quads, POD, IRI.i_entity).map((o) => o.value)
      for (const state of podStates) {
        const attrs = subjects(quads, IRI.i_attribute, state).map((s) => s.value)
        expect(attrs.length).toBe(1) // exactly one attribute per state
        const attr = attrs[0]
        const fns = objects(quads, attr, IRI.i_function).map((o) => o.value)
        const results = objects(quads, attr, IRI.o_result)
        expect(fns.length).toBe(1)
        expect(results.length).toBe(1)
        predicateValues.add(fns[0])
      }
      expect(predicateValues.has(IRI.rdfs_label)).toBe(true)
      expect(predicateValues.has(IRI.foaf_maker)).toBe(true)
      expect(predicateValues.has(IRI.rdf_type)).toBe(true)
    })
  })

  describe('blank-node counter (PORT CHANGE 2) — must stay monotonic across one payload', () => {
    // Spec: module header PORT CHANGE 2 — "MUST keep incrementing across the several blank nodes
    // minted in one create payload (do not reset mid-payload)". A collision corrupts the graph
    // while every toContain still passes.
    test('all blank nodes minted in one payload are DISTINCT (no counter collision)', () => {
      const { quads } = buildCreatePayload()
      const blanks = new Set()
      let blankCount = 0
      for (const q of quads) {
        for (const term of [q.subject, q.object]) {
          if (term.termType === 'BlankNode') {
            blanks.add(term.value)
          }
        }
      }
      // Count how many distinct blank-node roles exist: capability attr + cap state +
      // start-time attrs + 3 input attrs + 3 input states + event ≈ many; assert no two collapsed.
      // The structural guarantee we need: the graph has at least the event + capability-state +
      // 3 input-states + 4 attributes as distinct blanks (≥9 distinct).
      expect(blanks.size).toBeGreaterThanOrEqual(9)
    })

    test('_resetEventBlankNodeCounter makes two builds produce identical BUILDER blank-node labels', () => {
      // Compare the BUILDER's own blank-node labels (event.quads, pre-serialization). The N3
      // Parser assigns its own per-parse blank prefix on re-parse, so we must read the raw quads
      // the module minted — those reflect the module counter that _reset zeroes.
      const a = buildCreatePayload()
      const b = buildCreatePayload()
      const labelsOf = (eventQuads) => {
        const s = new Set()
        for (const q of eventQuads) {
          if (q.subject?.termType === 'BlankNode') s.add(q.subject.value)
          if (q.object?.termType === 'BlankNode') s.add(q.object.value)
        }
        return [...s].sort()
      }
      // After reset, the deterministic counter yields the same blank-node labels each run.
      expect(labelsOf(a.event.quads)).toEqual(labelsOf(b.event.quads))
      // And there must actually be blank nodes (guards against a vacuous pass).
      expect(labelsOf(a.event.quads).length).toBeGreaterThanOrEqual(9)
    })
  })

  describe('evtTime — default-now vs explicit timestamp', () => {
    // evtTime builds a REIFIED attribute (not a direct tl:at triple): the time attribute carries
    // (attr, i_function, tl:at) + (attr, o_result, <timestamp literal>). The accelerator's c.time.
    test('evtTime with no arg stamps a current ISO dateTime literal as the o_result of a tl:at attribute', () => {
      ur._resetEventBlankNodeCounter()
      const obj = ur.evtTime(undefined, {})
      // The attribute's i_function is tl:at; its o_result is the timestamp.
      const fnQuad = obj.quads.find((q) => q.predicate.value === IRI.i_function && q.object.value === IRI.tl_at)
      expect(fnQuad).toBeTruthy()
      const resQuad = obj.quads.find((q) => q.subject.value === fnQuad.subject.value && q.predicate.value === IRI.o_result)
      expect(resQuad).toBeTruthy()
      expect(resQuad.object.termType).toBe('Literal')
      expect(resQuad.object.datatype.value).toBe(NS_BASES.XSD + 'dateTime')
      // Parseable as a date.
      expect(Number.isNaN(Date.parse(resQuad.object.value))).toBe(false)
    })

    test('evtTime with an explicit time uses that timestamp as the o_result', () => {
      ur._resetEventBlankNodeCounter()
      const when = '2026-06-18T03:00:00.000Z'
      const obj = ur.evtTime(when, {})
      const fnQuad = obj.quads.find((q) => q.predicate.value === IRI.i_function && q.object.value === IRI.tl_at)
      const resQuad = obj.quads.find((q) => q.subject.value === fnQuad.subject.value && q.predicate.value === IRI.o_result)
      // toISOString() of the parsed Date — equal instant.
      expect(new Date(resQuad.object.value).toISOString()).toBe(when)
    })
  })

  describe('guard branches', () => {
    test('evtAttribute returns the obj UNCHANGED when Function is not a valid URI', () => {
      ur._resetEventBlankNodeCounter()
      const obj = { quads: [] }
      const out = ur.evtAttribute('not-a-url', 'whatever', obj)
      // No attribute minted, no quads pushed — the accelerator's checkURL guard.
      expect(out.quads.length).toBe(0)
      expect(out.attribute).toBeUndefined()
    })

    test('quadsToTurtle returns undefined for a non-array argument', () => {
      expect(ur.quadsToTurtle(null)).toBeUndefined()
      expect(ur.quadsToTurtle('nope')).toBeUndefined()
    })

    test('quadsToTurtle emits prefixed turtle for a minimal quad set', () => {
      const { DataFactory } = N3
      const { namedNode, quad } = DataFactory
      const q = quad(namedNode(POD), namedNode(IRI.rdf_type), namedNode(NS_BASES.NEO + 'a_pod-solid'))
      const turtle = ur.quadsToTurtle([q])
      expect(typeof turtle).toBe('string')
      // Re-parse round-trips the triple.
      const parsed = new N3.Parser().parse(turtle)
      expect(parsed.length).toBe(1)
      expect(parsed[0].subject.value).toBe(POD)
    })
  })
})
