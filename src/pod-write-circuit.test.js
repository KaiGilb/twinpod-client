import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./rdfStore.js', () => {
  const mockStore = { statementsMatching: vi.fn(() => []), sym: vi.fn((u) => ({ value: u })) }
  return {
    rdfStore: mockStore,
    tempRdfStore: mockStore,
    $rdf: { graph: vi.fn(() => mockStore), sym: vi.fn(), parse: vi.fn() },
    rdfFetcher: { load: vi.fn() },
    rdfUpdater: {},
    urisFetched: { value: [] },
    hyperFetch: vi.fn(),
    clearTempRdfStore: vi.fn()
  }
})

import { ur } from './util-rdf.js'
import './pod-write-circuit.js'

beforeEach(() => {
  ur._resetPodWriteCircuitForTesting()
})

afterEach(() => {
  ur._resetPodWriteCircuitForTesting()
})

describe('pod-write-circuit', () => {
  test('401 and 403 are terminal; 0, 500, 404 are not', () => {
    expect(ur.isTerminalPodWriteStatus(401)).toBe(true)
    expect(ur.isTerminalPodWriteStatus(403)).toBe(true)
    expect(ur.isTerminalPodWriteStatus(0)).toBe(false)
    expect(ur.isTerminalPodWriteStatus(500)).toBe(false)
    expect(ur.isTerminalPodWriteStatus(404)).toBe(false)
  })

  test('trip on 403 opens the circuit; non-terminal does not', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ur.tripPodWriteCircuit(500, 'nope')).toBe(false)
    expect(ur.podWritesBlocked()).toBe(false)

    expect(ur.tripPodWriteCircuit(403, 'https://pod.example/x.json')).toBe(true)
    expect(ur.podWritesBlocked()).toBe(true)
    expect(ur.podWriteCircuitStatus()).toBe(403)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('reset closes the circuit', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ur.tripPodWriteCircuit(401, 'test')
    ur.resetPodWriteCircuit()
    expect(ur.podWritesBlocked()).toBe(false)
    expect(ur.podWriteCircuitStatus()).toBe(null)
  })
})
