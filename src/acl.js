// UNIT_TYPE=Hook

/**
 * WAC-Allow ACL helpers — attaches ur.parseWacAllow, ur.userCanRead, ur.userCanWrite,
 * ur.userCanEdit, ur.userCanControl, ur.isPublic.
 * All functions are pure — no rdfStore access.
 */
import { ur } from './util-rdf.js'

const emptyModes = () => ({
  read: false,
  write: false,
  append: false,
  control: false,
})

ur.parseWacAllow = function(headerValue) {
  const result = { user: emptyModes(), public: emptyModes() }
  if (!headerValue) return result

  for (const part of headerValue.split(',')) {
    const m = part.match(/^\s*(user|public)\s*=\s*"([^"]*)"\s*$/)
    if (!m) continue
    const who = m[1]
    for (const mode of m[2].split(/\s+/).filter(Boolean)) {
      if (mode in result[who]) result[who][mode] = true
    }
  }
  return result
}

ur.userCanRead    = (wac) => !!wac?.user?.read
ur.userCanWrite   = (wac) => !!(wac?.user?.write || wac?.user?.append)
ur.userCanEdit    = (wac) => !!wac?.user?.write
ur.userCanControl = (wac) => !!wac?.user?.control
ur.isPublic       = (wac) => !!wac?.public?.read

// ---------------------------------------------------------------------------
// ACL WRITE SIDE — ported 2026-05-30 from TWINPODS_ACL_PERMISSIONS.md §3-§8.
//
// Standard reference: Reference_Code_TwinPod-ACL.md
//
// Open gaps (per Questions-Batch-2026-05-30.md):
//   - ACL-PUBLIC-1: confirm `acl:agentClass foaf:Agent` vs `acl:agent foaf:Agent` for Public
//   - ACL-UPLOAD-1: confirm uploadACLTurtle is or isn't a thin wrapper over standard PATCH
//   - ACL-DELETE-1: confirm partial-mode-removal pattern
//   - ACL-INHERIT-1: confirm permissionInherit semantic
//   - ACL-SECGROUP-1: confirm /i + vcard:hasMember + tagged-suffix pattern is canonical
//
// Until those answer, this implementation follows the Permissions.vue working
// pattern verbatim, including the `###` URI prefix marker (stripped by
// ur.modifyTurtle:196 — see Writes §8).
// ---------------------------------------------------------------------------

// NS is reached via ur.NS (set in namespaces.js) so the test mocks of ur
// can override without forcing a transitive rdflib import.

/**
 * Upload an ACL document. Currently a thin wrapper over the standard turtle
 * PATCH; if open question ACL-UPLOAD-1 reveals server-side ACL-specific
 * handling, this function can absorb it without API change at call sites.
 *
 * @param {string} aclURI  the ACL document URI (discovered via ur.getAclUri)
 * @param {string} turtleString  serialized turtle body (post-ur.modifyTurtle)
 * @param {boolean} [force=false]  reserved for future use; currently ignored
 * @returns {Promise<boolean>}  true on 2xx
 */
ur.uploadACLTurtle = async function(aclURI, turtleString, force = false) {
  // Mirror ur.uploadTurtleToResource (write.js:205) — PATCH text/turtle.
  // Separate name preserved to allow specialization if ACL-UPLOAD-1 resolves
  // toward distinct server-side handling.
  return ur.uploadTurtleToResource(aclURI, turtleString)
}

/**
 * Decide the agent predicate for a given agent URI.
 *
 *   foaf:Agent (or any URI containing "foaf/0.1/Agent") → Public  → acl:agentClass
 *   anything with rdf:type foaf:Person in the local store → Person → acl:agent
 *   anything else                                        → Group  → acl:agentGroup
 *
 * Standard: Reference_Code_TwinPod-ACL.md §5.4.
 *
 * @param {string} agentUri
 * @returns {'Public'|'Person'|'Group'}
 */
ur.checkTypeOfAgent = function(agentUri) {
  if (!agentUri) return 'Group'
  const foafAgent = ur.NS.FOAF('Agent').value
  if (agentUri === foafAgent || String(agentUri).includes('foaf/0.1/Agent')) return 'Public'
  // Check the local rdfStore for an explicit foaf:Person typing
  try {
    const personMatch = ur.rdfStore.match(
      ur.$rdf.sym(agentUri),
      ur.NS.RDF('type'),
      ur.NS.FOAF('Person'),
    )
    if (personMatch && personMatch[0]) return 'Person'
  } catch {}
  return 'Group'
}

/**
 * Grant Read / Write / Append / Control to an agent on a resource by writing
 * an acl:Authorization triple block to the resource's discovered ACL document.
 *
 * Ported from TWINPODS_ACL_PERMISSIONS.md §16 (addAclPermission template).
 *
 * Notes:
 *   - The `###` URI prefix on acl:default / acl:accessTo is preserved (Espen
 *     marker, stripped by ur.modifyTurtle:196 before the body leaves the client
 *     — see Reference_Code_TwinPod-Writes.md §8).
 *   - All four modes default to false; submit at least one or the function returns
 *     false without making the call.
 *   - Open question ACL-PUBLIC-1 — Public uses `acl:agentClass foaf:Agent`. If
 *     server prefers `acl:agent foaf:Agent`, update this function (no API change).
 *
 * @param {string} resourceUri  the resource being protected
 * @param {string} agentUri  the WebID, group URI, or foaf:Agent URI
 * @param {Object} modes
 * @param {boolean} [modes.read=false]
 * @param {boolean} [modes.write=false]
 * @param {boolean} [modes.append=false]
 * @param {boolean} [modes.control=false]
 * @returns {Promise<boolean>}
 */
