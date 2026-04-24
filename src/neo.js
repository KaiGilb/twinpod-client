// UNIT_TYPE=Hook

/**
 * Neo ontology query helpers — attaches ur.isType, ur.isEntity, ur.isState, ur.isAttribute,
 * ur.isEvent, ur.getStatesOf, ur.getAttributeOf, ur.getLastChange, ur.getResult,
 * ur.getCurrentValue, ur.getLabel, ur.isActive.
 * Uses ur.rdfStore and ur.NS internally.
 */
import { ur } from './util-rdf.js'

ur.isType = function(subject, typeUri, { typePredicate } = {}) {
  const RDF_TYPE = typePredicate || ur.NS.RDF('type')
  return ur.rdfStore.holds(subject, RDF_TYPE, typeUri)
}

ur.isEntity    = (subject, typeUri) => ur.isType(subject, typeUri || ur.NS.NEO('a_entity'))
ur.isState     = (subject, typeUri) => ur.isType(subject, typeUri || ur.NS.NEO('s_state'))
ur.isAttribute = (subject, typeUri) => ur.isType(subject, typeUri || ur.NS.NEO('a_attribute'))
ur.isEvent     = (subject, typeUri) => ur.isType(subject, typeUri || ur.NS.NEO('e_event'))

ur.getStatesOf = function(entityUri, { predicate } = {}) {
  const pred = predicate || ur.NS.NEO('i_entity')
  return ur.rdfStore.match(entityUri, pred, null).map(st => st.object)
}

ur.getAttributeOf = function(stateUri, { predicate } = {}) {
  const pred = predicate || ur.NS.NEO('i_attribute')
  return ur.rdfStore.any(stateUri, pred, null)
}

ur.getLastChange = function(stateUri, { predicate } = {}) {
  const pred = predicate || ur.NS.NEO('m_last-change')
  return ur.rdfStore.any(stateUri, pred, null)
}

ur.getResult = function(subjectUri, { predicate } = {}) {
  const pred = predicate || ur.NS.NEO('o_result')
  return ur.rdfStore.any(subjectUri, pred, null)
}

ur.getCurrentValue = function(entityUri, attributeUri, {
  statesPredicate,
  attributePredicate,
  resultPredicate,
} = {}) {
  const sp = statesPredicate || ur.NS.NEO('i_entity')
  const ap = attributePredicate || ur.NS.NEO('i_attribute')
  const rp = resultPredicate || ur.NS.NEO('o_result')
  const states = ur.rdfStore.match(entityUri, sp, null).map(st => st.object)
  for (const state of states) {
    if (ur.rdfStore.holds(state, ap, attributeUri)) {
      const result = ur.rdfStore.any(state, rp, null)
      if (result) return result.value
    }
  }
  return undefined
}

ur.getLabel = function(subject, { labelPredicate, lang = 'en' } = {}) {
  const pred = labelPredicate || ur.NS.RDFS('label')
  const labels = ur.rdfStore.match(subject, pred, null).map(st => st.object)
  return labels.find(l => l.language === lang)?.value ?? labels[0]?.value
}

ur.isActive = function(stateUri, { statusPredicate, activeStatusSuffix = '/s_active' } = {}) {
  const pred = statusPredicate || ur.NS.NEO('m_status')
  const status = ur.rdfStore.any(stateUri, pred, null)
  return !!(status && status.value.endsWith(activeStatusSuffix))
}
