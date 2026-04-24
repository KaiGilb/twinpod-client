import { describe, test, expect, vi, beforeEach } from 'vitest'

const { ur } = vi.hoisted(() => {
  const hyperFetch = vi.fn()
  const ur = {
    $rdf: {
      sym: (uri) => ({ termType: 'NamedNode', value: uri }),
      literal: (v, lang) => ({ termType: 'Literal', value: v, language: lang }),
      st: (s, p, o, g) => ({ subject: s, predicate: p, object: o, why: g }),
      serialize: vi.fn((sub, store, base, ct, cb) => cb(null, '<mock> a <Thing> .\n')),
    },
    rdfStore: {
      sym: (uri) => ({ termType: 'NamedNode', value: uri }),
      statementsMatching: vi.fn(() => []),
    },
    rdfUpdater: {
      update: vi.fn((del, ins, cb) => cb(null, true, null)),
    },
    hyperFetch,
  }
  return { ur }
})

vi.mock('./util-rdf.js', () => ({ ur }))

import './write.js'

const POD = 'https://tst-first.demo.systemtwin.com'
const SUBSTANCE = `${POD}/node/Substance`
const A_NOTE = 'https://neo.graphmetrix.net/node/a_note'

beforeEach(() => {
  ur.hyperFetch.mockReset()
  ur.$rdf.serialize.mockReset()
  ur.$rdf.serialize.mockImplementation((sub, store, base, ct, cb) => cb(null, '<mock> a <Thing> .\n'))
  ur.rdfStore.statementsMatching.mockReset()
  ur.rdfStore.statementsMatching.mockReturnValue([])
  ur.rdfUpdater.update.mockReset()
  ur.rdfUpdater.update.mockImplementation((del, ins, cb) => cb(null, true, null))
})

describe('ur.mintNodeUri', () => {
  test('returns a URI under {podRoot}/node/ with the default prefix', () => {
    const uri = ur.mintNodeUri(POD)
    expect(uri).toMatch(new RegExp(`^${POD}/node/t_\\d+_[a-z0-9]{4}$`))
  })

  test('strips a trailing slash from the pod root', () => {
    const uri = ur.mintNodeUri(POD + '/')
    expect(uri).toMatch(new RegExp(`^${POD}/node/t_\\d+_[a-z0-9]{4}$`))
  })

  test('honours a custom prefix', () => {
    const uri = ur.mintNodeUri(POD, 'note')
    expect(uri).toMatch(new RegExp(`^${POD}/node/note_\\d+_[a-z0-9]{4}$`))
  })

  test('produces distinct URIs across calls', () => {
    const a = ur.mintNodeUri(POD)
    const b = ur.mintNodeUri(POD)
    expect(a).not.toBe(b)
  })
})

describe('ur.patchInsert', () => {
  test('PATCHes the substance URL with application/sparql-update', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: true, status: 201 })
    const body = `INSERT DATA { <${POD}/node/t_x> a <${A_NOTE}> . }`
    await ur.patchInsert(SUBSTANCE, body)
    expect(ur.hyperFetch).toHaveBeenCalledTimes(1)
    const [url, init] = ur.hyperFetch.mock.calls[0]
    expect(url).toBe(SUBSTANCE)
    expect(init.method).toBe('PATCH')
    expect(init.headers['Content-Type']).toBe('application/sparql-update')
    expect(init.body).toBe(body)
  })

  test('returns the response on success', async () => {
    const response = { ok: true, status: 201 }
    ur.hyperFetch.mockResolvedValue(response)
    const result = await ur.patchInsert(SUBSTANCE, 'INSERT DATA { }')
    expect(result).toBe(response)
  })

  test('throws on a non-OK response', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: false, status: 403 })
    await expect(ur.patchInsert(SUBSTANCE, 'INSERT DATA { }'))
      .rejects.toThrow(/PATCH .* failed: 403/)
  })
})