ur.addAclPermission = async function(resourceUri, agentUri, modes = {}) {
  if (!resourceUri || !agentUri) return false
  const anyMode = !!(modes.read || modes.write || modes.append || modes.control)
  if (!anyMode) return false

  // Discover the ACL URI for the resource
  const fetchResp = await ur.fetchAndSaveTurtle(resourceUri, true, { getacluri: true })
  const aclURI = fetchResp?.acluri
  if (!aclURI) {
    console.log('addAclPermission: ACL URI discovery failed for', resourceUri)
    return false
  }

  // Build a local temp graph for the new authorization
  const localTempStore = ur.$rdf.graph()
  const blankResult = ur.getBlankNode('Permission_' + resourceUri)
  const permissionBlank = blankResult.node

  // Authorization type + accessTo + default
  localTempStore.add(permissionBlank, ur.NS.RDF('type'),    ur.NS.ACL('Authorization'), ur.$rdf.default)
  localTempStore.add(permissionBlank, ur.NS.ACL('default'),  ur.$rdf.sym('###' + resourceUri), ur.$rdf.default)
  localTempStore.add(permissionBlank, ur.NS.ACL('accessTo'), ur.$rdf.sym('###' + resourceUri), ur.$rdf.default)

  // Modes
  if (modes.read)    localTempStore.add(permissionBlank, ur.NS.ACL('mode'), ur.NS.ACL('Read'),    ur.$rdf.default)
  if (modes.write)   localTempStore.add(permissionBlank, ur.NS.ACL('mode'), ur.NS.ACL('Write'),   ur.$rdf.default)
  if (modes.append)  localTempStore.add(permissionBlank, ur.NS.ACL('mode'), ur.NS.ACL('Append'),  ur.$rdf.default)
  if (modes.control) localTempStore.add(permissionBlank, ur.NS.ACL('mode'), ur.NS.ACL('Control'), ur.$rdf.default)

  // Agent predicate by type
  const agentType = ur.checkTypeOfAgent(agentUri)
  if (agentType === 'Public') {
    localTempStore.add(permissionBlank, ur.NS.ACL('agentClass'), ur.NS.FOAF('Agent'), ur.$rdf.default)
  } else if (agentType === 'Person') {
    localTempStore.add(permissionBlank, ur.NS.ACL('agent'), ur.$rdf.sym(agentUri), ur.$rdf.default)
  } else {
    localTempStore.add(permissionBlank, ur.NS.ACL('agentGroup'), ur.$rdf.sym(agentUri), ur.$rdf.default)
  }

  // Serialize → normalize → upload (mandatory ur.modifyTurtle step)
  let turtleString = ur.storeToTurtle(localTempStore, '')
  turtleString = ur.modifyTurtle(turtleString)
  return ur.uploadACLTurtle(aclURI, turtleString, false)
}

/**
 * Add a user as a member of a security group (the `/i` security-group pattern
 * per ACL §7).
 *
 * @param {string} groupUri  the security group resource URI
 * @param {string} memberUri  the user's WebID (typically ending in /i)
 * @returns {Promise<boolean>}
 */
ur.addMemberToSecurityGroup = async function(groupUri, memberUri) {
  if (!groupUri || !memberUri) return false
  const localTempStore = ur.$rdf.graph()
  localTempStore.add(
    ur.$rdf.sym(groupUri),
    ur.NS.VCARD('hasMember'),
    ur.$rdf.sym(memberUri),
    ur.$rdf.default,
  )
  let turtleString = ur.storeToTurtle(localTempStore, '')
  turtleString = ur.modifyTurtle(turtleString)
  return ur.uploadTurtleToResource(groupUri, turtleString)
}

/**
 * Remove a user as a member of a security group. Uses the state-delete primitive
 * on the (groupUri, vcard:hasMember, memberUri) triple.
 *
 * Resolves matrix row 6.8 (previously SkillBlank).
 *
 * Standard: Reference_Code_TwinPod-ACL.md §7.5.
 *
 * @param {string} groupUri
 * @param {string} memberUri
 * @returns {Promise<boolean>}
 */
ur.removeMemberFromSecurityGroup = async function(groupUri, memberUri) {
  if (!groupUri || !memberUri) return false
  // The vcard:hasMember triple lives ON the group resource. Use the
  // state-delete primitive against (groupUri, vcard:hasMember, memberUri).
  return ur.deleteStateByTripleAndLocal(
    ur.$rdf.sym(groupUri),
    ur.NS.VCARD('hasMember'),
    ur.$rdf.sym(memberUri),
  )
}

/**
 * Delete an ACL authorization (revoke a grant). Per ACL §9 the safe move is to
 * DELETE the authorization URI; the resource itself and its state URI are
 * left intact.
 *
 * @param {string} authorizationUri  the URI of the acl:Authorization to revoke
 * @returns {Promise<boolean>}
 */
ur.deleteAclPermission = async function(authorizationUri) {
  if (!authorizationUri) return false
  return ur.deleteURI(authorizationUri)
}
