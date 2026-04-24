// UNIT_TYPE=Hook

/**
 * rdflib store singletons and hyperFetch for the browser.
 * Installs window.solid.session (Solid-OIDC Session), defines hyperFetch
 * (adds pagination, Accept: text/turtle, Cache-Control, hypergraph header),
 * and exports the shared rdflib graph, fetcher, updater, and temp store.
 */
// Canonical body: Template_Code_TwinPod-Browser-RDF-Store.txt
// Changes from template: require→import, 'hypergraphstring_env'→import.meta.env value, stray I removed from export.

import * as $rdf from 'rdflib'
import { Session, InMemoryStorage } from '@inrupt/solid-client-authn-browser'
import { ref } from 'vue'

window.solid = {}
window.solid.session = new Session()
window.solidFetcher = window.solid.session.fetch
window.solid.storage = InMemoryStorage

const hyperFetch = function (resource, init) {
  init = init || {}
  init.headers = init.headers || {}
  const method = (init.method || 'GET').toUpperCase()
  const isAcl = String(resource).includes('acl=')

  if (!isAcl && (method === 'GET' || method === 'HEAD')) {
    const u = new URL(resource, window.location.origin)
    if (init.start != null || init.rows != null || u.searchParams.has('start') || u.searchParams.has('rows')) {
      const startInt = (init.start != null ? init.start : (u.searchParams.get('start') || 0))
      const rowsInt  = (init.rows  != null ? init.rows  : (u.searchParams.get('rows')  || 20))
      u.searchParams.set('start', String(startInt))
      u.searchParams.set('rows',  String(rowsInt))
      resource = u.toString()
    }
  }

  if (!init.headers.accept) {
    init.headers.accept = 'text/turtle;q=1.0, application/ld+json;q=0.9, application/rdf+xml;q=0.8, */*;q=0.1'
  }

  init.headers.hypergraph = import.meta.env.VITE_HYPERGRAPH_CODE
  init.headers['Cache-Control'] = init.headers['Cache-Control'] || 'max-age=0'

  return window.solid.session.fetch(resource, init)
}

const clearTempRdfStore = function () {
  tempRdfStore = $rdf.graph()
}

window.solid.hyperFetch = hyperFetch
window.solidFetcher = hyperFetch

const rdfStore = $rdf.graph()
const rdfFetcher = new $rdf.Fetcher(rdfStore, { fetch: hyperFetch })
const rdfUpdater = new $rdf.UpdateManager(rdfStore)
let tempRdfStore = $rdf.graph()
console.log('Unique quadstore initialized:', rdfStore)
const urisFetched = ref([])

export { rdfStore, tempRdfStore, $rdf, rdfFetcher, rdfUpdater, urisFetched, hyperFetch, clearTempRdfStore }
