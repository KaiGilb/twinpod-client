// UNIT_TYPE=Hook
//
// Reload-persistence regression suite (added by VATester, 2026-04-29).
//
// Covers the rdfStore.js change that fixes the "Cmd-R bounces back to login"
// failure mode in TwinPodLearn Cycle 1 Step 2. The root cause was that
// Inrupt's default `new Session()` uses `InMemoryStorage` for the *secure*
// slot (DPoP private key, refresh token, isLoggedIn). Without persisting
// that slot, every page reload wipes the credentials needed for
// `restorePreviousSession: true` to drive a silent re-authentication.
//
// rdfStore.js now constructs `new Session({ secureStorage, insecureStorage })`
// with a localStorage-backed IStorage as both. This file pins that contract.
//
// Spec: 4Sol.S.SessionLifecycleStore (vehicle-level reload-restore behaviour)
//       Reference_Code_TwinPod-Auth.md § "Restoring sessions on reload"
//
// What the existing rdfStore.test.js does NOT cover:
//   - The constructor arguments to `new Session(...)` (its mock just stubs
//     the class). If a future refactor drops the storage wiring, the
//     existing tests would still pass while the runtime regression
//     re-emerges silently.
//   - The shape contract of the IStorage backing — Inrupt depends on
//     `=== undefined` checks for missing keys, so returning `null` would
//     break the fallback logic.

import { describe, test, expect, vi, beforeEach } from 'vitest'

// Capture the args passed to `new Session(...)` so we can assert on the
// storage objects rdfStore.js wires in.
const SessionMock = vi.fn(function (opts) {
  this.__opts = opts
  this.info = { isLoggedIn: false }
  this.fetch = vi.fn()
})

// Window stub installed BEFORE rdfStore.js evaluates. We need a real
// localStorage shape because rdfStore.js's IStorage closure calls
// window.localStorage.{getItem,setItem,removeItem}.
const fakeLocalStorageBacking = new Map()
vi.hoisted(() => {
  globalThis.window = {
    location: { origin: 'http://localhost:5199' },
    solid: null,
    solidFetcher: null,
    localStorage: {
      getItem: (k) => (fakeLocalStorageBacking.has(k) ? fakeLocalStorageBacking.get(k) : null),
      setItem: (k, v) => { fakeLocalStorageBacking.set(k, String(v)) },
      removeItem: (k) => { fakeLocalStorageBacking.delete(k) }
    }
  }
})

vi.mock('@inrupt/solid-client-authn-browser', () => ({
  Session: SessionMock,
  InMemoryStorage: class InMemoryStorage {}
}))

vi.mock('rdflib', () => ({
  graph: vi.fn(() => ({})),
  Fetcher: vi.fn(function () { this.load = vi.fn() }),
  UpdateManager: vi.fn(function () {})
}))

vi.mock('vue', () => ({
  ref: vi.fn((v) => ({ value: v }))
}))

beforeEach(() => {
  fakeLocalStorageBacking.clear()
  SessionMock.mockClear()
  // Re-import rdfStore.js for each test so the constructor runs fresh.
  vi.resetModules()
})

describe('rdfStore.js — Session is constructed with persistent storage (reload-restore contract)', () => {
  test('passes a non-null secureStorage to new Session(...)', async () => {
    await import('./rdfStore.js')
    expect(SessionMock).toHaveBeenCalledTimes(1)
    const opts = SessionMock.mock.calls[0][0]
    expect(opts).toBeDefined()
    expect(opts.secureStorage).toBeDefined()
    expect(opts.secureStorage).not.toBeNull()
  })

  test('passes a non-null insecureStorage to new Session(...)', async () => {
    await import('./rdfStore.js')
    const opts = SessionMock.mock.calls[0][0]
    expect(opts.insecureStorage).toBeDefined()
    expect(opts.insecureStorage).not.toBeNull()
  })

  test('secureStorage and insecureStorage both expose the IStorage shape (get/set/delete)', async () => {
    await import('./rdfStore.js')
    const { secureStorage, insecureStorage } = SessionMock.mock.calls[0][0]
    for (const storage of [secureStorage, insecureStorage]) {
      expect(typeof storage.get).toBe('function')
      expect(typeof storage.set).toBe('function')
      expect(typeof storage.delete).toBe('function')
    }
  })

  test('storage.get returns undefined (NOT null) for missing keys — Inrupt depends on === undefined', async () => {
    await import('./rdfStore.js')
    const { secureStorage } = SessionMock.mock.calls[0][0]
    const result = await secureStorage.get('definitely-not-set')
    // Inrupt's StorageUtility uses `value === undefined` checks (see
    // sessionInfoManager.get()). Returning `null` here would break the
    // missing-key fallback path and lead to subtle session-restore bugs.
    expect(result).toBeUndefined()
  })

  test('storage.set then storage.get round-trips a value through window.localStorage', async () => {
    await import('./rdfStore.js')
    const { secureStorage } = SessionMock.mock.calls[0][0]
    await secureStorage.set('foo', 'bar')
    expect(window.localStorage.getItem('foo')).toBe('bar')
    const got = await secureStorage.get('foo')
    expect(got).toBe('bar')
  })

  test('storage.delete removes the key from window.localStorage', async () => {
    await import('./rdfStore.js')
    const { secureStorage } = SessionMock.mock.calls[0][0]
    await secureStorage.set('foo', 'bar')
    expect(window.localStorage.getItem('foo')).toBe('bar')
    await secureStorage.delete('foo')
    expect(window.localStorage.getItem('foo')).toBeNull()
    expect(await secureStorage.get('foo')).toBeUndefined()
  })

  test('storage operations are async — return Promises (per IStorage contract)', async () => {
    await import('./rdfStore.js')
    const { secureStorage } = SessionMock.mock.calls[0][0]
    expect(secureStorage.get('x')).toBeInstanceOf(Promise)
    expect(secureStorage.set('x', 'y')).toBeInstanceOf(Promise)
    expect(secureStorage.delete('x')).toBeInstanceOf(Promise)
  })

  test('Session is installed at window.solid.session', async () => {
    await import('./rdfStore.js')
    expect(window.solid).toBeDefined()
    expect(window.solid.session).toBeDefined()
    expect(window.solid.session).toBe(SessionMock.mock.instances[0])
  })
})
