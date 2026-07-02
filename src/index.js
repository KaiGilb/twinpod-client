// UNIT_TYPE=Feature

/**
 * @package @kaigilb/twinpod-client
 * @description Reusable TwinPod / Solid client for @kaigilb Vue apps.
 *
 * Public API — single `ur` namespace. Import as: `import { ur } from '@kaigilb/twinpod-client'`
 *
 * Reads:    ur.fetchAndSaveTurtle, ur.fetchAndSaveTurtleAuth, ur.fetchResourceTurtle, ur.searchAndGetURIs, ur.readJSON
 * SPARQL:   ur.sparqlSelect
 * Writes:   ur.uploadTurtleToResource, ur.uploadFile, ur.uploadJSON, ur.setValue, ur.setValues, ur.createNeoNode, ur.deleteResource
 * Auth:     ur.solidLogin, ur.handleLoginRedirect, ur.logoutApp, ur.logoutIdp
 * ACL read: ur.parseWacAllow, ur.userCanRead, ur.userCanWrite, ur.userCanEdit, ur.userCanControl, ur.isPublic
 * ACL write: ur.uploadACLTurtle, ur.addAclPermission, ur.deleteAclPermission, ur.checkTypeOfAgent, ur.addMemberToSecurityGroup, ur.removeMemberFromSecurityGroup
 * Discovery: ur.findPodRoots, ur.getOwnerWebId, ur.listContainer
 * Container: ur.ensureContainer  (idempotent BasicContainer HEAD/PUT)
 * State:    ur.getStateFromTriple, ur.deleteURI, ur.deleteStateByTriple, ur.deleteStateByTripleAndLocal
 * Pod create: ur.createTrinpod, ur.checkTrinpodID, ur.verifyPodReachable
 * Event:    ur.capability, ur.addStateForInput, ur.event, ur.quadsToTurtle  (Neo capability-invocation builder; createTrinpod's payload)
 * Store:    ur.rdfStore, ur.tempRdfStore, ur.$rdf, ur.NS
 * Save Q:   ur.enqueueSave, ur.onSaveEvent  (background-save scheduler — optimistic UI pattern)
 */
import './namespaces.js'
import './write.js'      // ← load first so ACL writes can reference uploadTurtleToResource/modifyTurtle
import './acl.js'
import './auth.js'
import './discovery.js'
import './search.js'
import './sparql.js'
import './neo.js'
import './container.js'
import './json-io.js'
import './save-queue.js'
import './event-create.js' // ← load before pod-create.js (createTrinpod uses the event builder)
import './pod-create.js'
export { ur } from './util-rdf.js'
