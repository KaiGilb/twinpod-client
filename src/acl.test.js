import { describe, test, expect, vi } from 'vitest'

vi.mock('./util-rdf.js', () => ({ ur: {} }))

import { ur } from './util-rdf.js'
import './acl.js'

describe('ur.parseWacAllow', () => {
  test('parses user read+write and public read', () => {
    const wac = ur.parseWacAllow('user="read write", public="read"')
    expect(wac.user.read).toBe(true)
    expect(wac.user.write).toBe(true)
    expect(wac.user.append).toBe(false)
    expect(wac.user.control).toBe(false)
    expect(wac.public.read).toBe(true)
    expect(wac.public.write).toBe(false)
  })

  test('parses all user modes', () => {
    const wac = ur.parseWacAllow('user="read write append control"')
    expect(wac.user.read).toBe(true)
    expect(wac.user.write).toBe(true)
    expect(wac.user.append).toBe(true)
    expect(wac.user.control).toBe(true)
  })

  test('returns all-false modes for null/empty input', () => {
    expect(ur.parseWacAllow(null).user.read).toBe(false)
    expect(ur.parseWacAllow('').user.read).toBe(false)
    expect(ur.parseWacAllow(undefined).public.read).toBe(false)
  })

  test('ignores unrecognised modes', () => {
    const wac = ur.parseWacAllow('user="read banana"')
    expect(wac.user.read).toBe(true)
    expect(wac.user.write).toBe(false)
  })

  test('handles spaces around parts', () => {
    const wac = ur.parseWacAllow('  user="read" ,  public="write"  ')
    expect(wac.user.read).toBe(true)
    expect(wac.public.write).toBe(true)
  })
})

describe('ur ACL convenience helpers', () => {
  const full = ur.parseWacAllow('user="read write append control", public="read"')
  const none = ur.parseWacAllow('')

  test('ur.userCanRead', () => {
    expect(ur.userCanRead(full)).toBe(true)
    expect(ur.userCanRead(none)).toBe(false)
  })

  test('ur.userCanWrite returns true for write or append', () => {
    expect(ur.userCanWrite(full)).toBe(true)
    const appendOnly = ur.parseWacAllow('user="append"')
    expect(ur.userCanWrite(appendOnly)).toBe(true)
    expect(ur.userCanWrite(none)).toBe(false)
  })

  test('ur.userCanEdit requires write (not just append)', () => {
    expect(ur.userCanEdit(full)).toBe(true)
    const appendOnly = ur.parseWacAllow('user="append"')
    expect(ur.userCanEdit(appendOnly)).toBe(false)
  })

  test('ur.userCanControl', () => {
    expect(ur.userCanControl(full)).toBe(true)
    expect(ur.userCanControl(none)).toBe(false)
  })

  test('ur.isPublic', () => {
    expect(ur.isPublic(full)).toBe(true)
    expect(ur.isPublic(none)).toBe(false)
  })

  test('helpers handle null/undefined wac gracefully', () => {
    expect(ur.userCanRead(null)).toBe(false)
    expect(ur.userCanWrite(undefined)).toBe(false)
    expect(ur.isPublic(null)).toBe(false)
  })
})
