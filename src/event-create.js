// UNIT_TYPE=Hook

/**
 * Neo EVENT / capability-invocation builder — attaches the minimal `ur.*` graph
 * primitives needed to express a capability invocation as a Neo Event:
 *   ur.evtAttribute, ur.evtState, ur.evtStart, ur.evtTime,
 *   ur.capability, ur.addStateForInput, ur.event, ur.quadsToTurtle.
 *
 * WHY THIS EXISTS (root cause, 2026-06-18):
 *   ur.createTrinpod was ported (2026-05-30) as a BARE `INSERT DATA { 4 plain triples }`.
 *   A live run (signed-in tst-shopper, created tst-smith-family) PROVED that recorded
 *   metadata but NEVER provisioned a writable pod (authenticated
 *   `PATCH https://tst-smith-family…/node/Substance → 404`). The ORIGINAL working
 *   `c.createTrinpod` wraps the create in a Neo EVENT — a `c.capability(webId, fn)` +
 *   three `c.addStateForInput(...)` reified onto the new pod URI, then `c.event(obj)` +
 *   `c.quadsToTurtle(event.quads)`. The EVENT/capability-invocation shape is what makes
 *   the server actually PROVISION the pod. The port dropped it; this module restores it.
 *
 * PROVENANCE — ported VERBATIM (algorithm-for-algorithm) from the working sources, both
 * of which are byte-identical (the live accelerator is the minified build of the original):
 *   - twin/src/app/twin/src/app/libs/util-c.js — c.attribute (33-63), c.state (65-106),
 *     c.time (108-116), c.start (118-145), c.capability (149-168), c.event (171-216),
 *     c.addStateForInput (218-248), c.quadsToTurtle (1222-1247).
 *   - twinpod-launchpad/js/app.10e879f5.js (LIVE accelerator, authoritative — it WORKS):
 *     the same helpers, minified. The createTrinpod call path is identical:
 *       r = At.capability(webId, fn)
 *       r = At.addStateForInput(uri, it.m_label, name, r)
 *       r = At.addStateForInput(uri, et.FOAF("maker"), parentPod, r)
 *       r = At.addStateForInput(uri, et.RDF("type"), a_pod-solid, r)
 *       turtle = At.quadsToTurtle(At.event(r).quads)
 *
 * RDF-CONSTANT IRIs — taken from the LIVE accelerator's namespace map (authoritative; the
 *   original util-c.js variable NAMES like `neo.m_label` resolve to DIFFERENT IRIs than the
 *   literal token would suggest — the accelerator is the source of truth for the wire form):
 *     b_capable  → sio:SIO_000586      (NOT a neo: term)
 *     i_function → neo:i_function
 *     o_result   → neo:o_result
 *     i_entity   → neo:i_entity
 *     i_attribute→ neo:i_attribute
 *     t_start    → neo:t_start
 *     t_execute  → obo:OBI_0000308     (NOT a neo: term)
 *     i_input    → sio:SIO_000230      (NOT a neo: term)
 *     m_label    → rdfs:label          (NOT neo:m_label — the accelerator maps it to rdfs:label)
 *     TL('at')   → tl:at               (http://purl.org/NET/c4dm/timeline.owl#at)
 *
 * PORT CHANGES (the only deviations from the verbatim source, each forced by the new home):
 *   1. Terms are built with N3's DataFactory (namedNode/literal/blankNode/quad) instead of a
 *      mix of rdflib `$rdf.st` + N3 BlankNode/DefaultGraph. The original mixed libraries by
 *      historical accident; N3.Writer expects N3-native terms, so building everything with N3
 *      yields the SAME triple topology with correct turtle serialization. Same IRIs, same
 *      blank-node graph, same prefixes — just one term factory.
 *   2. store.commit('blankNodeIncrement') / store.state.blankNodeIndex (Vuex) is replaced by a
 *      module-level counter. It MUST keep incrementing across the several blank nodes minted in
 *      one create payload (do not reset mid-payload) — the original relied on a monotonic Vuex
 *      counter for exactly this.
 *   3. u.getURI / u.checkURL / u.isBlankNode are inlined as local helpers (`getURI`,
 *      `checkURL`, `isBlankNode`) reproducing util.js:282-340 semantics: NamedNode→value,
 *      BlankNode→itself, a plain (non-URL) literal string→undefined, a `<…>`-wrapped IRI→
 *      unwrapped. This is what makes addStateForInput treat "Smith Family" as a literal but
 *      a WebID as a node.
 *   4. Helper names are `ur.evtAttribute / evtState / evtStart / evtTime` (not the bare
 *      `attribute/state/start/time` of the `c.` object) to avoid clashing in the single `ur.*`
 *      namespace; the capability-facing names (ur.capability, ur.addStateForInput, ur.event,
 *      ur.quadsToTurtle) are kept as-is — they are the reusable public surface.
 */
