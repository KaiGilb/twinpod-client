# Changelog

## [1.4.1] - 2026-05-14
### Reverted — app-authorization-required redirect handler from v1.4.0
- Reverted the v1.4.0 `app-authorization-required` redirect handler in `hyperFetch` (`src/rdfStore.js`), the `ur.handleAppAuthRequired` helper in `src/util-rdf.js`, the explicit call in `ur.uploadTurtleToResource` (`src/write.js`), and the associated test cases (`src/rdfStore.test.js`, `src/util-rdf.test.js`, `src/write.test.js`).
- **Why:** the redirect was not the correct response to this 401 (the app is already in `acl:trustedApp`); the underlying auth-layer issue remains uncharacterised and will be diagnosed with TwinPod team input. Apps that hit 401 on PATCH should surface to user.
- `ur.refreshDoc` (added in 1.3.0) and the `|| true` cache-guard invariant (restored in 1.3.1) remain intact.

## [1.4.0] - 2026-05-14 — REVERTED in 1.4.1
### Added — automatic TwinPod app-trust redirect handling [REVERTED]
- **Cross-cutting `hyperFetch` interception (`src/rdfStore.js`)** — every authenticated request now inspects the response on non-2xx for the TwinPod-specific `app-authorization-required` response header. If present, `window.location.href` is set to the header value, navigating the user to the IdP's "Trust this app" page (`https://demo.systemtwin.com/authorizeApp?check_trusted_app=true&webid=…&pod=…`). After they click Trust, they're returned to the app and can retry the action. Covers BOTH reads (rdfFetcher.load → `ur.aLoadURI` → `ur.fetchAndSaveTurtle`) and writes (`ur.uploadTurtleToResource`, `ur.uploadFile`, `ur.uploadImage`, `ur.deleteResource`, etc.) because every request routes through hyperFetch.
- **`ur.handleAppAuthRequired(response)`** — new helper in `src/util-rdf.js`. Pure function: takes a Response (or anything with a `headers.get` method), checks for `app-authorization-required`, redirects if present, returns boolean (true if redirected). SSR-safe via `typeof window !== 'undefined'` guard. Exposed for apps that obtain Responses outside hyperFetch and want to opt into the same redirect.
- **`ur.uploadTurtleToResource` (`src/write.js`)** — explicitly calls `ur.handleAppAuthRequired(response)` on non-2xx as a documented intent marker at the write-path layer. Redundant with the hyperFetch interception today but survives future refactors that obtain a Response without going through hyperFetch.
- **Motivation:** `mynet` Cycle 001 — after a successful first save, the second save returned 401 from `tst-manerplanner.demo.systemtwin.com` with the `app-authorization-required` header set. The legacy Angular template at `Template_Code_TwinPod_Turtle_Creation.txt` line 92 handled this via `id.checkIfAppAuthenticated(containerName)`. The previous `ur.checkIfAppAuthorizationRequired` only covered the not-logged-in case (kicked off `ur.solidLogin`), not the app-trust case where the user IS logged in but the app needs to be re-trusted.
- **Behavior contract:** the function under load still returns its existing failure path (e.g. `uploadTurtleToResource` returns `false`); the redirect is a side effect on the way out. The app's error surfacing logic should still run so the user sees a "Redirecting…" message before the navigation completes.

## [1.3.1] - 2026-05-13
### Fixed — restored `|| true` cache-guard invariant
- Restored `|| true` cache-guard invariant per `Template_Code_util-rdf.txt` (template line 12: "The `|| true` on ur.fetchAndSaveTurtle line 3 is preserved verbatim (cache is written but never consulted — leave it alone)"). Removed in v1.3.0 erroneously. The cache is written but never consulted by design — the guard must stay permanently open. Post-write freshness is provided by `ur.refreshDoc(uri)` (added in 1.3.0), not by toggling this guard.

## [1.3.0] - 2026-05-13
### Added — ur.refreshDoc
- **`ur.refreshDoc(uri)`** — synchronous post-write cache invalidator. Removes all statements in `ur.rdfStore` graphed by `uri`, drops the URI from `ur.urisFetched`, and deletes `ur.rdfFetcher.requested[uri]` / `ur.rdfFetcher.fetched[uri]`. Call after a successful PUT/PATCH so the next `ur.fetchAndSaveTurtle(uri)` actually hits the network — without it, rdflib's Fetcher short-circuits with the pre-write statements and the read returns stale data (the `296 vs 296` statement-count signature in the aLoadURI console log).
- **Motivation:** `mynet` Cycle 001 — `useProfileWriter.save()` PATCHes successfully, then the post-save `useProfileReader.load()` returns the original First Name. Statement counts logged by `ur.aLoadURI` were identical before and after the write, confirming rdflib was serving cached state, not refetching.

### Fixed — fetchAndSaveTurtle guard
- Removed `|| true` dead code on line 29 of `util-rdf.js`. The cache-bypass shortcut is now provided through `ur.refreshDoc` instead of a permanently-open guard, so already-fetched URIs short-circuit as intended.

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
