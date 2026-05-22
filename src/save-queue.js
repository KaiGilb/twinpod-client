// UNIT_TYPE=Hook
//
// save-queue — framework-agnostic background-save scheduler attached to the
// shared `ur` namespace. Underpins the optimistic-UI save pattern (see
// Reference_Code_TwinPod-OptimisticSaveQueue.md).
//
// Why this lives in the client package, not in a Vue composable:
//   The queue itself has no Vue dependency — it's a FIFO + event emitter.
//   Multiple Vue (or non-Vue) consumers in the same app subscribe to the
//   same events; a single global queue means there is one source of truth
//   for "what saves are in flight" regardless of how many composables /
//   components are observing.
//
// Concurrency model — per-resource serialisation:
//   Tasks targeting the SAME `resourceKey` are run serially in FIFO order.
//   Tasks targeting DIFFERENT keys run in parallel. This protects the
//   5-step entity-update lifecycle (fetch → end-State → PATCH) against
//   races: if two saves touch the same WebID doc, the second only starts
//   after the first finishes so its STEP-1 fetch sees the result of the
//   first save's STEP-5 PATCH.
//
// Public API (attached to `ur`):
//   ur.enqueueSave({ resourceKey, task, label }) → id
//   ur.onSaveEvent(fn) → unsubscribe()
//   ur._resetSaveQueueForTesting()   (test-only)
//
// Event shape:
//   { type, id, resourceKey, label, queueDepth?, result?, error? }
//   types: 'queued' | 'started' | 'succeeded' | 'failed'

import { ur } from './util-rdf.js'

const _queues = new Map()    // resourceKey → { running: boolean, items: [{id, task, label}] }
const _listeners = new Set()
let _jobIdCounter = 0

function _emit(event) {
  for (const fn of _listeners) {
    try { fn(event) } catch (e) { console.warn('[save-queue] listener threw', e?.message || e) }
  }
}

/**
 * Subscribe to save lifecycle events from anywhere in the app. Returns an
 * unsubscribe function. Listener is invoked with one of:
 *
 *   { type: 'queued',    id, resourceKey, label, queueDepth }
 *   { type: 'started',   id, resourceKey, label }
 *   { type: 'succeeded', id, resourceKey, label, result }
 *   { type: 'failed',    id, resourceKey, label, error  }
 *
 * Listener errors are swallowed (logged via console.warn) so a single broken
 * subscriber cannot block the queue.
 */
ur.onSaveEvent = function (fn) {
  if (typeof fn !== 'function') throw new Error('onSaveEvent: listener must be a function')
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

/**
 * Enqueue a save task. Returns a unique job id (string) the caller can use
 * to correlate event callbacks.
 *
 * @param {object} opts
 * @param {string} opts.resourceKey  Resource URI under which to serialise
 *                                   (typically `<podRoot>i` for profile-doc
 *                                   writes, or the photo URI for a binary).
 * @param {() => Promise<any>} opts.task  Async function performing the save.
 *                                        Anything it returns is forwarded as
 *                                        `result` on the 'succeeded' event.
 * @param {string} [opts.label]      Human-readable label ('profile-save',
 *                                   'photo-upload', etc.). Surfaces in UI.
 * @returns {string}
 */
ur.enqueueSave = function ({ resourceKey, task, label = 'save' } = {}) {
  if (!resourceKey) throw new Error('enqueueSave: resourceKey required')
  if (typeof task !== 'function') throw new Error('enqueueSave: task must be a function')

  const id = `save-${++_jobIdCounter}-${Date.now()}`
  let q = _queues.get(resourceKey)
  if (!q) {
    q = { running: false, items: [] }
    _queues.set(resourceKey, q)
  }
  q.items.push({ id, task, label })
  _emit({ type: 'queued', id, resourceKey, label, queueDepth: q.items.length })
  _drain(resourceKey)
  return id
}

async function _drain(resourceKey) {
  const q = _queues.get(resourceKey)
  if (!q || q.running || q.items.length === 0) return
  q.running = true
  try {
    while (q.items.length > 0) {
      const { id, task, label } = q.items.shift()
      _emit({ type: 'started', id, resourceKey, label })
      try {
        const result = await task()
        _emit({ type: 'succeeded', id, resourceKey, label, result })
      } catch (error) {
        _emit({ type: 'failed', id, resourceKey, label, error })
      }
    }
  } finally {
    q.running = false
  }
}

/**
 * Test-only helper — drops all queues, all listeners, and resets the id
 * counter. NEVER call this from app code.
 */
ur._resetSaveQueueForTesting = function () {
  _queues.clear()
  _listeners.clear()
  _jobIdCounter = 0
}

export {}