import N3 from 'n3'
import { ur } from './util-rdf.js'

const { DataFactory } = N3
const { namedNode, literal, blankNode, quad, defaultGraph } = DataFactory

// --- local NS helpers (resolve IRIs via ur.NS so there's one namespace source) ---
const NEO = (t) => ur.NS.NEO(t).value
const SIO = (t) => ur.NS.SIO(t).value
const OBO = (t) => ur.NS.OBO(t).value
const RDFS = (t) => ur.NS.RDFS(t).value
const TL = (t) => ur.NS.TL(t).value
const XSD = (t) => ur.NS.XSD(t).value

// Neo RDF constants — accelerator-authoritative (see module header).
const IT = {
  b_capable: SIO('SIO_000586'),
  i_function: NEO('i_function'),
  o_result: NEO('o_result'),
  t_start: NEO('t_start'),
  i_attribute: NEO('i_attribute'),
  i_entity: NEO('i_entity'),
  t_execute: OBO('OBI_0000308'),
  i_input: SIO('SIO_000230'),
  m_label: RDFS('label'),
}
const XSD_STRING = XSD('string')
const XSD_INTEGER = XSD('integer')
const XSD_DATETIME = XSD('dateTime')

// Module-level blank-node counter — replaces the Vuex blankNodeIndex. Monotonic across
// every blank node minted in a single payload (PORT CHANGE 2).
let blankNodeIndex = 0
function nextBlank() {
  blankNodeIndex += 1
  return blankNode(String(blankNodeIndex))
}

// --- inlined util.js helpers (PORT CHANGE 3) ---
function checkURL(s) {
  try { new URL(s); return true } catch { return false }
}
function isBlankNode(x) {
  return !!(x && typeof x === 'object' && x.termType === 'BlankNode')
}
/** Reproduces u.getURI/u.getURL: NamedNode→value, BlankNode→itself, literal-string→undefined,
 *  `<iri>`→unwrapped iri, a valid URL string→itself. */
