// UNIT_TYPE=Hook

/**
 * WAC-Allow ACL helpers — attaches ur.parseWacAllow, ur.userCanRead, ur.userCanWrite,
 * ur.userCanEdit, ur.userCanControl, ur.isPublic.
 * All functions are pure — no rdfStore access.
 */
import { ur } from './util-rdf.js'

const emptyModes = () => ({
  read: false,
  write: false,
  append: false,
  control: false,
})

ur.parseWacAllow = function(headerValue) {
  const result = { user: emptyModes(), public: emptyModes() }
  if (!headerValue) return result

  for (const part of headerValue.split(',')) {
    const m = part.match(/^\s*(user|public)\s*=\s*"([^"]*)"\s*$/)
    if (!m) continue
    const who = m[1]
    for (const mode of m[2].split(/\s+/).filter(Boolean)) {
      if (mode in result[who]) result[who][mode] = true
    }
  }
  return result
}

ur.userCanRead    = (wac) => !!wac?.user?.read
ur.userCanWrite   = (wac) => !!(wac?.user?.write || wac?.user?.append)
ur.userCanEdit    = (wac) => !!wac?.user?.write
ur.userCanControl = (wac) => !!wac?.user?.control
ur.isPublic       = (wac) => !!wac?.public?.read
