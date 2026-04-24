# Changelog

## [1.1.0] - 2026-04-19
### Added — ur.fetchResourceTurtle
- **`ur.fetchResourceTurtle(uri)`** — new lightweight resource reader. Fetches `uri` via `window.solid.session.fetch` with `Accept: text/turtle` and `Cache-Control: max-age=0` and **no hypergraph header**. Returns `{ ok: boolean, status: number, turtle: string }`. Use when you need the actual bytes stored at a TwinPod resource URI rather than the pod's full knowledge graph (which `ur.fetchAndSaveTurtle` via `ur.hyperFetch` returns when the hypergraph header is present).
- Added 4 unit tests in `src/util-rdf.test.js` covering: correct headers sent (including verified absence of `hypergraph`), `{ ok, status, turtle }` shape on success, error status pass-through, and rejection propagation.
- `Rule_Code_twinpod-client-package.md` `ur.*` inventory updated with `ur.fetchResourceTurtle`. Internal file layout entry for `util-rdf.js` updated.
- **Motivation:** `noteworld-notes@5.2.0` — `useTwinPodNoteRead` and `useTwinPodNotePreviews` were calling `window.solid.session.fetch` directly, violating the single-namespace rule. `ur.fetchResourceTurtle` is the canonical resolution: the call lives in the package once, apps use `ur.*` only.

## [1.0.0] - 2026-04-17
### Breaking — single `ur` namespace
- All TwinPod helpers now live on a single `ur` object. The only legal import is `import { ur } from '@kaigilb/twinpod-client'`.
- Removed named exports: `rdfStore`, `hyperFetch`, `createHyperFetch`, `createSolidFetch`, `searchAndGetURIs`, `NS`, and all write/ACL/auth/discovery helpers.
- Removed sub-path exports (`/auth`, `/acl`, `/discovery`, `/write`, `/neo`, `/search`, `/namespaces`).
- `createHyperFetch` and `createSolidFetch` factories retired — `ur.hyperFetch` is the single internal fetch.
- `rdfStore.js` now installs `window.solid.session` (Solid-OIDC `Session`) and defines `hyperFetch` using `window.solid.session.fetch`.
- New `util-rdf.js` declares the `ur` namespace and attaches canonical read helpers (`ur.fetchAndSaveTurtle`, `ur.aLoadURI`, `ur.getAclUri`).
- `ur.searchAndGetURIs(podRoot, conceptName, { force, lang, start, rows, pods, predicates, hierarchy })` — new signature with explicit `podRoot` and options object.
- `ur.uploadTurtleToResource(uri, turtleBody, options)` — `fetch` parameter removed; uses `ur.hyperFetch` internally.
- `ur.getBlankNode(label)` and `ur.storeToTurtle(store, baseUrl)` — `$rdf` parameter removed; use `ur.$rdf` internally.
- Auth functions use `globalThis.solid.session` instead of `getDefaultSession()`.