describe('ur.createNeoNode', () => {
  test('mints a URI, PATCHes /node/Substance with INSERT DATA, and returns the URI', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: true, status: 201 })
    const uri = await ur.createNeoNode(POD, A_NOTE)
    expect(uri).toMatch(new RegExp(`^${POD}/node/t_\\d+_[a-z0-9]{4}$`))
    const [url, init] = ur.hyperFetch.mock.calls[0]
    expect(url).toBe(SUBSTANCE)
    expect(init.method).toBe('PATCH')
    expect(init.headers['Content-Type']).toBe('application/sparql-update')
    expect(init.body).toBe(`INSERT DATA { <${uri}> a <${A_NOTE}> . }`)
  })

  test('appends extraTriples into the INSERT DATA body', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: true, status: 201 })
    const extra = `<${POD}/node/t_x> <https://example.com/p> "v" .`
    const uri = await ur.createNeoNode(POD, A_NOTE, { extraTriples: extra })
    const body = ur.hyperFetch.mock.calls[0][1].body
    expect(body).toBe(`INSERT DATA { <${uri}> a <${A_NOTE}> . ${extra} }`)
  })

  test('honours a custom prefix', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: true, status: 201 })
    const uri = await ur.createNeoNode(POD, A_NOTE, { prefix: 'note' })
    expect(uri).toMatch(new RegExp(`^${POD}/node/note_\\d+_[a-z0-9]{4}$`))
  })

  test('handles a pod root with a trailing slash', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: true, status: 201 })
    const uri = await ur.createNeoNode(POD + '/', A_NOTE)
    expect(uri.startsWith(`${POD}/node/`)).toBe(true)
    expect(ur.hyperFetch.mock.calls[0][0]).toBe(SUBSTANCE)
  })

  test('propagates failure when the server returns non-OK', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(ur.createNeoNode(POD, A_NOTE)).rejects.toThrow(/PATCH .* failed: 500/)
  })
})

describe('ur.getBlankNode', () => {
  test('returns a new blank node with existed=false for a new label', () => {
    const result = ur.getBlankNode('Test: unique_label_' + Date.now())
    expect(result.existed).toBe(false)
    expect(result.node.value).toMatch(/^_:t\d+$/)
  })

  test('returns the same node with existed=true for a repeated label', () => {
    const label = 'Test: repeated_' + Date.now()
    const first = ur.getBlankNode(label)
    const second = ur.getBlankNode(label)
    expect(second.existed).toBe(true)
    expect(second.node.value).toBe(first.node.value)
  })

  test('increments blank node index across calls with different labels', () => {
    const a = ur.getBlankNode('Test: inc_a_' + Date.now())
    const b = ur.getBlankNode('Test: inc_b_' + Date.now())
    const indexA = parseInt(a.node.value.replace('_:t', ''))
    const indexB = parseInt(b.node.value.replace('_:t', ''))
    expect(indexB).toBeGreaterThan(indexA)
  })
})

describe('ur.storeToTurtle', () => {
  test('calls ur.$rdf.serialize with text/turtle and returns the result', () => {
    ur.$rdf.serialize.mockImplementation((sub, store, base, ct, cb) =>
      cb(null, '@prefix schema: <http://schema.org/> .\n'))
    const fakeStore = { statementsCount: 1 }
    const result = ur.storeToTurtle(fakeStore, 'https://pod.example.com')
    expect(ur.$rdf.serialize).toHaveBeenCalledTimes(1)
    expect(ur.$rdf.serialize.mock.calls[0][1]).toBe(fakeStore)
    expect(ur.$rdf.serialize.mock.calls[0][2]).toBe('https://pod.example.com')
    expect(ur.$rdf.serialize.mock.calls[0][3]).toBe('text/turtle')
    expect(result).toBe('@prefix schema: <http://schema.org/> .\n')
  })

  test('returns undefined when serialize produces an error', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    ur.$rdf.serialize.mockImplementation((sub, store, base, ct, cb) => cb('serialize error', undefined))
    const result = ur.storeToTurtle({}, '')
    expect(result).toBeUndefined()
    consoleSpy.mockRestore()
  })
})

