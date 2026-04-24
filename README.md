# @kaigilb/twinpod-client

Reusable TwinPod / Solid client for `@kaigilb` Vue apps.

This package is the single source of truth for how Vue apps talk to TwinPod. Apps must not define their own `rdfStore.js`, `hyperFetch`, `Session`, ACL parser, or namespace table — import them from here.

## Spec and references

- Package spec: `/Users/kaigilb/Vault_Ideas/9 - Standard/Rule_Code_twinpod-client-package.md`
- Turtle store bootstrap: `/Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_Turtle-in-browser.md`
- Auth: `/Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_TwinPod-Auth.md`
- ACL: `/Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_TwinPod-ACL.md`
- Pod discovery: `/Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_TwinPod-PodDiscovery.md`
- Writes: `/Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_TwinPod-Writes.md`
- Neo query patterns: `/Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_Neo-Query-Patterns.md`
- TwinPod / LWS rule: `/Users/kaigilb/Vault_Ideas/9 - Standard/Rule_Code_twinpod-lws.md`

## Installation (in a consuming app)

```bash
npm install @kaigilb/twinpod-client
```

For local development, use `npm link` (see *Development — linking locally* below).

## Required env vars (in the consuming app)

```
VITE_TWINPOD_URL=https://stage.graphmetrix.net
VITE_HYPERGRAPH_CODE=<code from Graphmetrix>
VITE_TWINPOD_OIDC_ISSUER=https://stage.graphmetrix.net
```

These live in the app's `.env.local` — never in this package.

## Imports

```js
// Core store + namespaces
import { rdfStore, rdfFetcher, rdfUpdater, hyperFetch, NS, $rdf } from '@kaigilb/twinpod-client'

// Auth
import { solidLogin, handleLoginRedirect, logoutApp, logoutIdp } from '@kaigilb/twinpod-client/auth'

// ACL
import { parseWacAllow, userCanRead, userCanEdit } from '@kaigilb/twinpod-client/acl'

// Pod discovery
import { findPodRoots, getOwnerWebId, listContainer } from '@kaigilb/twinpod-client/discovery'

// Writes (Stack A rdflib PATCH + Stack C Neo node creation + Stack B re-exports)
import { setValue, setValues,
         mintNodeUri, patchInsert, createNeoNode,
         uploadImage, deleteResource,
         getSolidDataset, saveSolidDatasetAt, createThing, buildThing, setThing } from '@kaigilb/twinpod-client/write'

// Create a new Neo node (client mints URI, PATCHes /node/Substance with SPARQL INSERT DATA)
const noteUri = await createNeoNode(podRoot, 'https://neo.graphmetrix.net/node/a_note')

// Neo query helpers (all accept optional predicate/type URIs — Neo defaults, overridable)
import { isType, isEntity, isState, getStatesOf, getCurrentValue } from '@kaigilb/twinpod-client/neo'
```

## Design rule — no hardcoded ontology URIs

Every helper that needs a predicate or type URI accepts it as a parameter with a sensible Neo default. The package works with any ontology — Neo is just the default case. See any function in `src/neo.js` or `src/discovery.js` for the pattern.

## Development — linking locally

```bash
# In this package
cd /Users/kaigilb/Developer/twinpod-client
npm install
npm link

# In a consuming app
cd /path/to/your/app
npm link @kaigilb/twinpod-client
```

## Build (optional)

```bash
npm run build
```

Produces `dist/` with bundled ESM. The package ships `src/` directly, so a build is optional — Vite-based consumers can import from `src/` without it.
