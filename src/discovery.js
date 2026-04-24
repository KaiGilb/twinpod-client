// UNIT_TYPE=Hook

/**
 * Pod discovery helpers — attaches ur.findPodRoots, ur.findProfileDoc,
 * ur.getOwnerWebId, ur.listContainer.
 * Uses ur.rdfStore and ur.rdfFetcher internally.
 */
import { ur } from './util-rdf.js'

const DEFAULT_MEMBERSHIP_PREDICATES = [
  'http://www.w3.org/ns/pim/space#storage',
  'http://xmlns.com/foaf/0.1/member',
  'http://schema.org/member',
  'http://www.w3.org/ns/solid/terms#hasMember',
  'http://www.w3.org/2006/vcard/ns#hasMember',
]

ur.findPodRoots = async function(webId, { predicates = DEFAULT_MEMBERSHIP_PREDICATES } = {}) {
  await ur.rdfFetcher.load(webId)
  const subject = ur.rdfStore.sym(webId)
  const roots = new Set()
  for (const p of predicates) {
    const pTerm = typeof p === 'string' ? ur.rdfStore.sym(p) : p
    for (const st of ur.rdfStore.match(subject, pTerm, null)) {
      roots.add(st.object.value)
    }
  }
  return Array.from(roots)
}

ur.findProfileDoc = async function(webId, {
  typePredicate,
  profileTypeUri,
} = {}) {
  const RDF_TYPE = typePredicate || ur.rdfStore.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
  const PROFILE_TYPE = profileTypeUri || ur.rdfStore.sym('http://xmlns.com/foaf/0.1/PersonalProfileDocument')
  await ur.rdfFetcher.load(webId)
  const match = ur.rdfStore.match(null, RDF_TYPE, PROFILE_TYPE)[0]
  return match?.subject?.value || webId
}

ur.getOwnerWebId = async function(resourceUrl, { makerPredicate } = {}) {
  const MAKER = makerPredicate || ur.rdfStore.sym('http://xmlns.com/foaf/0.1/maker')
  await ur.rdfFetcher.load(resourceUrl)
  const maker = ur.rdfStore.any(ur.rdfStore.sym(resourceUrl), MAKER, null)
  return maker?.value
}

ur.listContainer = async function(containerUrl, { containsPredicate } = {}) {
  const CONTAINS = containsPredicate || ur.rdfStore.sym('http://www.w3.org/ns/ldp#contains')
  await ur.rdfFetcher.load(containerUrl)
  return ur.rdfStore.match(ur.rdfStore.sym(containerUrl), CONTAINS, null)
    .map(st => st.object.value)
}