function getURI(x) {
  if (x && typeof x === 'object') {
    if (x.termType === 'NamedNode') return x.value
    if (x.termType === 'BlankNode') return x
    return undefined // Literal / DefaultGraph / etc. — not a URI
  }
  if (typeof x === 'string') {
    if (checkURL(x)) return x
    if (/^<.*>$/.test(x)) return x.substr(1, x.length - 2)
    return undefined // a plain literal string is not a URI
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Ported graph primitives. Each mirrors its util-c.js counterpart 1:1.
// ---------------------------------------------------------------------------

/** c.attribute (util-c.js:33-63) — a reified attribute: blank `i_function Function ; o_result Result`. */
ur.evtAttribute = function (Function, Result, obj) {
  if (!obj) obj = {}
  if (!obj.quads) obj.quads = []
  const fnUri = getURI(Function)
  if (!checkURL(fnUri)) {
    // matches the accelerator's `if (G.checkURL(a))` guard — Function must be a real URI
    return obj
  }
  const fn = namedNode(fnUri)
  obj.attribute = nextBlank()
  let res = Result
  const rUri = getURI(res)
  if (rUri) {
    res = namedNode(rUri)
  } else if (typeof res === 'string') {
    res = literal(res, namedNode(XSD_STRING))
  } else if (typeof res === 'number') {
    res = literal(String(res), namedNode(XSD_INTEGER))
  }
  if (!obj.graph) obj.graph = defaultGraph()
  if (fn && res && obj.graph) {
    obj.quads.push(quad(obj.attribute, namedNode(IT.i_function), fn, obj.graph))
    obj.quads.push(quad(obj.attribute, namedNode(IT.o_result), res, obj.graph))
  }
  return obj
}

/** c.time (util-c.js:108-116) — an attribute holding the ISO timestamp (TL:at). */
ur.evtTime = function (time, obj) {
  const t = time ? new Date(time) : new Date()
  return ur.evtAttribute(TL('at'), literal(t.toISOString(), namedNode(XSD_DATETIME)), obj)
}

/** c.start (util-c.js:118-145) — mints the event blank node + a t_start time attribute. */
ur.evtStart = function (event, time, obj) {
  if (!obj) obj = {}
  if (!obj.graph) obj.graph = defaultGraph()
  if (event && obj.event) {
    // (original no-op branch preserved)
  } else {
    event = nextBlank()
  }
  if (!obj.startAttribute) {
    obj = ur.evtTime(time, obj)
    obj.startAttribute = obj.attribute
    obj.attribute = null
  }
  if (!obj.event) obj.event = event
  if (obj.startAttribute) {
    obj.quads.push(quad(event, namedNode(IT.t_start), obj.startAttribute, obj.graph))
  }
  return obj
}

/** c.state (util-c.js:65-106) — binds entity + attribute to a state node (the event blank). */
ur.evtState = function (entity, attribute, obj) {
  if (entity && typeof entity !== 'object') {
    const e = getURI(entity)
    if (e) entity = namedNode(e)
  }
  if (attribute && !(typeof attribute === 'object' && attribute.termType === 'BlankNode') && typeof attribute !== 'object') {
    const a = getURI(attribute)
    if (a) attribute = namedNode(a)
  }
  if (entity && attribute) {
    if (!obj) obj = {}
    if (!obj.quads) obj.quads = []
    const start = obj.start
    const state = ur.evtStart(null, start, obj)
    state.state = state.event
    delete state.event // hack — make sure event comes later (verbatim from original)
    if (!obj.graph) obj.graph = defaultGraph()
    obj.quads.push(quad(entity, namedNode(IT.i_entity), obj.state, obj.graph))
    obj.quads.push(quad(attribute, namedNode(IT.i_attribute), obj.state, obj.graph))
  }
  return obj
}

/** c.capability (util-c.js:149-168) — system HAS capability(func): an attribute(b_capable,func)
 *  reified as a state on `system`. (The accelerator skips the q.capability store lookup branch
 *  the original tries first — for a fresh create there is no pre-existing capability, so it
 *  always builds; we build directly, matching the accelerator.) */
ur.capability = function (system, func, obj) {
  func = getURI(func)
  system = getURI(system)
  if (func && system) {
    if (!obj) obj = {}
    const attrib = ur.evtAttribute(IT.b_capable, func, obj)
    const cap = ur.evtState(system, attrib.attribute, attrib)
    cap.capability = cap.state
    return cap
  }
}

/** c.addStateForInput (util-c.js:218-248) — reify (func,result) onto `entity` and queue the
 *  resulting state node as an input of the event. */
ur.addStateForInput = function (entity, func, result, obj) {
  entity = getURI(entity)
  func = getURI(func)
  const rUri = getURI(result)
  if (rUri) {
    result = namedNode(rUri)
  } else if (typeof result === 'string') {
    result = literal(result, namedNode(XSD_STRING))
  } else if (typeof result === 'number') {
    result = literal(String(result), namedNode(XSD_INTEGER))
  }
  if (entity && func && result) {
    if (!obj) obj = {}
    if (!obj.quads) obj.quads = []
    if (!obj.input) obj.input = []
    const attribute = ur.evtAttribute(func, result, obj)
    const state = ur.evtState(entity, attribute.attribute, attribute)
    delete state.attribute
    state.input = state.input.concat(state.state)
    delete state.state
    return state
  }
}

/** c.event (util-c.js:171-216) — the event node: t_execute → capability, plus i_input links
 *  for every queued input state. */
ur.event = function (obj) {
  if (typeof obj === 'object' && obj) {
    let capability = obj.capability
    const start = obj.start
    let input = obj.input
    if (capability) {
      const capURI = getURI(capability)
      if (capURI && !isBlankNode(capability)) {
        capability = namedNode(capURI)
      }
      const eObj = ur.evtStart(null, start, obj)
      if (eObj.event) {
        eObj.quads.push(quad(eObj.event, namedNode(IT.t_execute), capability))
        if (input) {
          if (!Array.isArray(input)) input = [input]
          input.forEach((item) => {
            if (typeof item !== 'object') {
              const u = getURI(item)
              if (u) item = namedNode(u)
            }
            if (item) {
              eObj.quads.push(quad(item, namedNode(IT.i_input), eObj.event))
            }
          })
        }
        return eObj
      }
    }
  }
}

/** c.quadsToTurtle (util-c.js:1222-1247) — serialize the event quads to a turtle BODY (no
 *  INSERT DATA wrapper — the caller wraps it). All quads forced into the default graph. */
ur.quadsToTurtle = function (quads) {
  if (quads && Array.isArray(quads)) {
    const D = defaultGraph()
    const normalized = quads.map((q) => quad(q.subject, q.predicate, q.object, D))
    const writer = new N3.Writer({
      prefixes: {
        neo: NEO(''),
        rdfs: RDFS(''),
        rdf: ur.NS.RDF('').value,
        sio: SIO(''),
        foaf: ur.NS.FOAF('').value,
        obo: OBO(''),
        tl: TL(''),
      },
    })
    writer.addQuads(normalized)
    let result
    writer.end((error, res) => {
      if (error) console.log('quadsToTurtle serialize error:', error)
      result = res
    })
    return result
  }
}

/** Test-only: reset the module blank-node counter so payload assertions are deterministic. */
ur._resetEventBlankNodeCounter = function () {
  blankNodeIndex = 0
}
