// UNIT_TYPE=Hook

/**
 * Core `ur` namespace — declares the shared object all submodules attach to.
 * Attaches ur.rdfStore, ur.tempRdfStore, ur.$rdf, ur.rdfFetcher, ur.rdfUpdater,
 * ur.urisFetched, ur.hyperFetch, ur.clearTempRdfStore, ur.fetchAndSaveTurtle,
 * ur.aLoadURI, ur.getAclUri, ur.checkIfAppAuthorizationRequired,
 * ur.fetchResourceTurtle, ur.refreshDoc.
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

/**
 * Owner-authenticated read that bypasses rdflib's Fetcher 401-failure path.
 *
 * Why this exists (MyNet Phase 2 empiric, 2026-05-22):
 *   TwinPod returns owner-only data (the full Neo State chain — i_entity,
 *   i_attribute, i_function, o_result, s_state nodes that the 5-stage
 *   entity-update lifecycle requires) with HTTP status 401 even when the
 *   request is properly DPoP-authenticated and includes the correct
 *   `hypergraph` header. The response BODY is the full owner-projection,
 *   but rdflib's Fetcher treats any non-2xx status as failure, never calls
 *   the parser, and the State chain never lands in rdfStore. As a result
 *   `ur.getStateFromTriple(...)` returns `undefined` for every value,
 *   `ur.deleteStateByTripleAndLocal(...)` returns false, and updates
 *   accumulate as raw triples on the server instead of ending old States.
 *
 * What this does:
 *   Call `ur.hyperFetch(uri, { method: 'GET', credentials: 'include' })`
 *   directly, read the response body even on 401, and feed it to
 *   `$rdf.parse(text, rdfStore, uri, 'text/turtle')` ourselves. The
 *   resulting State chain is now visible to `ur.getStateFromTriple`.
 *
 * Use this in place of `ur.fetchAndSaveTurtle` for any read where you
 * need the State machinery (i.e. anywhere you intend to call
 * `getStateFromTriple` / `deleteStateByTripleAndLocal` afterwards). For
 * reads that only need flat predicates (e.g. projecting a WebID profile
 * for display), `fetchAndSaveTurtle` is still adequate.
 *
 * @param {string} uri  full HTTPS URI of the resource on the pod
 * @returns {Promise<{ok: boolean, status: number, parseError?: string}>}
 */
ur.fetchAndSaveTurtleAuth = async function(uri) {
  if (!uri) return { ok: false, status: 0, parseError: 'no uri' }
  let resp
  try {
    resp = await ur.hyperFetch(uri, { method: 'GET', credentials: 'include' })
  } catch (e) {
    return { ok: false, status: 0, parseError: e?.message || String(e) }
  }
  const text = await resp.text()
  if (!text) return { ok: resp.ok, status: resp.status }
  // Clear previously-parsed statements for this document so re-fetch doesn't
  // duplicate. rdflib quad-store is keyed on the why/graph, not the predicate.
  const why = ur.$rdf.sym(uri)
  ur.rdfStore.removeMatches(undefined, undefined, undefined, why)
  // Also evict from the rdflib Fetcher's cache so a subsequent
  // fetchAndSaveTurtle() doesn't short-circuit with stale state.
  if (ur.rdfFetcher.requested) delete ur.rdfFetcher.requested[uri]
  if (ur.rdfFetcher.fetched)   delete ur.rdfFetcher.fetched[uri]
  try {
    ur.$rdf.parse(text, ur.rdfStore, uri, 'text/turtle')
  } catch (e) {
    return { ok: false, status: resp.status, parseError: e?.message || String(e) }
  }
  return { ok: true, status: resp.status }
}

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

/**
 * Invalidate rdflib's cached state for a given document URI so the next fetch
 * goes to the network. Required after a successful PUT/PATCH if the same
 * client process will read the doc again — without it, rdflib's Fetcher
 * short-circuits with the pre-write statements and `ur.fetchAndSaveTurtle`
 * returns stale data (statement count unchanged before vs after).
 *
 * Synchronous, returns void. Safe to call with a falsy uri (no-op).
 */
