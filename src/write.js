// UNIT_TYPE=Hook

/**
 * TwinPod write helpers (Stack A, B, C) — attaches ur.setValue, ur.setValues,
 * ur.uploadImage, ur.mintNodeUri, ur.patchInsert, ur.createNeoNode, ur.deleteResource,
 * ur.getBlankNode, ur.storeToTurtle, ur.modifyTurtle, ur.uploadTurtleToResource.
 * Uses ur.hyperFetch, ur.$rdf, ur.rdfStore, ur.rdfUpdater internally.
 */
import { ur } from './util-rdf.js'

ur.setValue = function(docUrl, subjectUri, predicateUri, newValue, {
  isLiteral = true,
  lang,
} = {}) {
  const why = ur.rdfStore.sym(docUrl)
  const subject = ur.rdfStore.sym(subjectUri)
  const predicate = typeof predicateUri === 'string' ? ur.rdfStore.sym(predicateUri) : predicateUri

  const oldStatements = ur.rdfStore.statementsMatching(subject, predicate, null, why)
  const newObject = isLiteral
    ? (lang ? ur.$rdf.literal(newValue, lang) : ur.$rdf.literal(newValue))
    : ur.rdfStore.sym(newValue)
  const newStatement = ur.$rdf.st(subject, predicate, newObject, why)

  return new Promise((resolve, reject) => {
    ur.rdfUpdater.update(oldStatements, [newStatement], (uri, ok, err) => {
      if (ok) resolve()
      else reject(new Error(err || 'update failed'))
    })
  })
}

ur.setValues = function(docUrl, subjectUri, updates) {
  const why = ur.rdfStore.sym(docUrl)
  const subject = ur.rdfStore.sym(subjectUri)

  const deletions = []
  const insertions = []
  for (const u of updates) {
    const predicate = typeof u.predicate === 'string' ? ur.rdfStore.sym(u.predicate) : u.predicate
    deletions.push(...ur.rdfStore.statementsMatching(subject, predicate, null, why))
    const obj = u.isLiteral !== false
      ? (u.lang ? ur.$rdf.literal(u.value, u.lang) : ur.$rdf.literal(u.value))
      : ur.rdfStore.sym(u.value)
    insertions.push(ur.$rdf.st(subject, predicate, obj, why))
  }

  return new Promise((resolve, reject) => {
    ur.rdfUpdater.update(deletions, insertions, (uri, ok, err) => {
      if (ok) resolve()
      else reject(new Error(err || 'update failed'))
    })
  })
}

ur.uploadImage = async function(targetUrl, file) {
  const res = await ur.hyperFetch(targetUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res
}

ur.mintNodeUri = function(podRoot, prefix = 't') {
  const root = podRoot.endsWith('/') ? podRoot.slice(0, -1) : podRoot
  const rand = Math.random().toString(36).slice(2, 6)
  return `${root}/node/${prefix}_${Date.now()}_${rand}`
}

ur.patchInsert = async function(substanceUrl, sparqlUpdateBody) {
  const res = await ur.hyperFetch(substanceUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/sparql-update' },
    body: sparqlUpdateBody,
  })
  if (!res.ok) throw new Error(`PATCH ${substanceUrl} failed: ${res.status}`)
  return res
}

ur.createNeoNode = async function(podRoot, typeUri, { extraTriples = '', prefix = 't' } = {}) {
  const root = podRoot.endsWith('/') ? podRoot.slice(0, -1) : podRoot
  const uri = ur.mintNodeUri(root, prefix)
  const triples = extraTriples ? ` ${extraTriples}` : ''
  const body = `INSERT DATA { <${uri}> a <${typeUri}> .${triples} }`
  await ur.patchInsert(`${root}/node/Substance`, body)
  return uri
}