describe('ur.modifyTurtle', () => {
  test('removes the default @prefix : <#> line', () => {
    const input = '@prefix : <#>.\n_:t1 a <https://neo.graphmetrix.net/node/a_paragraph> .\n'
    expect(ur.modifyTurtle(input)).not.toContain('@prefix : <#>')
  })

  test('fixes blank node angle brackets: <_:t1> → _:t1', () => {
    const result = ur.modifyTurtle('<_:t1> a <https://neo.graphmetrix.net/node/a_paragraph> .\n')
    expect(result).toContain('_:t1 a')
    expect(result).not.toContain('<_:t1>')
  })

  test('fixes URL encoding artifacts (%3C → <, %3E → >)', () => {
    expect(ur.modifyTurtle('<%3Chttp://example.com%3E> a <Thing> .\n')).toContain('<http://example.com>')
  })

  test('replaces %25 with %', () => {
    expect(ur.modifyTurtle('<http://example.com/foo%25bar> a <Thing> .\n')).toContain('foo%bar')
  })

  test('adds ^^xsd:dateTime to untyped ISO date literals', () => {
    expect(ur.modifyTurtle('"2024-01-15T10:30:00.000Z" .\n')).toContain('"2024-01-15T10:30:00.000Z"^^xsd:dateTime')
  })

  test('does not double-annotate an already-typed date literal', () => {
    const result = ur.modifyTurtle('"2024-01-15T10:30:00.000Z"^^xsd:dateTime .\n')
    expect((result.match(/\^\^xsd:dateTime/g) || []).length).toBe(1)
  })

  test('removes double-angle-bracket URI wrapping', () => {
    const result = ur.modifyTurtle('<< https://example.com/foo >> a <Thing> .\n')
    expect(result).toContain('<https://example.com/foo>')
    expect(result).not.toContain('<<')
  })

  test('collapses triple-quote artifacts', () => {
    expect(ur.modifyTurtle('"""hello""" .\n')).toContain('"hello"')
  })

  test('returns input unchanged when no fixes are needed', () => {
    const input = '_:t1 a <https://neo.graphmetrix.net/node/a_paragraph> .\n'
    expect(ur.modifyTurtle(input)).toBe(input)
  })
})

describe('ur.setValue', () => {
  test('calls rdfUpdater.update with the old statements deleted and new literal inserted', async () => {
    // Spec: ur.setValue — modify one triple via rdflib UpdateManager (write.js Stack A)
    const fakeOld = [{ subject: { value: 'x' } }]
    ur.rdfStore.statementsMatching.mockReturnValue(fakeOld)
    await ur.setValue('https://pod.example.com/t/doc1', 'https://pod.example.com/node/s1', 'http://schema.org/text', 'hello')
    expect(ur.rdfUpdater.update).toHaveBeenCalledTimes(1)
    const [deletions, insertions] = ur.rdfUpdater.update.mock.calls[0]
    expect(deletions).toBe(fakeOld)
    expect(insertions[0].object.value).toBe('hello')
  })

  test('creates a language-tagged literal when lang is provided', async () => {
    // Spec: ur.setValue — supports optional lang parameter for language-tagged literals
    ur.rdfStore.statementsMatching.mockReturnValue([])
    await ur.setValue('https://pod.example.com/t/doc1', 'https://pod.example.com/node/s1', 'http://schema.org/text', 'hello', { lang: 'en' })
    const insertions = ur.rdfUpdater.update.mock.calls[0][1]
    expect(insertions[0].object.language).toBe('en')
  })

  test('creates a named node when isLiteral is false', async () => {
    // Spec: ur.setValue — isLiteral=false creates a URI reference, not a literal
    ur.rdfStore.statementsMatching.mockReturnValue([])
    await ur.setValue('https://pod.example.com/t/doc1', 'https://pod.example.com/node/s1', 'http://schema.org/sameAs', 'https://other.example.com/node/x', { isLiteral: false })
    const insertions = ur.rdfUpdater.update.mock.calls[0][1]
    expect(insertions[0].object.termType).toBe('NamedNode')
    expect(insertions[0].object.value).toBe('https://other.example.com/node/x')
  })

  test('rejects when rdfUpdater.update reports failure', async () => {
    // Spec: ur.setValue — propagates update errors as rejected Promise
    ur.rdfStore.statementsMatching.mockReturnValue([])
    ur.rdfUpdater.update.mockImplementation((del, ins, cb) => cb(null, false, 'conflict'))
    await expect(
      ur.setValue('https://pod.example.com/t/doc1', 'https://pod.example.com/node/s1', 'http://schema.org/text', 'fail')
    ).rejects.toThrow('conflict')
  })
})

