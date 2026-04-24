import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('./util-rdf.js', () => ({ ur: {} }))

import { ur } from './util-rdf.js'
import './auth.js'

function makeSession(overrides = {}) {
  return {
    info: { isLoggedIn: false, webId: null, ...overrides.info },
    login: vi.fn().mockResolvedValue({}),
    logout: vi.fn().mockResolvedValue({}),
    handleIncomingRedirect: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.solid = { session: makeSession() }
})

describe('ur.stripOidcParams', () => {
  test('strips query params', () => {
    expect(ur.stripOidcParams('https://app.com/callback?code=abc&state=xyz')).toBe('https://app.com/callback')
  })

  test('strips hash fragment', () => {
    expect(ur.stripOidcParams('https://app.com/page#token=abc')).toBe('https://app.com/page')
  })

  test('returns URL unchanged when no params or hash', () => {
    expect(ur.stripOidcParams('https://app.com/page')).toBe('https://app.com/page')
  })
})

describe('ur.solidLogin', () => {
  test('calls session.login with OIDC issuer and redirect URL', async () => {
    await ur.solidLogin({ oidcIssuer: 'https://idp.example.com', redirectUrl: 'https://app.com/' })
    expect(globalThis.solid.session.login).toHaveBeenCalledTimes(1)
    expect(globalThis.solid.session.login.mock.calls[0][0].oidcIssuer).toBe('https://idp.example.com')
    expect(globalThis.solid.session.login.mock.calls[0][0].redirectUrl).toBe('https://app.com/')
  })

  test('strips OIDC params from redirect URL', async () => {
    await ur.solidLogin({ redirectUrl: 'https://app.com/?code=abc&state=xyz' })
    expect(globalThis.solid.session.login.mock.calls[0][0].redirectUrl).toBe('https://app.com/')
  })

  test('skips login if already logged in', async () => {
    globalThis.solid.session = makeSession({ info: { isLoggedIn: true, webId: 'https://example.com/me' } })
    const result = await ur.solidLogin()
    expect(globalThis.solid.session.login).not.toHaveBeenCalled()
    expect(result.isLoggedIn).toBe(true)
  })

  test('uses default client name when not provided', async () => {
    await ur.solidLogin({ oidcIssuer: 'https://idp.example.com', redirectUrl: 'https://app.com/' })
    expect(globalThis.solid.session.login.mock.calls[0][0].clientName).toBe('twinpod-client')
  })

  test('throws when session is not initialized', async () => {
    delete globalThis.solid
    await expect(ur.solidLogin()).rejects.toThrow('TwinPod session not initialized')
  })
})

describe('ur.handleLoginRedirect', () => {
  test('calls session.handleIncomingRedirect with restorePreviousSession: true', async () => {
    await ur.handleLoginRedirect()
    expect(globalThis.solid.session.handleIncomingRedirect).toHaveBeenCalledTimes(1)
    expect(globalThis.solid.session.handleIncomingRedirect.mock.calls[0][0].restorePreviousSession).toBe(true)
  })
})

describe('ur.logoutApp', () => {
  test('calls session.logout with logoutType: app', async () => {
    await ur.logoutApp()
    expect(globalThis.solid.session.logout).toHaveBeenCalledWith({ logoutType: 'app' })
  })

  test('returns without error when session is not initialized', async () => {
    delete globalThis.solid
    await expect(ur.logoutApp()).resolves.toBeUndefined()
    globalThis.solid = { session: makeSession() }
  })
})

describe('ur.logoutIdp', () => {
  test('calls session.logout with logoutType: idp and default state', async () => {
    await ur.logoutIdp()
    expect(globalThis.solid.session.logout).toHaveBeenCalledWith({ logoutType: 'idp', state: 'post-logout' })
  })

  test('accepts a custom state string', async () => {
    await ur.logoutIdp('custom-state')
    expect(globalThis.solid.session.logout).toHaveBeenCalledWith({ logoutType: 'idp', state: 'custom-state' })
  })
})