ur.deleteResource = async function(url) {
  const res = await ur.hyperFetch(url, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed: ${res.status}`)
  return res
}

// Stack B — rdflib build → serialize → modifyTurtle → PATCH text/turtle
// Canonical body: Template_Code_TwinPod_Turtle_Creation.txt

let blankNodeIndex = 0
const blankNodeLabels = new Map()

ur.getBlankNode = function(label) {
  let tempBlank = ""
  blankNodeLabels.forEach((blank, existingLabel) => {
    if (existingLabel == label) {
      tempBlank = blank
    }
  })
  if (tempBlank == "") {
    blankNodeIndex += 1
    tempBlank = ur.$rdf.sym("_:t" + blankNodeIndex)
    blankNodeLabels.set(label, tempBlank)
    return { node: tempBlank, existed: false }
  }
  return { node: tempBlank, existed: true }
}

ur.storeToTurtle = function(store, baseUrl) {
  var result
  ur.$rdf.serialize(undefined, store, baseUrl, 'text/turtle', function(err, str) {
    if (err) console.log("Turtle serialize error: ", err)
    result = str
  })
  return result
}

function checkPrefixes(turt) {
  try {
    const lines = turt.split(/\r\n|\n/)
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes('@prefix')) {
        let prefix = lines[i].replace('@prefix ', '')
        prefix = prefix.substring(0, prefix.indexOf(':') + 1)
        const uri = lines[i].substring(lines[i].indexOf('<') + 1, lines[i].indexOf('>'))
        turt = turt.replaceAll(prefix + 'i ', '<' + uri + 'i> ')
        turt = turt.replaceAll(prefix + 'y_system', '<' + uri + 'y_system>')
        turt = turt.replaceAll(prefix + 'tag', '<' + uri + 'tag>')
      }
    }
    return turt
  } catch (error) {
    console.log(error)
    return turt
  }
}

ur.modifyTurtle = function(turt) {
  turt = turt.replaceAll('@prefix : <#>.\n', '')
  turt = turt.replace(/<(_:\w+)>/g, '$1')
  turt = turt.replace('<%3C', '<')
  turt = turt.replace('%3E>', '>')
  turt = turt.replaceAll('%25', '%')
  turt = turt.replace(/(>\s)\s+/g, '$1')
  turt = turt.replace(/([^\s])([;.])\n/g, '$1 $2\n')
  turt = turt.replaceAll('^^neo:a_matrix-3m"', '"^^neo:a_matrix-3m')
  turt = turt.replace(/(\n)\n/g, '$1')
  turt = turt.replace(/(m_polyline)\n\s+/g, '$1 ')
  turt = turt.replace(/([a-z]{3}:[A-Za-z_]+)\n\s+/g, '$1 ')
  turt = turt.replace(/("(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)")(?!\^\^)/g, '$1^^xsd:dateTime')
  turt = turt.replaceAll(/<<\s*(https?:\/\/[^<> \t\r\n]+)\s*>>/g, '<$1>')
  turt = turt.replaceAll(/<<\s*(_:t\d{1,5})>>/g, '<$1>')
  turt = turt.replaceAll('###', '')
  turt = turt.replaceAll('"""', '"')
  turt = turt.replaceAll('/""@', '"@')
  turt = turt.replaceAll('"^^<xsd:float>', '"^^xsd:float')
  turt = turt.replaceAll('"^^<xsd:integer>', '"^^xsd:integer')
  turt = checkPrefixes(turt)
  return turt
}

ur.uploadTurtleToResource = async function(uri, turtleBody, options = {}) {
  if (!uri) {
    console.log("ERROR: URI missing for resource. Update not possible.")
    return options.returnResponse
      ? { ok: false, status: 0, headers: null, locationUri: null, response: null }
      : false
  }

  let successfulFetch = false
  let response = null

  try {
    response = await ur.hyperFetch(uri, {
      method: options.method || 'PATCH',
      credentials: 'include',
      body: turtleBody,
      headers: { 'Content-Type': 'text/turtle' },
    })

    if (response.status === 200 || response.status === 201) {
      successfulFetch = true
    } else if (response.status === 401) {
      console.log('Error 401: session expired or app not authorized')
      successfulFetch = false
    } else {
      console.log('Error running fetch, got response', response.status)
      successfulFetch = false
    }
  } catch (error) {
    console.log('-- Error message below --')
    console.log(error)
    successfulFetch = false
  }

  if (options.returnResponse) {
    const locationUri =
      response?.headers?.get('Location') ||
      response?.headers?.get('Content-Location') ||
      null
    return {
      ok: successfulFetch,
      status: response?.status ?? 0,
      headers: response?.headers ?? null,
      locationUri,
      response,
    }
  }

  return successfulFetch
}
