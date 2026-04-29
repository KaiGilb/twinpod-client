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

// Persistent storage backed by window.localStorage. Required for session
// restore on page reload — Inrupt's default `Session()` uses InMemoryStorage
// for the *secure* slot, which holds the DPoP private key, refresh token,
// and the `isLoggedIn` flag. Without persisting that slot, a Cmd-R wipes
// the credentials needed for `restorePreviousSession: true` to drive a
// silent re-authentication, so the user bounces back to the login screen.
//
// Inrupt's own bundle leaves a FIXME at the registration site:
//   "figure out how to persist secure storage at reload — Otherwise, the
//    client info cannot be retrieved from storage"
// The shape required is just IStorage = { get, set, delete }.
const localStorageBackedStorage = {
  get: async (key) => {
    const value = window.localStorage.getItem(key)
    return value === null ? undefined : value
  },
  set: async (key, value) => {
    window.localStorage.setItem(key, value)
  },
  delete: async (key) => {
    window.localStorage.removeItem(key)
  }
}

window.solid = {}
// Pass the persistent storage as both secureStorage AND insecureStorage so
// every piece of per-session info (DPoP keypair, refresh token, isLoggedIn,
// webId, clientId, issuer, redirectUrl, tokenType) is recoverable after a
// reload. This is the reload-persistence pattern documented in
// `9 - Standard/Reference_Code_TwinPod-Auth.md` § "Restoring sessions on
// reload".
window.solid.session = new Session({
  secureStorage: localStorageBackedStorage,
  insecureStorage: localStorageBackedStorage
})
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
