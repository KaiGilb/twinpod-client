// UNIT_TYPE=Hook

/**
 * TwinPod pod-local search — attaches ur.searchAndGetURIs.
 *
 * @see Reference_Code_TwinPod-Search.md for full contract.
 */
// Canonical body: Template_Code_TwinPod-Search.txt
// Adaptations from template: podRoot explicit param, options object, ur.hyperFetch instead of window.solid.session.fetch,
// module-local Map cache instead of Vuex previousSearches, lang defaults to 'en' (no Vuex locale fallback).

import { ur } from './util-rdf.js'

const previousSearches = new Map()

ur.searchAndGetURIs = async function(podRoot, conceptName, { force = false, lang = 'en', start = 0, rows = 30, pods, predicates, hierarchy } = {}) {
  return new Promise(async (resolve, reject) => {
    if (!conceptName || conceptName.length <= 2) resolve({ error: "true" })
    let searchURI = ""
    if (!podRoot || podRoot == "") {
      return { response: "", headers: [] }
    }
    const root = podRoot.endsWith('/') ? podRoot : podRoot + '/'
    searchURI = root + 'search/' + encodeURIComponent(conceptName)
    if (!searchURI || searchURI == "") {
      return { response: "", headers: [] }
    }
    searchURI = searchURI + "?language=" + lang
    searchURI = searchURI + "&start=" + start + "&rows=" + rows
    if (pods) {
      if (Array.isArray(pods)) {
        pods.forEach(poduri => {
          searchURI = searchURI + "&pod=" + poduri
        })
      } else {
        searchURI = searchURI + "&pod=" + pods
      }
    }
    if (predicates) {
      if (Array.isArray(predicates)) {
        predicates.forEach(predicateval => {
          searchURI = searchURI + "&predicate=" + encodeURIComponent(predicateval)
        })
      } else {
        searchURI = searchURI + "&predicate=" + encodeURIComponent(predicates)
      }
    }
    if (hierarchy) searchURI = searchURI + "&hierarchy=" + hierarchy
    try {
      if (!force && previousSearches.has(searchURI)) {
        const search = previousSearches.get(searchURI)
        console.log("Did find existing search: " + search.uri)
        resolve(search)
        return search
      }
      previousSearches.set(searchURI, { uri: searchURI, time: Date.now(), response: undefined })
    } catch (error) {}
    console.log("Fetching...")
    const responseObject = { response: undefined, headers: [] }
    const res = await ur.hyperFetch(
      searchURI, {
        method: "GET",
        credentials: "include",
        headers: {
          "Accept": "text/turtle"
        },
      })
    responseObject.response = await res.text()
    responseObject.status = res.status
    if (responseObject.response == "507") console.error("Error 507 Insufficient Storage. Please try later.")
    res.headers.forEach((value, key) => {
      responseObject.headers.push({ key: key, val: value })
    })
    try {
      const existing = previousSearches.get(searchURI)
      if (existing) {
        existing.response = responseObject.response
      }
    } catch (error) {}
    try {
      ur.$rdf.parse(responseObject.response, ur.rdfStore, searchURI, 'text/turtle')
    } catch (error) { console.log(error) }
    resolve(responseObject)
  })
}
