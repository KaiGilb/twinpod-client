// UNIT_TYPE=Feature

/**
 * @package @kaigilb/twinpod-client
 * @description Reusable TwinPod / Solid client for @kaigilb Vue apps.
 *
 * Public API — single `ur` namespace. Import as: `import { ur } from '@kaigilb/twinpod-client'`
 *
 * Reads:    ur.fetchAndSaveTurtle, ur.fetchResourceTurtle, ur.searchAndGetURIs
 * SPARQL:   ur.sparqlSelect
 * Writes:   ur.uploadTurtleToResource, ur.uploadFile, ur.setValue, ur.setValues, ur.createNeoNode, ur.deleteResource
 * Auth:     ur.solidLogin, ur.handleLoginRedirect, ur.logoutApp, ur.logoutIdp
 * ACL:      ur.parseWacAllow, ur.userCanRead, ur.userCanWrite, ur.userCanEdit, ur.userCanControl, ur.isPublic
 * Discovery: ur.findPodRoots, ur.getOwnerWebId, ur.listContainer
 * Store:    ur.rdfStore, ur.tempRdfStore, ur.$rdf, ur.NS
 */
import './namespaces.js'
import './acl.js'
import './auth.js'
import './discovery.js'
import './search.js'
import './sparql.js'
import './write.js'
import './neo.js'
export { ur } from './util-rdf.js'