describe('ur.setValues', () => {
  test('calls rdfUpdater.update with batched deletions and insertions', async () => {
    // Spec: ur.setValues — batch-modify multiple triples in one PATCH (write.js Stack A)
    ur.rdfStore.statementsMatching.mockReturnValue([])
    await ur.setValues(
      'https://pod.example.com/t/doc1',
      'https://pod.example.com/node/s1',
      [
        { predicate: 'http://schema.org/text', value: 'a' },
        { predicate: 'http://schema.org/name', value: 'b' },
      ]
    )
    expect(ur.rdfUpdater.update).toHaveBeenCalledTimes(1)
    const [deletions, insertions] = ur.rdfUpdater.update.mock.calls[0]
    expect(insertions).toHaveLength(2)
    expect(insertions[0].object.value).toBe('a')
    expect(insertions[1].object.value).toBe('b')
  })

  test('rejects when the update fails', async () => {
    // Spec: ur.setValues — propagates update errors as rejected Promise
    ur.rdfStore.statementsMatching.mockReturnValue([])
    ur.rdfUpdater.update.mockImplementation((del, ins, cb) => cb(null, false, 'batch error'))
    await expect(
      ur.setValues('https://pod.example.com/t/doc1', 'https://pod.example.com/node/s1', [
        { predicate: 'http://schema.org/text', value: 'x' },
      ])
    ).rejects.toThrow('batch error')
  })
})

describe('ur.uploadImage', () => {
  test('PUTs the file to the target URL with the file MIME type as Content-Type', async () => {
    // Spec: ur.uploadImage — upload a binary to /home/ via ur.hyperFetch (write.js Stack C)
    const fakeFile = { type: 'image/png', size: 1024 }
    ur.hyperFetch.mockResolvedValue({ ok: true, status: 200 })
    const result = await ur.uploadImage('https://pod.example.com/home/photo.png', fakeFile)
    expect(ur.hyperFetch).toHaveBeenCalledTimes(1)
    const [url, init] = ur.hyperFetch.mock.calls[0]
    expect(url).toBe('https://pod.example.com/home/photo.png')
    expect(init.method).toBe('PUT')
    expect(init.headers['Content-Type']).toBe('image/png')
    expect(init.body).toBe(fakeFile)
    expect(result.ok).toBe(true)
  })

  test('throws when the server returns a non-OK response', async () => {
    // Spec: ur.uploadImage — propagates upload failure as thrown Error
    ur.hyperFetch.mockResolvedValue({ ok: false, status: 403 })
    await expect(
      ur.uploadImage('https://pod.example.com/home/photo.png', { type: 'image/jpeg' })
    ).rejects.toThrow('Upload failed: 403')
  })
})

