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
import './save-queue.js'

beforeEach(() => {
  ur._resetSaveQueueForTesting()
})

afterEach(() => {
  ur._resetSaveQueueForTesting()
})

describe('save-queue circuit and consecutive-failure pause', () => {
  test('pauses a resourceKey after 3 consecutive task failures — 4th enqueue does not run the task', async () => {
    const events = []
    ur.onSaveEvent((e) => events.push(e.type + ':' + e.label))
    const task = vi.fn(async () => { throw new Error('nope') })

    ur.enqueueSave({ resourceKey: 'https://pod/a.json', task, label: 'one' })
    ur.enqueueSave({ resourceKey: 'https://pod/a.json', task, label: 'two' })
    ur.enqueueSave({ resourceKey: 'https://pod/a.json', task, label: 'three' })
    await new Promise((r) => setTimeout(r, 20))
    expect(task).toHaveBeenCalledTimes(3)

    ur.enqueueSave({ resourceKey: 'https://pod/a.json', task, label: 'four' })
    await new Promise((r) => setTimeout(r, 20))
    expect(task).toHaveBeenCalledTimes(3)
    expect(events.some((e) => e.startsWith('failed:four'))).toBe(true)
  })

  test('open circuit fail-fasts enqueueSave without running the task', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ur.tripPodWriteCircuit(403, 'test')
    const task = vi.fn(async () => ({ ok: true }))
    const events = []
    ur.onSaveEvent((e) => events.push(e.type))
    ur.enqueueSave({ resourceKey: 'https://pod/b.json', task, label: 'blocked' })
    await new Promise((r) => setTimeout(r, 10))
    expect(task).not.toHaveBeenCalled()
    expect(events).toEqual(['queued', 'started', 'failed'])
  })

  test('resetPodWriteCircuit unpauses so a later enqueue runs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const task = vi.fn(async () => { throw new Error('nope') })
    ur.enqueueSave({ resourceKey: 'https://pod/c.json', task, label: 'a' })
    ur.enqueueSave({ resourceKey: 'https://pod/c.json', task, label: 'b' })
    ur.enqueueSave({ resourceKey: 'https://pod/c.json', task, label: 'c' })
    await new Promise((r) => setTimeout(r, 20))

    ur.resetPodWriteCircuit()
    const okTask = vi.fn(async () => ({ ok: true }))
    ur.enqueueSave({ resourceKey: 'https://pod/c.json', task: okTask, label: 'd' })
    await new Promise((r) => setTimeout(r, 20))
    expect(okTask).toHaveBeenCalledTimes(1)
  })
})
