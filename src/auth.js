// UNIT_TYPE=Hook

/**
 * Solid-OIDC auth helpers — attaches ur.solidLogin, ur.handleLoginRedirect,
 * ur.logoutApp, ur.logoutIdp, ur.stripOidcParams.
 * Uses globalThis.solid.session installed by rdfStore.js.
 */
import { ur } from './util-rdf.js'

function readEnv(key) {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key] != null) {
    return import.meta.env[key]
  }
  return undefined
}

const DEFAULT_OIDC_ISSUER = readEnv('VITE_TWINPOD_OIDC_ISSUER') || 'https://stage.graphmetrix.net'

ur.stripOidcParams = function(url) {
  return url.split(/[?#]/)[0]
}

ur.solidLogin = async function({ oidcIssuer, clientName, redirectUrl } = {}) {
  const session = globalThis.solid?.session
  if (!session) throw new Error('TwinPod session not initialized — rdfStore.js must be imported first')
  if (session.info.isLoggedIn) return session.info

  const effectiveRedirect = ur.stripOidcParams(
    redirectUrl || (typeof globalThis.location !== 'undefined' ? globalThis.location.href : '')
  )

  await session.login({
    oidcIssuer: oidcIssuer || DEFAULT_OIDC_ISSUER,
    clientName: clientName || 'twinpod-client',
    redirectUrl: effectiveRedirect,
  })
  return session.info
}

ur.handleLoginRedirect = async function() {
  const session = globalThis.solid?.session
  if (!session) throw new Error('TwinPod session not initialized — rdfStore.js must be imported first')
  return session.handleIncomingRedirect({
    url: typeof globalThis.location !== 'undefined' ? globalThis.location.href : '',
    restorePreviousSession: true,
  })
}

ur.logoutApp = async function() {
  const session = globalThis.solid?.session
  if (!session) return
  return session.logout({ logoutType: 'app' })
}

ur.logoutIdp = async function(state = 'post-logout') {
  const session = globalThis.solid?.session
  if (!session) return
  return session.logout({ logoutType: 'idp', state })
}