describe('ur.uploadTurtleToResource', () => {
  test('sends PATCH with Content-Type: text/turtle and credentials: include', async () => {
    ur.hyperFetch.mockResolvedValue({ status: 201, headers: new Map() })
    await ur.uploadTurtleToResource('https://pod.example.com/t/t_note_1', '_:t1 a <Note> .')
    expect(ur.hyperFetch).toHaveBeenCalledTimes(1)
    const [url, init] = ur.hyperFetch.mock.calls[0]
    expect(url).toBe('https://pod.example.com/t/t_note_1')
    expect(init.method).toBe('PATCH')
    expect(init.headers['Content-Type']).toBe('text/turtle')
    expect(init.credentials).toBe('include')
  })

  test('returns true on HTTP 201', async () => {
    ur.hyperFetch.mockResolvedValue({ status: 201, headers: new Map() })
    expect(await ur.uploadTurtleToResource('https://pod.example.com/t/t_1', 'turtle')).toBe(true)
  })

  test('returns true on HTTP 200', async () => {
    ur.hyperFetch.mockResolvedValue({ status: 200, headers: new Map() })
    expect(await ur.uploadTurtleToResource('https://pod.example.com/t/t_1', 'turtle')).toBe(true)
  })

  test('returns false on HTTP 403', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    ur.hyperFetch.mockResolvedValue({ status: 403, headers: new Map() })
    expect(await ur.uploadTurtleToResource('https://pod.example.com/t/t_1', 'turtle')).toBe(false)
    consoleSpy.mockRestore()
  })

  test('returns false on HTTP 401', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    ur.hyperFetch.mockResolvedValue({ status: 401, headers: new Map() })
    expect(await ur.uploadTurtleToResource('https://pod.example.com/t/t_1', 'turtle')).toBe(false)
    consoleSpy.mockRestore()
  })

  test('returns false on network error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    ur.hyperFetch.mockRejectedValue(new Error('Network error'))
    expect(await ur.uploadTurtleToResource('https://pod.example.com/t/t_1', 'turtle')).toBe(false)
    consoleSpy.mockRestore()
  })

  test('returns { ok, status, locationUri } with returnResponse: true on success', async () => {
    const headers = new Headers({ 'Location': 'https://pod.example.com/t/t_1' })
    ur.hyperFetch.mockResolvedValue({ status: 201, headers })
    const result = await ur.uploadTurtleToResource('https://pod.example.com/t/t_1', 'turtle', { returnResponse: true })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(201)
    expect(result.locationUri).toBe('https://pod.example.com/t/t_1')
  })

  test('returns { ok: false } with returnResponse: true on failure', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    ur.hyperFetch.mockResolvedValue({ status: 500, headers: new Headers() })
    const result = await ur.uploadTurtleToResource('https://pod.example.com/t/t_1', 'turtle', { returnResponse: true })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    consoleSpy.mockRestore()
  })

  test('returns { ok: false, status: 0 } when URI is missing with returnResponse: true', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await ur.uploadTurtleToResource('', 'turtle', { returnResponse: true })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(ur.hyperFetch).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  test('returns false when URI is missing and returnResponse is not set', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await ur.uploadTurtleToResource('', 'turtle')).toBe(false)
    consoleSpy.mockRestore()
  })
})

describe('ur.deleteResource', () => {
  // Spec: ur.deleteResource — DELETE a resource via ur.hyperFetch (write.js Stack C)
  test('sends DELETE to the target URL', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: true, status: 204 })
    await ur.deleteResource('https://pod.example.com/t/t_note_1')
    expect(ur.hyperFetch).toHaveBeenCalledTimes(1)
    const [url, init] = ur.hyperFetch.mock.calls[0]
    expect(url).toBe('https://pod.example.com/t/t_note_1')
    expect(init.method).toBe('DELETE')
  })

  test('returns the response on success', async () => {
    const response = { ok: true, status: 204 }
    ur.hyperFetch.mockResolvedValue(response)
    const result = await ur.deleteResource('https://pod.example.com/t/t_note_1')
    expect(result).toBe(response)
  })

  test('treats 404 as success (resource already gone)', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: false, status: 404 })
    await expect(ur.deleteResource('https://pod.example.com/t/t_note_1')).resolves.toBeDefined()
  })

  test('throws when the server returns a non-OK status other than 404', async () => {
    ur.hyperFetch.mockResolvedValue({ ok: false, status: 403 })
    await expect(ur.deleteResource('https://pod.example.com/t/t_note_1'))
      .rejects.toThrow('Delete failed: 403')
  })
})
