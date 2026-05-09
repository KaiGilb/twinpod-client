// UNIT_TYPE=Hook

/**
 * TwinPod SPARQL SELECT — attaches ur.sparqlSelect.
 *
 * Dispatches an arbitrary SPARQL SELECT query against a TwinPod SPARQL endpoint
 * and returns an array of URI strings extracted from the first bound variable
 * in the SPARQL 1.1 JSON Results Format response.
 *
 * Signature: ur.sparqlSelect(endpointUrl, queryString, options?)
 *
 * @param {string} endpointUrl   - Absolute SPARQL endpoint URL (e.g. podRoot + '/sparql')
 * @param {string} queryString   - Full SPARQL SELECT query string
 * @param {object} [options]     - Reserved for future use (e.g. timeout, credentials override)
 * @returns {Promise<string[]>}  - Array of URI/value strings from the first SELECT variable.
 *                                 Empty array if no results. Throws on HTTP error or network failure.
 *
 * Error handling:
 *   - HTTP non-ok (4xx/5xx): throws Error with status code message
 *   - Network failure: rethrows the fetch error
 *   - Malformed JSON / missing result shape: returns []
 *
 * Note: Uses ur.hyperFetch so the Solid-OIDC session DPoP token is attached
 * automatically for authenticated endpoints. The PlanguageGlossary pod is
 * publicly readable so anonymous requests also work.
 *
 * @see Step2.S.SPARQLSearch for the query patterns (modes b, c, d) that depend on this.
 * @see Reference_Code_TwinPod-Search.md for the REST search contract (ur.searchAndGetURIs).
 */

import { ur } from './util-rdf.js'

ur.sparqlSelect = async function(endpointUrl, queryString, options = {}) {
  if (!endpointUrl) {
    console.warn('[ur.sparqlSelect] endpointUrl is required')
    return []
  }
  if (!queryString) {
    console.warn('[ur.sparqlSelect] queryString is required')
    return []
  }

  let res
  try {
    res = await ur.hyperFetch(endpointUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/sparql-results+json',
      },
      body: queryString,
    })
  } catch (networkErr) {
    console.error('[ur.sparqlSelect] Network error:', networkErr)
    throw networkErr
  }

  if (!res.ok) {
    const msg = `[ur.sparqlSelect] SPARQL endpoint returned HTTP ${res.status}`
    console.error(msg, { endpointUrl })
    throw new Error(msg)
  }

  let json
  try {
    json = await res.json()
  } catch (parseErr) {
    console.error('[ur.sparqlSelect] Failed to parse SPARQL results JSON:', parseErr)
    return []
  }

  // SPARQL 1.1 JSON Results Format (https://www.w3.org/TR/sparql11-results-json/)
  // Shape: { head: { vars: ['varName', ...] }, results: { bindings: [ { varName: { type, value } } ] } }
  const varName = json?.head?.vars?.[0]
  if (!varName) {
    console.warn('[ur.sparqlSelect] No variables in SPARQL result head — empty query or wrong format')
    return []
  }

  const bindings = json?.results?.bindings ?? []
  return bindings
    .map(b => b[varName]?.value)
    .filter(Boolean)
}