ur.refreshDoc = function(uri) {
	if (!uri) return
	const sym = ur.$rdf.sym(uri)
	ur.rdfStore.removeMatches(null, null, null, sym)
	const idx = ur.urisFetched.value.indexOf(uri)
	if (idx !== -1) ur.urisFetched.value.splice(idx, 1)
	if (ur.rdfFetcher.requested) delete ur.rdfFetcher.requested[uri]
	if (ur.rdfFetcher.fetched) delete ur.rdfFetcher.fetched[uri]
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

// ---------------------------------------------------------------------------
// State-lifecycle primitives — canonical 5-step entity-update lifecycle.
// Canonical bodies ported verbatim from
//   Reference_Code_TwinPod-getStateFromTriple.md
//   Reference_Code_TwinPod-deleteURI.md
//   Reference_Code_TwinPod-deleteStateByTriple.md
//   Reference_Code_TwinPod-deleteStateByTripleAndLocal.md
// Only adaptations: `ns.NEO(...)` / `ns.RDF(...)` rewritten as `ur.NS.NEO(...)`
// / `ur.NS.RDF(...)` to match the package's namespace surface
// (namespaces.js attaches ur.NS), and `rdfStore` is accessed via the closed-over
// import already in this file. The function bodies are otherwise verbatim per
// STATE_LIFECYCLE_01.
// ---------------------------------------------------------------------------

/**
 * Find the State URI on a given entity for a given (predicate, object)
 * attribute. States are first-class URI-bearing nodes attached to entities at
 * creation — they are NOT returned by ur.searchAndGetURIs.
 *
 * Returns the State URI string, or undefined when no matching State exists.
 */
ur.getStateFromTriple = function (s, p, o) {
  let stateURI = undefined;

  // Alle match-kall får fallback til tomt array
  const entities = rdfStore.match(s, ur.NS.NEO("i_entity"), null) || [];

  for (let j = 0; j < entities.length; j++) {
    const entityObj = entities[j].object;

    const attributeArray = rdfStore.match(null, ur.NS.NEO("i_attribute"), entityObj) || [];
    for (let k = 0; k < attributeArray.length; k++) {
      const attribute = attributeArray[k];

      const entityURI = attribute.subject && attribute.subject.value
        ? attribute.subject.value
        : undefined;
      const foundObj = attribute.object;
      const foundURI = foundObj && foundObj.value ? foundObj.value : undefined;

      if (!entityURI || !foundURI) {
        continue; // mangler data, hopp videre
      }

      let found = false;
      const resultArray = rdfStore.match($rdf.sym(entityURI), ur.NS.NEO("o_result"), null) || [];

      resultArray.forEach(element => {
        const obj = element.object;

        // 1. Direkte objekt-sammenligning
        if (obj === o) {
          found = true;
          return;
        }

        // 2. Sammenlign value hvis begge har .value
        if (obj && o && obj.value !== undefined && o.value !== undefined && obj.value === o.value) {
          found = true;
          return;
        }

        // 3. Sammenlign obj.value mot o hvis o er en streng/URI
        if (obj && obj.value !== undefined && obj.value === o) {
          found = true;
          return;
        }
      });

      if (!found) continue;

      // Sjekk at riktig predicate er koblet på
      const funcMatches = rdfStore.match($rdf.sym(entityURI), ur.NS.NEO("i_function"), p) || [];
      if (funcMatches.length === 0) {
        continue;
      }

      // Sjekk at foundURI er en state
      const stateMatches = rdfStore.match($rdf.sym(foundURI), ur.NS.RDF("type"), ur.NS.NEO("s_state")) || [];
      if (stateMatches.length === 0) {
        continue;
      }

      // Vi har funnet en gyldig state
      stateURI = foundURI;
      return foundURI;
    }
  }

  return stateURI;
}

/**
 * DELETE a single URI on the server AND prune both directions of rdfStore
 * (`(*, *, uri)` and `(uri, *, *)`). Returns true on DELETE 2xx, false on 404
 * or any error.
 */
ur.deleteURI = async function(uri) {
  try {
    const sym = $rdf.sym(uri)

    // 🔥 Fjern ALT som peker TIL denne URI-en (object)
    rdfStore.statementsMatching(null, null, sym)
      .forEach(st => {
        rdfStore.removeStatement(st)
      })

    // 🔥 Fjern ALT som peker FRA denne URI-en (subject)
    rdfStore.statementsMatching(sym, null, null)
      .forEach(st => {
        rdfStore.removeStatement(st)
      })
    const res = await window.solid.session.fetch(
      uri, {
        method: "DELETE",
        credentials: "include",
      });
    console.log(res);
    if(res.status != 404){
      console.log("URI: "+uri+" has been deleted!");
      return true;
    } else {
      console.log("URI: "+uri+" not found!");
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}

/**
 * Server-only state delete: compose ur.getStateFromTriple + ur.deleteURI.
 * Does NOT prune local rdfStore — use ur.deleteStateByTripleAndLocal for that.
 *
 * Returns false if the State URI cannot be found, otherwise the result of
 * ur.deleteURI.
 */
ur.deleteStateByTriple = async function(s, p, o){
  const stateURI = ur.getStateFromTriple(s, p, o);
  if(!stateURI) {
    console.log("Subject: "+s)
    console.log("Predicate: "+p)
    console.log("Object: "+o)
    console.log("Warning. State URI not found. Nothing will be deleted.");
    return false;
  }
  console.log("Deleting state: "+stateURI);
  let response = await ur.deleteURI(stateURI, false);
  console.log(response);
  return true;
}

/**
 * Default state delete (STATE_LIFECYCLE_02): ur.getStateFromTriple +
 * ur.deleteURI + prune matching (s, p, matching-o) statements from rdfStore.
 *
 * Returns false if the State URI cannot be found, otherwise true on successful
 * DELETE + local prune.
 */
ur.deleteStateByTripleAndLocal = async function(s, p, o){
  const stateURI = ur.getStateFromTriple(s, p, o);
  if(!stateURI) {
    console.log("Subject: "+s)
    console.log("Predicate: "+p)
    console.log("Object: "+o)
    console.log("Warning. State URI not found. Nothing will be deleted.");
    return false;
  }
  console.log("Deleting state: "+stateURI);
  let response = await ur.deleteURI(stateURI, false);
  if(response){
    console.log("State deleted:")
    const statementsForResource = rdfStore.match(s, p, null);
    statementsForResource.forEach(element => {
      if(element.object.lang){
        if(o.value==element.object.value&&o.lang==element.object.lang) rdfStore.removeStatements(element);
      } else {
        rdfStore.removeStatements(element);
      }
    });
    return true;
  } else {
    console.log("Failed to delete:")
    return false;
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
