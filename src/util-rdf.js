// UNIT_TYPE=Hook

/**
 * Core `ur` namespace — declares the shared object all submodules attach to.
 * Attaches ur.rdfStore, ur.tempRdfStore, ur.$rdf, ur.rdfFetcher, ur.rdfUpdater,
 * ur.urisFetched, ur.hyperFetch, ur.clearTempRdfStore, ur.fetchAndSaveTurtle,
 * ur.aLoadURI, ur.getAclUri, ur.checkIfAppAuthorizationRequired,
 * ur.fetchResourceTurtle.
 */
// Canonical body: Template_Code_util-rdf.txt
// Changes from template: ESM imports, hyperFetch imported from rdfStore.js, ur.checkIfAppAuthorizationRequired added.

import { rdfStore, tempRdfStore, $rdf, rdfFetcher, rdfUpdater,
         urisFetched, hyperFetch, clearTempRdfStore } from './rdfStore.js'

export const ur = {}

ur.rdfStore          = rdfStore
ur.tempRdfStore      = tempRdfStore
ur.$rdf              = $rdf
ur.rdfFetcher        = rdfFetcher
ur.rdfUpdater        = rdfUpdater
ur.urisFetched       = urisFetched
ur.hyperFetch        = hyperFetch
ur.clearTempRdfStore = clearTempRdfStore

ur.fetchAndSaveTurtle = async function(fetchURI, force=false, options={ getacluri: false }){
	return new Promise((resolve, reject) => {
		if(!urisFetched.value.includes(fetchURI) || true){
		options.force = force
		ur.aLoadURI(fetchURI, null, options).then((res) => {
			urisFetched.value.push(fetchURI)
			if(options.getacluri){
				ur.getAclUri(fetchURI, { response: res }).then((aclURI) => {
					console.log("ACL found..")
					resolve({ success: true, response: res, acluri: aclURI})
				})
			} else {
				resolve({ success: true, response: res, acluri: ""})
			}
		}).catch(reject)
		} else {
			resolve({ success: false, response: "Already fetched." })
		}
	})
}

ur.aLoadURI = async function (uri, doc, options = {}) {
  const opts = Object.assign({}, options)
  console.log('[aLoadURI]', {
	uri,
	start: opts.start,
	rows: opts.rows,
	sort: opts.sort
	})

  if (options.signal) opts.signal = options.signal

  opts.fetch = hyperFetch
  opts.headers = {
    hypergraph: 'hypergraphstring_env',
    'Cache-Control': 'max-age=0'
  }
  opts.timeout = 30000

  if (!uri) {
    console.log("ERROR: bad URI to loadURIa")
    return "ERROR: bad URI to loadURIa"
  }

  try {
	const matchesCount1 = rdfStore.statementsMatching(undefined, undefined, undefined, $rdf.sym(uri)).length
    const response = await rdfFetcher.load(uri, opts)
	const matchesCount2 = rdfStore.statementsMatching(undefined, undefined, undefined, $rdf.sym(uri)).length
	console.log(uri+": "+matchesCount1+" vs "+matchesCount2)
    return response
  } catch (err) {
    console.log("Cant load URI: ", uri, err, opts)
    ur.checkIfAppAuthorizationRequired(uri)
    throw err
  }
}

ur.getAclUri = async function(uri, uriRequest=undefined, options={}){
	if(!uriRequest) uriRequest = await ur.fetchAndSaveTurtle(uri, true, options)
	return new Promise(resolve => {
		if(uriRequest.response.headers){
			uriRequest.response.headers.forEach((header) => {
			if(header.includes('rel="acl"')){
				const linkArray = header.split(",")
				linkArray.forEach(element => {
				if(element.includes('rel="acl"')){
					let aclURI = element.split(";")[0]
					aclURI = aclURI.replaceAll("<", "").replaceAll(">", "")
					resolve(aclURI)
				}
				})
			}
			})
		}
		resolve(undefined)
	})
}

ur.checkIfAppAuthorizationRequired = function(uri){
	try {
		if(globalThis.solid && globalThis.solid.session && !globalThis.solid.session.info.isLoggedIn){
			if(ur.solidLogin) ur.solidLogin()
		}
	} catch (err) {
		console.log("checkIfAppAuthorizationRequired error:", err)
	}
}

// Fetch a TwinPod resource as Turtle without the hypergraph header.
// Using ur.hyperFetch (via ur.fetchAndSaveTurtle) sends hypergraph: '...' which
// causes TwinPod to return the full pod knowledge graph rather than the
// individual resource Turtle. This wrapper bypasses that header so the caller
// gets the actual bytes stored at the URI.
//
// Returns { ok: boolean, status: number, turtle: string }.
ur.fetchResourceTurtle = async function(uri) {
  const response = await window.solid.session.fetch(uri, {
    method: 'GET',
    headers: {
      Accept: 'text/turtle',
      'Cache-Control': 'max-age=0'
    }
  })
  const turtle = await response.text()
  return { ok: response.ok, status: response.status, turtle }
}
